import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SidecarContext } from "./types";

export type VirtualFileEncoding = "utf8" | "base64";

export interface VirtualFile {
	/** Absolute path on disk */
	path: string;
	/** Relative path from workspace root (using POSIX slashes) */
	relativePath: string;
	/** In-memory content */
	content: string;
	encoding: VirtualFileEncoding;
	size: number;
	hash: string;
	originalHash: string;
	created: boolean;
	dirty: boolean;
	deleted: boolean;
	language?: string;
	mtimeMs?: number;
}

export interface SelectedLines {
	startLine: number;
	endLine: number;
}

export interface VirtualWorkspace {
	id: string;
	rootPath: string;
	files: Map<string, VirtualFile>;
	activeFilePath?: string;
	selectedLines?: SelectedLines;
	openFiles: string[];
	dirtyFiles: string[];
	deletedFiles: string[];
	fileTree: string;
	stackHints: string[];
	previewErrors: string[];
	lastBuildStatus?: "idle" | "running" | "success" | "failed";
	packageScripts?: string[];
	createdAt: string;
	updatedAt: string;
}

export interface PushFileReport {
	path: string;
	relativePath: string;
	action: "created" | "updated" | "deleted" | "skipped" | "conflict";
	reason?: string;
}

export interface PushResult {
	ok: boolean;
	backupPath?: string;
	files: PushFileReport[];
	createdAt: string;
}

const IGNORED_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".next",
	".nuxt",
	".output",
	".vercel",
	".cache",
	".turbo",
	".parcel-cache",
	"vendor",
	"target",
	"obj",
	"bin",
	"__pycache__",
	".venv",
	"venv",
	"env",
	".idea",
	".vscode",
	".zeck-backups",
	"tmp",
	"temp",
]);

const MAX_TEXT_FILE_BYTES = 1024 * 1024; // 1MB max per file in-memory

function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function normalizePath(p: string): string {
	return p.replaceAll("\\", "/");
}

export function detectLanguage(filePath: string): string | undefined {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case ".ts":
		case ".tsx":
			return "typescript";
		case ".js":
		case ".jsx":
		case ".mjs":
		case ".cjs":
			return "javascript";
		case ".py":
			return "python";
		case ".go":
			return "go";
		case ".php":
			return "php";
		case ".rb":
			return "ruby";
		case ".java":
			return "java";
		case ".kt":
			return "kotlin";
		case ".cs":
			return "csharp";
		case ".rs":
			return "rust";
		case ".ex":
		case ".exs":
			return "elixir";
		case ".sql":
			return "sql";
		case ".json":
			return "json";
		case ".md":
			return "markdown";
		case ".html":
			return "html";
		case ".css":
			return "css";
		case ".scss":
			return "scss";
		default:
			return undefined;
	}
}

async function scanDirectory(
	rootPath: string,
	currentDir: string,
	files: Map<string, VirtualFile>,
): Promise<void> {
	let entries: Array<import("node:fs").Dirent>;
	try {
		entries = await fs.readdir(currentDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const fullPath = path.join(currentDir, entry.name);
		const normalized = normalizePath(fullPath);

		if (entry.isDirectory()) {
			if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".zeck-")) {
				continue;
			}
			await scanDirectory(rootPath, fullPath, files);
			continue;
		}

		if (!entry.isFile()) continue;

		const relativePath = normalizePath(path.relative(rootPath, fullPath));

		try {
			const stat = await fs.stat(fullPath);
			if (stat.size > MAX_TEXT_FILE_BYTES) {
				continue;
			}

			const content = await fs.readFile(fullPath, "utf8");
			const hash = hashContent(content);

			const file: VirtualFile = {
				path: normalized,
				relativePath,
				content,
				encoding: "utf8",
				size: stat.size,
				hash,
				originalHash: hash,
				created: false,
				dirty: false,
				deleted: false,
				language: detectLanguage(fullPath),
				mtimeMs: stat.mtimeMs,
			};

			files.set(normalized, file);
		} catch {
			// Skip unreadable files
		}
	}
}

export function buildFileTree(files: Map<string, VirtualFile>): string {
	const paths = Array.from(files.values())
		.filter((f) => !f.deleted)
		.map((f) => f.relativePath)
		.sort();

	const lines: string[] = [];
	for (const p of paths.slice(0, 150)) {
		lines.push(p);
	}
	if (paths.length > 150) {
		lines.push(`... and ${paths.length - 150} more files`);
	}
	return lines.join("\n");
}

export function detectStackHints(files: Map<string, VirtualFile>): string[] {
	const hints = new Set<string>();
	const hasFile = (name: string) =>
		Array.from(files.values()).some((f) => f.relativePath === name && !f.deleted);

	if (hasFile("package.json")) hints.add("Node.js");
	if (hasFile("next.config.js") || hasFile("next.config.mjs") || hasFile("next.config.ts")) hints.add("Next.js");
	if (hasFile("vite.config.ts") || hasFile("vite.config.js")) hints.add("Vite");
	if (hasFile("remix.config.js")) hints.add("Remix");
	if (hasFile("requirements.txt") || hasFile("pyproject.toml")) hints.add("Python");
	if (hasFile("go.mod")) hints.add("Go");
	if (hasFile("composer.json")) hints.add("PHP");
	if (hasFile("Gemfile")) hints.add("Ruby");
	if (hasFile("pom.xml") || hasFile("build.gradle")) hints.add("Java");
	if (hasFile("Cargo.toml")) hints.add("Rust");
	if (hasFile("mix.exs")) hints.add("Elixir");
	if (hasFile("supabase/config.toml")) hints.add("Supabase");
	if (hasFile("tailwind.config.js") || hasFile("tailwind.config.ts")) hints.add("Tailwind");

	return Array.from(hints);
}

export async function importLocalProject(rootPath: string): Promise<VirtualWorkspace> {
	const resolvedRoot = normalizePath(path.resolve(rootPath));
	const files = new Map<string, VirtualFile>();

	await scanDirectory(resolvedRoot, resolvedRoot, files);

	const now = new Date().toISOString();
	return {
		id: resolvedRoot,
		rootPath: resolvedRoot,
		files,
		openFiles: [],
		dirtyFiles: [],
		deletedFiles: [],
		fileTree: buildFileTree(files),
		stackHints: detectStackHints(files),
		previewErrors: [],
		createdAt: now,
		updatedAt: now,
	};
}

export async function getOrImportWorkspace(
	ctx: SidecarContext,
	rootPath: string,
): Promise<VirtualWorkspace> {
	const normalizedRoot = normalizePath(path.resolve(rootPath));
	if (!ctx.virtualWorkspaces) {
		ctx.virtualWorkspaces = new Map();
	}

	let ws = ctx.virtualWorkspaces.get(normalizedRoot);
	if (!ws) {
		ws = await importLocalProject(normalizedRoot);
		ctx.virtualWorkspaces.set(normalizedRoot, ws);
	}
	return ws;
}

export function buildCodePanelContext(workspace: VirtualWorkspace): string {
	const dirtyFiles = Array.from(workspace.files.values())
		.filter((f) => f.dirty && !f.deleted)
		.map((f) => f.relativePath);

	const deletedFiles = Array.from(workspace.files.values())
		.filter((f) => f.deleted)
		.map((f) => f.relativePath);

	const sections: string[] = [];

	if (workspace.stackHints.length > 0) {
		sections.push(`Stack: ${workspace.stackHints.join(", ")}`);
	}

	if (dirtyFiles.length > 0) {
		sections.push(`Modified (in-memory, unpushed): \n${dirtyFiles.map((d) => `- ${d}`).join("\n")}`);
	}

	if (deletedFiles.length > 0) {
		sections.push(`Deleted (in-memory): \n${deletedFiles.map((d) => `- ${d}`).join("\n")}`);
	}

	if (workspace.activeFilePath) {
		const active = workspace.files.get(workspace.activeFilePath);
		if (active && !active.deleted && active.content) {
			const lines = active.content.split("\n");
			const previewLines = lines.slice(0, 100).join("\n");
			sections.push(
				`Active File: ${active.relativePath}\n\`\`\`${active.language || ""}\n${previewLines}${
					lines.length > 100 ? "\n... [truncated]" : ""
				}\n\`\`\``,
			);
		}
	}

	if (workspace.previewErrors.length > 0) {
		sections.push(`Preview Errors:\n${workspace.previewErrors.map((e) => `- ${e}`).join("\n")}`);
	}

	sections.push(`Virtual Workspace File Tree:\n${workspace.fileTree}`);

	return sections.join("\n\n");
}

export function readVirtualFile(workspace: VirtualWorkspace, targetPath: string): string {
	const normalized = normalizePath(path.isAbsolute(targetPath) ? targetPath : path.join(workspace.rootPath, targetPath));
	const file = workspace.files.get(normalized);
	if (!file || file.deleted) {
		throw new Error(`File not found in virtual workspace: ${targetPath}`);
	}
	return file.content;
}

export function writeVirtualFile(
	workspace: VirtualWorkspace,
	targetPath: string,
	content: string,
): { path: string; dirty: boolean; size: number } {
	const normalized = normalizePath(path.isAbsolute(targetPath) ? targetPath : path.join(workspace.rootPath, targetPath));
	const relativePath = normalizePath(path.relative(workspace.rootPath, normalized));
	const existing = workspace.files.get(normalized);
	const hash = hashContent(content);

	if (existing) {
		existing.content = content;
		existing.size = Buffer.byteLength(content, "utf8");
		existing.hash = hash;
		existing.dirty = hash !== existing.originalHash;
		existing.deleted = false;
	} else {
		workspace.files.set(normalized, {
			path: normalized,
			relativePath,
			content,
			encoding: "utf8",
			size: Buffer.byteLength(content, "utf8"),
			hash,
			originalHash: "",
			created: true,
			dirty: true,
			deleted: false,
			language: detectLanguage(normalized),
		});
	}

	workspace.dirtyFiles = Array.from(workspace.files.values())
		.filter((f) => f.dirty && !f.deleted)
		.map((f) => f.path);
	workspace.updatedAt = new Date().toISOString();

	return {
		path: relativePath,
		dirty: true,
		size: Buffer.byteLength(content, "utf8"),
	};
}

export function replaceInVirtualFile(
	workspace: VirtualWorkspace,
	targetPath: string,
	oldText: string,
	newText: string,
): { path: string; dirty: boolean } {
	const normalized = normalizePath(path.isAbsolute(targetPath) ? targetPath : path.join(workspace.rootPath, targetPath));
	const file = workspace.files.get(normalized);
	if (!file || file.deleted) {
		throw new Error(`File not found in virtual workspace: ${targetPath}`);
	}

	const parts = file.content.split(oldText);
	if (parts.length === 1) {
		throw new Error(`old_text was not found in ${file.relativePath}. Ensure exact matching lines.`);
	}
	if (parts.length > 2) {
		throw new Error(`old_text matched ${parts.length - 1} locations in ${file.relativePath}. Use a more specific anchor.`);
	}

	const updated = parts.join(newText);
	writeVirtualFile(workspace, normalized, updated);

	return {
		path: file.relativePath,
		dirty: true,
	};
}

export function deleteVirtualFile(
	workspace: VirtualWorkspace,
	targetPath: string,
): { path: string; deleted: boolean } {
	const normalized = normalizePath(path.isAbsolute(targetPath) ? targetPath : path.join(workspace.rootPath, targetPath));
	const file = workspace.files.get(normalized);
	if (!file) {
		throw new Error(`File not found to delete: ${targetPath}`);
	}

	file.deleted = true;
	file.dirty = true;
	workspace.dirtyFiles = Array.from(workspace.files.values())
		.filter((f) => f.dirty && !f.deleted)
		.map((f) => f.path);
	workspace.deletedFiles = Array.from(workspace.files.values())
		.filter((f) => f.deleted)
		.map((f) => f.path);
	workspace.updatedAt = new Date().toISOString();

	return {
		path: file.relativePath,
		deleted: true,
	};
}

export async function pushVirtualWorkspaceToDisk(
	workspace: VirtualWorkspace,
	options?: { createBackup?: boolean; backupDir?: string },
): Promise<PushResult> {
	const files: PushFileReport[] = [];
	const changedFiles = Array.from(workspace.files.values()).filter(
		(f) => f.dirty || f.created || f.deleted,
	);

	if (changedFiles.length === 0) {
		return {
			ok: true,
			files,
			createdAt: new Date().toISOString(),
		};
	}

	let backupPath: string | undefined;
	if (options?.createBackup !== false) {
		backupPath =
			options?.backupDir ??
			path.join(workspace.rootPath, ".zeck-backups", Date.now().toString());
		await fs.mkdir(backupPath, { recursive: true });
	}

	for (const file of changedFiles) {
		try {
			if (file.deleted) {
				await fs.rm(file.path, { force: true });
				files.push({
					path: file.path,
					relativePath: file.relativePath,
					action: "deleted",
				});
				continue;
			}

			// Conflict detection: did file change on disk outside Zeck?
			let currentDiskHash: string | undefined;
			try {
				const currentDiskContent = await fs.readFile(file.path, "utf8");
				currentDiskHash = hashContent(currentDiskContent);
			} catch {
				currentDiskHash = undefined;
			}

			if (
				currentDiskHash !== undefined &&
				file.originalHash &&
				currentDiskHash !== file.originalHash
			) {
				files.push({
					path: file.path,
					relativePath: file.relativePath,
					action: "conflict",
					reason: "Local file was modified on disk outside Zeck after import.",
				});
				continue;
			}

			// Create backup copy of previous disk state if exists
			if (backupPath && currentDiskHash !== undefined) {
				const backupFilePath = path.join(backupPath, file.relativePath);
				await fs.mkdir(path.dirname(backupFilePath), { recursive: true });
				try {
					await fs.copyFile(file.path, backupFilePath);
				} catch {
					// Ignore
				}
			}

			await fs.mkdir(path.dirname(file.path), { recursive: true });
			const tempPath = `${file.path}.zeck-tmp`;
			await fs.writeFile(tempPath, file.content, "utf8");
			await fs.rename(tempPath, file.path);

			file.originalHash = file.hash;
			file.dirty = false;
			file.created = false;

			files.push({
				path: file.path,
				relativePath: file.relativePath,
				action: currentDiskHash === undefined ? "created" : "updated",
			});
		} catch (err) {
			files.push({
				path: file.path,
				relativePath: file.relativePath,
				action: "skipped",
				reason: err instanceof Error ? err.message : String(err),
			});
		}
	}

	workspace.dirtyFiles = [];
	workspace.deletedFiles = [];
	workspace.updatedAt = new Date().toISOString();

	const ok = files.every((f) => f.action !== "conflict" && f.action !== "skipped");
	return {
		ok,
		backupPath,
		files,
		createdAt: new Date().toISOString(),
	};
}
