/**
 * Editor Executor
 *
 * Built-in implementation for filesystem editing operations.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentToolContext } from "@cline/shared";
import type { EditFileInput } from "../schemas";
import type { EditorExecutor } from "../types";
import {
	detectLineEnding,
	normalizeLineEndings,
	normalizeNewFileLineEndings,
} from "./line-endings";

/**
 * Options for the editor executor
 */
export interface EditorExecutorOptions {
	/**
	 * File encoding used for read/write operations
	 * @default "utf-8"
	 */
	encoding?: BufferEncoding;

	/**
	 * Restrict relative-path file operations to paths inside cwd.
	 * Absolute paths are always accepted as-is.
	 * @default true
	 */
	restrictToCwd?: boolean;

	/**
	 * Maximum number of diff lines in str_replace output
	 * @default 200
	 */
	maxDiffLines?: number;

	/**
	 * Maximum write operations (create/replace/insert) allowed on the same
	 * file within a single agent turn. Blocks runaway rewrite loops.
	 * @default 4
	 */
	maxWritesPerFilePerTurn?: number;
}

function resolveFilePath(
	cwd: string,
	inputPath: string,
	restrictToCwd: boolean,
): string {
	const isAbsoluteInput = path.isAbsolute(inputPath);
	const resolved = isAbsoluteInput
		? path.normalize(inputPath)
		: path.resolve(cwd, inputPath);
	if (!restrictToCwd) {
		return resolved;
	}

	// Absolute paths are accepted directly; cwd restriction applies to relative inputs.
	if (isAbsoluteInput) {
		return resolved;
	}

	const rel = path.relative(cwd, resolved);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(`Path must stay within cwd: ${inputPath}`);
	}
	return resolved;
}

function countOccurrences(content: string, needle: string): number {
	if (needle.length === 0) return 0;
	return content.split(needle).length - 1;
}

// Reads produced via readline strip "\r", so models emit LF-only text even
// for CRLF files; edits must be normalized to the file's own EOL (see
// ./line-endings) or they create mixed line endings and break subsequent
// exact-match replacements.

function createLineDiff(
	oldContent: string,
	newContent: string,
	maxLines: number,
): string {
	const oldLines = oldContent.split(/\r\n|\n/);
	const newLines = newContent.split(/\r\n|\n/);

	// Trim the common prefix and suffix so only the changed region is emitted;
	// a naive positional compare would mispair every line after an edit that
	// changes the line count.
	let start = 0;
	while (
		start < oldLines.length &&
		start < newLines.length &&
		oldLines[start] === newLines[start]
	) {
		start++;
	}
	let oldEnd = oldLines.length;
	let newEnd = newLines.length;
	while (
		oldEnd > start &&
		newEnd > start &&
		oldLines[oldEnd - 1] === newLines[newEnd - 1]
	) {
		oldEnd--;
		newEnd--;
	}

	// Split the line budget between removals and additions so neither side is
	// silently dropped when the other alone would exhaust maxLines.
	const removedCount = oldEnd - start;
	const addedCount = newEnd - start;
	let removedBudget = removedCount;
	let addedBudget = addedCount;
	if (removedCount + addedCount > maxLines) {
		removedBudget = Math.min(
			removedCount,
			Math.max(Math.ceil(maxLines / 2), maxLines - addedCount),
		);
		addedBudget = Math.min(addedCount, maxLines - removedBudget);
	}

	const out: string[] = ["```diff"];
	for (let i = start; i < start + removedBudget; i++) {
		out.push(`-${i + 1}: ${oldLines[i]}`);
	}
	for (let i = start; i < start + addedBudget; i++) {
		out.push(`+${i + 1}: ${newLines[i]}`);
	}

	const omittedRemoved = removedCount - removedBudget;
	const omittedAdded = addedCount - addedBudget;
	if (omittedRemoved > 0 || omittedAdded > 0) {
		out.push(
			`... diff truncated (${omittedRemoved} more removed, ${omittedAdded} more added lines) ...`,
		);
	}

	out.push("```");
	return out.join("\n");
}

async function createFile(
	filePath: string,
	fileText: string,
	encoding: BufferEncoding,
): Promise<string> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, normalizeNewFileLineEndings(fileText), {
		encoding,
	});
	return `File created successfully at: ${filePath}`;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function replaceInFile(
	filePath: string,
	oldStr: string,
	newStr: string | null | undefined,
	encoding: BufferEncoding,
	maxDiffLines: number,
): Promise<string> {
	const content = await fs.readFile(filePath, encoding);
	const eol = detectLineEnding(content);
	const normalizedOldStr = normalizeLineEndings(oldStr, eol);
	const normalizedNewStr = normalizeLineEndings(newStr ?? "", eol);
	const occurrences = countOccurrences(content, normalizedOldStr);

	if (occurrences === 0) {
		throw new Error(`No replacement performed: text not found in ${filePath}.`);
	}

	if (occurrences > 1) {
		throw new Error(
			`No replacement performed: multiple occurrences of text found in ${filePath}.`,
		);
	}

	// Replacer function so "$"-sequences in new_text ($&, $', $`, $$, $n)
	// are inserted literally instead of being expanded by String.replace.
	const updated = content.replace(normalizedOldStr, () => normalizedNewStr);
	await fs.writeFile(filePath, updated, { encoding });

	const diff = createLineDiff(content, updated, maxDiffLines);
	return `Edited ${filePath}\n${diff}`;
}

async function insertInFile(
	filePath: string,
	insertLineOneBased: number,
	newStr: string,
	encoding: BufferEncoding,
): Promise<string> {
	const content = await fs.readFile(filePath, encoding);
	const eol = detectLineEnding(content);
	const lines = content.split(/\r\n|\n/);
	const maxBoundaryLine = lines.length + 1;

	if (insertLineOneBased < 1 || insertLineOneBased > maxBoundaryLine) {
		throw new Error(
			`Invalid insert_line: ${insertLineOneBased}. insert_line must be a positive one-based boundary line in the range 1-${maxBoundaryLine}. Use ${maxBoundaryLine} to append at EOF.`,
		);
	}

	const insertLine = insertLineOneBased - 1;
	lines.splice(insertLine, 0, ...newStr.split(/\r\n|\n/));
	await fs.writeFile(filePath, lines.join(eol), { encoding });

	return `Inserted content at line ${insertLineOneBased} in ${filePath}.`;
}

// ── REWRITE-LOOP GUARD ────────────────────────────────────────────────
// Stops the agent rewriting the same file over and over in one turn
// (the "51 API calls for one structure.md" bug). The thrown error is fed
// back to the model, teaching it to stop — same pattern as the old_text
// recovery error below.

const writeCounts = new Map<string, number>();
let currentTurnKey: string | null = null;
let lastWrittenFile: string | null = null;

function resolveTurnKey(context: AgentToolContext): { key: string; known: boolean } {
	const c = context as unknown as Record<string, any>;
	const key = c?.turnId ?? c?.turn?.id ?? c?.messageId ?? c?.requestId ?? c?.sessionId;
	if (typeof key === "string" && key.length > 0) return { key, known: true };
	return { key: "unknown-turn", known: false };
}

function consumeWriteBudget(
	filePath: string,
	max: number,
	context: AgentToolContext,
): void {
	const { key, known } = resolveTurnKey(context);

	if (known) {
		if (key !== currentTurnKey) {
			currentTurnKey = key;
			writeCounts.clear(); // new turn → fresh budget
		}
	} else if (filePath !== lastWrittenFile) {
		// No turn id available yet: consecutive-run fallback.
		// Touching a different file resets the budget.
		writeCounts.clear();
		lastWrittenFile = filePath;
	}

	const n = (writeCounts.get(filePath) ?? 0) + 1;
	writeCounts.set(filePath, n);

	if (n > max) {
		throw new Error(
			`BLOCKED: ${n - 1} write operations already performed on ${filePath} in this turn. ` +
				`The file content is final. Do NOT rewrite, reformat, or "improve" it again. ` +
				`Finish the task with a summary, or wait for the user's next instruction.`,
		);
	}
}
// ── END GUARD ─────────────────────────────────────────────────────────

/**
 * Create an editor executor using Node.js fs module
 */
export function createEditorExecutor(
	options: EditorExecutorOptions = {},
): EditorExecutor {
	const {
		encoding = "utf-8",
		restrictToCwd = true,
		maxDiffLines = 200,
		maxWritesPerFilePerTurn = 4,
	} = options;

	return async (
		input: EditFileInput,
		cwd: string,
		context: AgentToolContext,
	): Promise<string> => {
		const filePath = resolveFilePath(cwd, input.path, restrictToCwd);
		consumeWriteBudget(filePath, maxWritesPerFilePerTurn, context);

		if (input.insert_line != null) {
			return insertInFile(
				filePath,
				input.insert_line, // One-based index
				input.new_text,
				encoding,
			);
		}

		if (!(await fileExists(filePath))) {
			return createFile(filePath, input.new_text, encoding);
		}
		if (input.old_text == null) {
			// Models that fill optional params with null hit this repeatedly and
			// tend to re-send the identical call; spell out the recovery so the
			// next call differs.
			throw new Error(
				`${filePath} already exists, but \`old_text\` was ${
					input.old_text === null ? "null" : "omitted"
				}. To edit an existing file, set \`old_text\` to the exact text in the file that \`new_text\` should replace (read the file first if needed). To insert instead, provide \`insert_line\`. Do not re-send this call unchanged.`,
			);
		}

		return replaceInFile(
			filePath,
			input.old_text,
			input.new_text,
			encoding,
			maxDiffLines,
		);
	};
}
