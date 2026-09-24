/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
	AlertCircle,
	ArrowRight,
	CheckCircle2,
	Clock,
	FileCheck,
	FileCode,
	GitCompare,
	History,
	Layers,
	Plus,
	RotateCcw,
	Sparkles,
	SplitSquareVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageFrame, PageHeader } from "./page-layout";

export interface CheckpointRevision {
	id: string;
	versionNumber: number;
	timestamp: string;
	author:
		| "Agent (Surgical Edit)"
		| "Developer (Manual)"
		| "Auto-Snapshot"
		| "Initial Scaffold";
	summary: string;
	filesChanged: string[];
	stats: {
		additions: number;
		deletions: number;
	};
	snapshotFiles: Record<string, string>;
}

const DEFAULT_WORKSPACE_FILES: Record<string, string> = {
	"apps/cline-hub/src/server.ts": `import express from "express";
import path from "path";

const app = express();
const PORT = 3000;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "cline-hub" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(\`Cline Hub running on port \${PORT}\`);
});`,
	"apps/cline-hub/src/webview/src/App.tsx": `import React, { useState } from "react";
import { Shell } from "./components/shell";

export function App() {
  const [view, setView] = useState("home");
  return (
    <Shell view={view} onNavigate={setView}>
      <main className="p-6">Cline Hub Ready</main>
    </Shell>
  );
}`,
	"apps/cline-hub/src/webview-protocol.ts": `export type WebviewSessionSummary = {
  sessionId: string;
  title?: string;
  status?: string;
  workspaceRoot?: string;
  cwd?: string;
};`,
};

const INITIAL_REVISIONS: CheckpointRevision[] = [
	{
		id: "rev-1",
		versionNumber: 1,
		timestamp: "10:15 AM",
		author: "Initial Scaffold",
		summary: "Base Cline Monorepo Architecture initialized",
		filesChanged: [
			"apps/cline-hub/src/server.ts",
			"apps/cline-hub/src/webview/src/App.tsx",
		],
		stats: { additions: 184, deletions: 0 },
		snapshotFiles: {
			"apps/cline-hub/src/server.ts": `import express from "express";\nconst app = express();\napp.listen(3000);`,
			"apps/cline-hub/src/webview/src/App.tsx": `export function App() { return <div>Cline Hub</div>; }`,
			"apps/cline-hub/src/webview-protocol.ts": `export type WebviewSessionSummary = { sessionId: string; };`,
		},
	},
	{
		id: "rev-2",
		versionNumber: 2,
		timestamp: "11:30 AM",
		author: "Agent (Surgical Edit)",
		summary: "Resolved Vite build UNRESOLVED_IMPORT stubs & cwd type support",
		filesChanged: [
			"apps/cline-hub/src/webview/src/components/views/settings/settings-view.tsx",
			"apps/cline-hub/src/webview-protocol.ts",
		],
		stats: { additions: 42, deletions: 5 },
		snapshotFiles: {
			...DEFAULT_WORKSPACE_FILES,
		},
	},
];

export function DiffRestoreView() {
	const [currentFiles, setCurrentFiles] = useState<Record<string, string>>(
		DEFAULT_WORKSPACE_FILES,
	);
	const [revisions, setRevisions] =
		useState<CheckpointRevision[]>(INITIAL_REVISIONS);
	const [selectedRevisionId, setSelectedRevisionId] = useState<string>(() => {
		return revisions.length > 0 ? revisions[revisions.length - 1].id : "";
	});

	const [selectedFilePath, setSelectedFilePath] = useState<string>("");
	const [diffMode, setDiffMode] = useState<"split" | "unified">("split");
	const [snapshotNote, setSnapshotNote] = useState("");
	const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
	const [restoreNotification, setRestoreNotification] = useState<string | null>(
		null,
	);

	const selectedRevision =
		revisions.find((r) => r.id === selectedRevisionId) ||
		revisions[revisions.length - 1];

	const activeFile =
		selectedFilePath ||
		selectedRevision?.filesChanged[0] ||
		Object.keys(currentFiles)[0] ||
		"";

	const oldFileContent = selectedRevision?.snapshotFiles[activeFile] ?? "";
	const currentFileContent = currentFiles[activeFile] ?? "";

	// Compute line-by-line diff
	const computeDiffLines = (oldText: string, newText: string) => {
		const oldLines = (oldText || "").split("\n");
		const newLines = (newText || "").split("\n");

		const lines: Array<{
			type: "equal" | "delete" | "add";
			oldLineNo?: number;
			newLineNo?: number;
			text: string;
		}> = [];

		let oIdx = 0;
		let nIdx = 0;

		while (oIdx < oldLines.length || nIdx < newLines.length) {
			const oLine = oldLines[oIdx];
			const nLine = newLines[nIdx];

			if (oLine === nLine) {
				lines.push({
					type: "equal",
					oldLineNo: oIdx + 1,
					newLineNo: nIdx + 1,
					text: oLine ?? "",
				});
				oIdx++;
				nIdx++;
			} else if (
				oIdx < oldLines.length &&
				!newLines.slice(nIdx).includes(oLine)
			) {
				lines.push({
					type: "delete",
					oldLineNo: oIdx + 1,
					text: oLine,
				});
				oIdx++;
			} else if (
				nIdx < newLines.length &&
				!oldLines.slice(oIdx).includes(nLine)
			) {
				lines.push({
					type: "add",
					newLineNo: nIdx + 1,
					text: nLine,
				});
				nIdx++;
			} else {
				if (oIdx < oldLines.length) {
					lines.push({
						type: "delete",
						oldLineNo: oIdx + 1,
						text: oldLines[oIdx],
					});
					oIdx++;
				}
				if (nIdx < newLines.length) {
					lines.push({
						type: "add",
						newLineNo: nIdx + 1,
						text: newLines[nIdx],
					});
					nIdx++;
				}
			}
		}

		return lines;
	};

	const diffLines = computeDiffLines(oldFileContent, currentFileContent);
	const isIdentical = oldFileContent === currentFileContent;

	const handleCreateManualSnapshot = (e: React.FormEvent) => {
		e.preventDefault();
		if (!snapshotNote.trim()) return;

		const newRev: CheckpointRevision = {
			id: `rev-${Date.now()}`,
			versionNumber: revisions.length + 1,
			timestamp: new Date().toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			}),
			author: "Developer (Manual)",
			summary: snapshotNote.trim(),
			filesChanged: Object.keys(currentFiles),
			stats: { additions: 8, deletions: 2 },
			snapshotFiles: { ...currentFiles },
		};

		setRevisions((prev) => [...prev, newRev]);
		setSelectedRevisionId(newRev.id);
		setSnapshotNote("");
		setIsCreatingSnapshot(false);
		setRestoreNotification("Created manual checkpoint snapshot!");
		setTimeout(() => setRestoreNotification(null), 3500);
	};

	const handleRestoreFull = (rev: CheckpointRevision) => {
		setCurrentFiles({ ...rev.snapshotFiles });
		setRestoreNotification(
			`Successfully rolled back to Revision #${rev.versionNumber} ("${rev.summary}")!`,
		);
		setTimeout(() => setRestoreNotification(null), 4000);
	};

	const handleRestoreCurrentFile = () => {
		if (!activeFile || !oldFileContent) return;
		setCurrentFiles((prev) => ({ ...prev, [activeFile]: oldFileContent }));
		setRestoreNotification(
			`Restored \`${activeFile}\` to Revision #${selectedRevision.versionNumber} snapshot!`,
		);
		setTimeout(() => setRestoreNotification(null), 4000);
	};

	return (
		<PageFrame className="h-full flex flex-col p-6">
			<PageHeader
				icon={History}
				title="Diff & Restore"
				description="Inspect granular surgical diffs, browse version timeline checkpoints, and roll back any change safely."
				actions={
					<div className="flex items-center gap-2">
						{restoreNotification && (
							<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 text-xs font-medium">
								<CheckCircle2 className="size-3.5" />
								<span>{restoreNotification}</span>
							</div>
						)}
						<Button
							onClick={() => setIsCreatingSnapshot(!isCreatingSnapshot)}
							variant="default"
							className="gap-1.5 h-9"
						>
							<Plus className="size-4" />
							<span>New Checkpoint</span>
						</Button>
					</div>
				}
			/>

			{/* Inline Snapshot Form */}
			{isCreatingSnapshot && (
				<form
					onSubmit={handleCreateManualSnapshot}
					className="mb-4 p-3 rounded-lg border border-primary/30 bg-primary/5 flex items-center gap-2"
				>
					<Sparkles className="size-4 text-primary shrink-0" />
					<Input
						value={snapshotNote}
						onChange={(e) => setSnapshotNote(e.target.value)}
						placeholder="Checkpoint description (e.g. 'Before refactoring Hub endpoints')..."
						className="flex-1 text-xs"
						autoFocus
					/>
					<Button type="submit" disabled={!snapshotNote.trim()} size="sm">
						Save
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setIsCreatingSnapshot(false)}
					>
						Cancel
					</Button>
				</form>
			)}

			{/* 2-Column Split Workspace */}
			<div className="flex-1 grid grid-cols-[20rem_minmax(0,1fr)] gap-4 min-h-0 overflow-hidden border rounded-xl bg-card">
				{/* Left Column: Revision Timeline */}
				<div className="border-r flex flex-col min-h-0 bg-muted/20">
					<div className="p-3 border-b flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						<span>Revisions ({revisions.length})</span>
						<span className="font-mono text-[10px]">Indexed</span>
					</div>

					<div className="flex-1 overflow-y-auto p-2 space-y-2">
						{revisions
							.slice()
							.reverse()
							.map((rev) => {
								const isSelected = rev.id === selectedRevisionId;
								return (
									<div
										key={rev.id}
										onClick={() => setSelectedRevisionId(rev.id)}
										className={`p-3 rounded-lg border transition-all cursor-pointer ${
											isSelected
												? "bg-primary/10 border-primary/40 shadow-xs"
												: "bg-background border-border hover:bg-muted/40"
										}`}
									>
										<div className="flex items-center justify-between gap-1 mb-1">
											<div className="flex items-center gap-1.5 font-semibold text-xs text-foreground truncate">
												<span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono text-[10px]">
													v{rev.versionNumber}
												</span>
												<span className="truncate">{rev.summary}</span>
											</div>
											<span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 shrink-0">
												<Clock className="size-3" />
												{rev.timestamp}
											</span>
										</div>

										<div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
											<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">
												{rev.author}
											</span>
											<div className="flex items-center gap-1.5 font-mono text-[10px]">
												<span className="text-emerald-500">
													+{rev.stats.additions}
												</span>
												<span className="text-red-500">
													-{rev.stats.deletions}
												</span>
											</div>
										</div>

										<div className="pt-2 border-t flex items-center justify-between">
											<span className="text-[10px] text-muted-foreground">
												{rev.filesChanged.length} file(s)
											</span>
											<Button
												size="sm"
												variant="secondary"
												className="h-6 text-[10px] px-2"
												onClick={(e) => {
													e.stopPropagation();
													handleRestoreFull(rev);
												}}
											>
												<RotateCcw className="size-2.5 mr-1" />
												Rollback
											</Button>
										</div>
									</div>
								);
							})}
					</div>
				</div>

				{/* Right Column: Diff Inspector */}
				<div className="flex flex-col min-h-0 bg-background overflow-hidden">
					{/* Diff Inspector Header */}
					<div className="p-3 border-b flex flex-wrap items-center justify-between gap-2 bg-muted/20">
						<div className="flex items-center gap-2 text-xs">
							<span className="text-muted-foreground">Comparing</span>
							<span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-semibold">
								v{selectedRevision?.versionNumber ?? 1}
							</span>
							<ArrowRight className="size-3 text-muted-foreground" />
							<span className="font-semibold text-emerald-500">Workspace</span>
						</div>

						<div className="flex items-center gap-2">
							<select
								value={activeFile}
								onChange={(e) => setSelectedFilePath(e.target.value)}
								className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							>
								{Object.keys(currentFiles).map((path) => (
									<option key={path} value={path}>
										{path}
									</option>
								))}
							</select>

							<div className="flex items-center rounded-md border bg-muted p-0.5 text-xs">
								<button
									type="button"
									onClick={() => setDiffMode("split")}
									className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
										diffMode === "split"
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									Split
								</button>
								<button
									type="button"
									onClick={() => setDiffMode("unified")}
									className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
										diffMode === "unified"
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									Unified
								</button>
							</div>

							<Button
								size="sm"
								variant="outline"
								className="h-8 text-xs"
								onClick={handleRestoreCurrentFile}
							>
								<RotateCcw className="size-3 mr-1" />
								Restore File
							</Button>
						</div>
					</div>

					{/* Diff View Canvas */}
					<div className="flex-1 overflow-auto font-mono text-xs p-4 bg-muted/10">
						{isIdentical ? (
							<div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
								<FileCheck className="size-8 text-emerald-500" />
								<p>
									File is identical to Revision #{selectedRevision.versionNumber}
								</p>
							</div>
						) : diffMode === "split" ? (
							<div className="grid grid-cols-2 gap-3">
								<div className="border rounded-lg bg-background p-3">
									<div className="text-[11px] font-semibold text-muted-foreground pb-2 mb-2 border-b">
										Revision #{selectedRevision.versionNumber} (Snapshot)
									</div>
									<pre className="whitespace-pre-wrap leading-relaxed text-red-400">
										{oldFileContent || "(empty)"}
									</pre>
								</div>
								<div className="border rounded-lg bg-background p-3">
									<div className="text-[11px] font-semibold text-muted-foreground pb-2 mb-2 border-b">
										Current Workspace State
									</div>
									<pre className="whitespace-pre-wrap leading-relaxed text-emerald-400">
										{currentFileContent || "(empty)"}
									</pre>
								</div>
							</div>
						) : (
							<div className="border rounded-lg bg-background divide-y">
								{diffLines.map((line, idx) => (
									<div
										key={idx}
										className={`flex items-start px-3 py-1 text-[11px] ${
											line.type === "add"
												? "bg-emerald-500/10 text-emerald-400"
												: line.type === "delete"
													? "bg-red-500/10 text-red-400 line-through"
													: "text-foreground/80"
										}`}
									>
										<span className="w-10 select-none text-muted-foreground text-right pr-3 font-mono opacity-50">
											{line.type === "delete"
												? line.oldLineNo
												: line.newLineNo ?? line.oldLineNo}
										</span>
										<span className="w-4 select-none text-center font-bold">
											{line.type === "add"
												? "+"
												: line.type === "delete"
													? "-"
													: " "}
										</span>
										<span className="flex-1 whitespace-pre-wrap break-all">
											{line.text}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</PageFrame>
	);
}

export default DiffRestoreView;
