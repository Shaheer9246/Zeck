/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
	AlertCircle,
	Check,
	ChevronDown,
	ChevronRight,
	Code2,
	Copy,
	Cpu,
	ExternalLink,
	Eye,
	FileCode,
	Folder,
	FolderOpen,
	Layers,
	Monitor,
	Plus,
	RefreshCw,
	RotateCcw,
	Server,
	ShieldCheck,
	SlidersHorizontal,
	Smartphone,
	Sparkles,
	Tablet,
	Terminal,
	X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DrawerTab =
	| "chat_settings"
	| "preview"
	| "code"
	| "diff"
	| "security"
	| "mcp"
	| "settings";

interface RightPanelProps {
	activeTab: DrawerTab;
	onSelectTab: (tab: DrawerTab) => void;
	onClose: () => void;
	renderDiffView?: () => React.ReactNode;
	renderSecurityView?: () => React.ReactNode;
	renderSettingsView?: () => React.ReactNode;
	renderMcpView?: () => React.ReactNode;
}

export function RightPanel({
	activeTab,
	onSelectTab,
	onClose,
	renderDiffView,
	renderSecurityView,
	renderSettingsView,
	renderMcpView,
}: RightPanelProps) {
	return (
		<aside className="flex h-full w-[460px] max-w-[85vw] flex-col border-l bg-card shadow-2xl animate-in slide-in-from-right duration-200 z-20">
			{/* Pill Navigation Header (Antigravity Style) */}
			<div className="flex items-center justify-between border-b px-3 py-2 bg-muted/20">
				<div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
					<button
						type="button"
						onClick={() => onSelectTab("chat_settings")}
						className={cn(
							"rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
							activeTab === "chat_settings"
								? "bg-foreground text-background dark:bg-primary dark:text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						• Chat Settings
					</button>
					<button
						type="button"
						onClick={() => onSelectTab("preview")}
						className={cn(
							"rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
							activeTab === "preview"
								? "bg-foreground text-background dark:bg-primary dark:text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						Preview
					</button>
					<button
						type="button"
						onClick={() => onSelectTab("code")}
						className={cn(
							"rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
							activeTab === "code"
								? "bg-foreground text-background dark:bg-primary dark:text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						Code
					</button>
					<button
						type="button"
						onClick={() => onSelectTab("diff")}
						className={cn(
							"rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
							activeTab === "diff"
								? "bg-foreground text-background dark:bg-primary dark:text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						Diff & Restore
					</button>
					<button
						type="button"
						onClick={() => onSelectTab("security")}
						className={cn(
							"rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
							activeTab === "security"
								? "bg-foreground text-background dark:bg-primary dark:text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						Security Audit
					</button>
					<button
						type="button"
						onClick={() => onSelectTab("mcp")}
						className={cn(
							"rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
							activeTab === "mcp"
								? "bg-foreground text-background dark:bg-primary dark:text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						MCP
					</button>
					<button
						type="button"
						onClick={() => onSelectTab("settings")}
						className={cn(
							"rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
							activeTab === "settings"
								? "bg-foreground text-background dark:bg-primary dark:text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						Settings
					</button>
				</div>

				<button
					type="button"
					onClick={onClose}
					className="ml-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Compress / Close drawer"
				>
					<X className="size-4" />
				</button>
			</div>

			{/* Tab Body */}
			<div className="flex-1 overflow-y-auto">
				{activeTab === "chat_settings" && <ChatSettingsTabContent />}
				{activeTab === "preview" && <PreviewTabContent />}
				{activeTab === "code" && <CodeTabContent />}
				{activeTab === "diff" && (renderDiffView ? renderDiffView() : <DiffPlaceholder />)}
				{activeTab === "security" &&
					(renderSecurityView ? renderSecurityView() : <SecurityPlaceholder />)}
				{activeTab === "mcp" &&
					(renderMcpView ? renderMcpView() : <McpTabContent />)}
				{activeTab === "settings" &&
					(renderSettingsView ? renderSettingsView() : <SettingsPlaceholder />)}
			</div>
		</aside>
	);
}

function ChatSettingsTabContent() {
	const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
	const [customPrompt, setCustomPrompt] = useState(
		"You are Cline, an autonomous software engineering assistant that writes clean, safe, modular TypeScript code.",
	);
	const [promptSaved, setPromptSaved] = useState(false);
	const [systemExpanded, setSystemExpanded] = useState(true);

	return (
		<div className="space-y-6 p-4 text-foreground">
			<div>
				<h2 className="text-lg font-semibold tracking-tight">Chat settings</h2>
				<p className="text-xs text-muted-foreground mt-0.5">
					Configure active model, system prompts, framework, and execution parameters.
				</p>
			</div>

			{/* Model selector (Antigravity style) */}
			<div className="space-y-2">
				<label className="text-xs font-medium text-foreground">
					Select model to use in Chat
				</label>
				<select
					value={selectedModel}
					onChange={(e) => setSelectedModel(e.target.value)}
					className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none focus:ring-2 focus:ring-primary"
				>
					<option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast, multimodal, high quota)</option>
					<option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep reasoning, complex code)</option>
					<option value="claude-3-7-sonnet">Claude 3.7 Sonnet (Agentic coding)</option>
					<option value="gpt-4o">GPT-4o (Omni intelligence)</option>
					<option value="openrouter/north-mini">OpenRouter | North Mini Code (Free)</option>
				</select>
			</div>

			{/* System Instructions Card */}
			<div className="rounded-xl border bg-card/60 p-3.5 space-y-3">
				<div
					className="flex items-center justify-between cursor-pointer select-none"
					onClick={() => setSystemExpanded(!systemExpanded)}
				>
					<div className="flex items-center gap-2">
						<Sparkles className="size-4 text-primary" />
						<span className="text-xs font-semibold">System instructions</span>
					</div>
					{systemExpanded ? (
						<ChevronDown className="size-4 text-muted-foreground" />
					) : (
						<ChevronRight className="size-4 text-muted-foreground" />
					)}
				</div>

				{systemExpanded ? (
					<div className="space-y-2 pt-1 border-t">
						<p className="text-[11px] text-muted-foreground">
							Define persistent persona, behavioral rules, and architecture guidelines.
						</p>
						<textarea
							rows={4}
							value={customPrompt}
							onChange={(e) => {
								setCustomPrompt(e.target.value);
								setPromptSaved(false);
							}}
							className="w-full rounded-md border bg-background p-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary font-mono leading-relaxed"
						/>
						<div className="flex justify-end">
							<Button
								size="sm"
								className="h-7 text-xs"
								onClick={() => {
									setPromptSaved(true);
									setTimeout(() => setPromptSaved(false), 2000);
								}}
							>
								{promptSaved ? <Check className="size-3.5 mr-1" /> : null}
								{promptSaved ? "Saved" : "Save instructions"}
							</Button>
						</div>
					</div>
				) : null}
			</div>

			{/* Usage & Quota Card */}
			<div className="rounded-xl border bg-card/60 p-3.5 space-y-2">
				<div className="flex items-center justify-between">
					<span className="text-xs font-semibold">Usage & Quotas</span>
					<Badge variant="secondary" className="text-[10px] font-normal">
						Free requests
					</Badge>
				</div>
				<div className="space-y-1.5 pt-1">
					<div className="flex justify-between text-[11px] text-muted-foreground">
						<span>Daily requests</span>
						<span>14 / 500</span>
					</div>
					<div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
						<div className="h-full bg-primary rounded-full w-[12%]" />
					</div>
					<p className="text-[10px] text-muted-foreground pt-1">
						Resets at midnight UTC. High throughput active for local server sessions.
					</p>
				</div>
			</div>

			{/* Framework & Runtime Settings */}
			<div className="rounded-xl border bg-card/60 p-3.5 space-y-2.5">
				<div className="flex items-center gap-2">
					<Cpu className="size-4 text-primary" />
					<span className="text-xs font-semibold">Framework & Runtime</span>
				</div>
				<div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
					<div className="rounded-md border bg-muted/30 p-2">
						<span className="text-muted-foreground block text-[10px]">Runtime</span>
						<span className="font-semibold text-foreground">Bun / Node.js</span>
					</div>
					<div className="rounded-md border bg-muted/30 p-2">
						<span className="text-muted-foreground block text-[10px]">Hub Port</span>
						<span className="font-semibold text-foreground">8787</span>
					</div>
					<div className="rounded-md border bg-muted/30 p-2 col-span-2">
						<span className="text-muted-foreground block text-[10px]">Status</span>
						<span className="font-semibold text-emerald-500 inline-flex items-center gap-1">
							<span className="size-1.5 rounded-full bg-emerald-500" /> Connected & Authorized
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function PreviewTabContent() {
	const [previewUrl, setPreviewUrl] = useState(
		typeof window !== "undefined" ? window.location.origin : "http://localhost:8787",
	);
	const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
	const [key, setKey] = useState(0);

	return (
		<div className="flex flex-col h-full bg-background">
			{/* Address and controls bar */}
			<div className="flex items-center gap-2 border-b bg-muted/30 p-2">
				<div className="flex items-center gap-1 border-r pr-2">
					<button
						type="button"
						onClick={() => setDevice("desktop")}
						className={cn(
							"p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted",
							device === "desktop" && "bg-muted text-foreground",
						)}
						title="Desktop View"
					>
						<Monitor className="size-3.5" />
					</button>
					<button
						type="button"
						onClick={() => setDevice("tablet")}
						className={cn(
							"p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted",
							device === "tablet" && "bg-muted text-foreground",
						)}
						title="Tablet View"
					>
						<Tablet className="size-3.5" />
					</button>
					<button
						type="button"
						onClick={() => setDevice("mobile")}
						className={cn(
							"p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted",
							device === "mobile" && "bg-muted text-foreground",
						)}
						title="Mobile View"
					>
						<Smartphone className="size-3.5" />
					</button>
				</div>

				<div className="flex-1 min-w-0">
					<Input
						value={previewUrl}
						onChange={(e) => setPreviewUrl(e.target.value)}
						className="h-7 text-xs bg-background"
					/>
				</div>

				<button
					type="button"
					onClick={() => setKey((k) => k + 1)}
					className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
					title="Reload Preview"
				>
					<RefreshCw className="size-3.5" />
				</button>
				<a
					href={previewUrl}
					target="_blank"
					rel="noreferrer"
					className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
					title="Open in new window"
				>
					<ExternalLink className="size-3.5" />
				</a>
			</div>

			{/* Preview viewport */}
			<div className="flex-1 overflow-auto p-3 flex items-center justify-center bg-muted/20">
				<div
					className={cn(
						"h-full rounded-lg border bg-background shadow-md overflow-hidden transition-all duration-200 flex flex-col",
						device === "desktop" && "w-full",
						device === "tablet" && "w-[360px]",
						device === "mobile" && "w-[280px]",
					)}
				>
					<iframe
						key={key}
						src={previewUrl}
						title="Application Preview"
						className="w-full h-full border-none flex-1"
						sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
					/>
				</div>
			</div>
		</div>
	);
}

const SAMPLE_PROJECT_FILES: Record<string, { path: string; content: string }> = {
	"server.ts": {
		path: "src/server.ts",
		content: `import express from "express";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 8787;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(\`Cline Hub running on port \${PORT}\`);
});`,
	},
	"App.tsx": {
		path: "src/webview/src/App.tsx",
		content: `import React, { useState } from "react";
import Chat from "./Chat";
import { RightPanel } from "./components/right-panel";

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="h-screen flex">
      <Chat onToggleDrawer={() => setDrawerOpen(!drawerOpen)} />
      {drawerOpen && <RightPanel onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}`,
	},
	"package.json": {
		path: "package.json",
		content: `{
  "name": "zeck-hub",
  "version": "3.42.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/server.ts",
    "build": "bun run build:webview",
    "start": "bun src/server.ts"
  }
}`,
	},
};

function CodeTabContent() {
	const [activeFile, setActiveFile] = useState("App.tsx");
	const [copied, setCopied] = useState(false);

	const current = SAMPLE_PROJECT_FILES[activeFile];

	const handleCopy = () => {
		if (!current) return;
		void navigator.clipboard.writeText(current.content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="flex flex-col h-full bg-background">
			{/* File selector bar */}
			<div className="flex items-center gap-1.5 border-b bg-muted/20 px-3 py-2 overflow-x-auto">
				<FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
				{Object.keys(SAMPLE_PROJECT_FILES).map((fileName) => (
					<button
						key={fileName}
						type="button"
						onClick={() => setActiveFile(fileName)}
						className={cn(
							"flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-mono transition-colors",
							activeFile === fileName
								? "bg-primary text-primary-foreground font-semibold"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						<FileCode className="size-3" />
						<span>{fileName}</span>
					</button>
				))}
			</div>

			{/* File header with path & copy */}
			<div className="flex items-center justify-between border-b px-3 py-1.5 bg-muted/10 text-xs text-muted-foreground">
				<span className="font-mono text-[11px] truncate">{current?.path}</span>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 text-[11px] gap-1 px-2"
					onClick={handleCopy}
				>
					{copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
					<span>{copied ? "Copied" : "Copy"}</span>
				</Button>
			</div>

			{/* Code body */}
			<div className="flex-1 overflow-auto p-4 bg-muted/10">
				<pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
					<code>{current?.content}</code>
				</pre>
			</div>
		</div>
	);
}

function McpTabContent() {
	const [servers, setServers] = useState([
		{
			id: "fs-1",
			name: "Filesystem",
			command: "npx -y @modelcontextprotocol/server-filesystem",
			status: "connected",
			toolsCount: 8,
		},
		{
			id: "git-1",
			name: "Git Repository",
			command: "npx -y @modelcontextprotocol/server-git",
			status: "connected",
			toolsCount: 12,
		},
		{
			id: "pg-1",
			name: "PostgreSQL Database",
			command: "npx -y @modelcontextprotocol/server-postgres",
			status: "idle",
			toolsCount: 6,
		},
	]);
	const [newServerModal, setNewServerModal] = useState(false);
	const [newServerName, setNewServerName] = useState("");
	const [newServerCommand, setNewServerCommand] = useState("");

	return (
		<div className="p-4 space-y-4 text-foreground">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold tracking-tight">Model Context Protocol</h2>
					<p className="text-xs text-muted-foreground mt-0.5">
						Connect external tools, databases, and APIs via MCP servers.
					</p>
				</div>
				<Button
					size="sm"
					className="h-7 text-xs gap-1"
					onClick={() => setNewServerModal(!newServerModal)}
				>
					<Plus className="size-3.5" />
					<span>Add Server</span>
				</Button>
			</div>

			{newServerModal ? (
				<div className="rounded-xl border bg-card p-3.5 space-y-3">
					<span className="text-xs font-semibold">New MCP Server Configuration</span>
					<Input
						placeholder="Server name (e.g. SQLite)"
						value={newServerName}
						onChange={(e) => setNewServerName(e.target.value)}
						className="h-8 text-xs"
					/>
					<Input
						placeholder="Command or URL (e.g. npx -y @mcp/server-sqlite)"
						value={newServerCommand}
						onChange={(e) => setNewServerCommand(e.target.value)}
						className="h-8 text-xs font-mono"
					/>
					<div className="flex justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() => setNewServerModal(false)}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							className="h-7 text-xs"
							onClick={() => {
								if (!newServerName.trim()) return;
								setServers((prev) => [
									...prev,
									{
										id: `mcp-${Date.now()}`,
										name: newServerName.trim(),
										command: newServerCommand.trim() || "local stdio",
										status: "connected",
										toolsCount: 4,
									},
								]);
								setNewServerName("");
								setNewServerCommand("");
								setNewServerModal(false);
							}}
						>
							Save Server
						</Button>
					</div>
				</div>
			) : null}

			<div className="space-y-2.5">
				{servers.map((s) => (
					<div key={s.id} className="rounded-xl border bg-card/60 p-3 space-y-2">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Server className="size-4 text-primary" />
								<span className="text-xs font-semibold">{s.name}</span>
							</div>
							<Badge
								variant={s.status === "connected" ? "default" : "secondary"}
								className="text-[10px]"
							>
								{s.status}
							</Badge>
						</div>
						<p className="text-[11px] font-mono text-muted-foreground truncate bg-muted/40 p-1.5 rounded">
							{s.command}
						</p>
						<div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
							<span>{s.toolsCount} active tools available</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 text-[10px] text-destructive hover:text-destructive"
								onClick={() => setServers(servers.filter((item) => item.id !== s.id))}
							>
								Remove
							</Button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function DiffPlaceholder() {
	return (
		<div className="p-8 text-center text-muted-foreground text-xs">
			Loading Diff & Restore engine...
		</div>
	);
}

function SecurityPlaceholder() {
	return (
		<div className="p-8 text-center text-muted-foreground text-xs">
			Loading Security Auditor...
		</div>
	);
}

function SettingsPlaceholder() {
	return (
		<div className="p-8 text-center text-muted-foreground text-xs">
			Loading Settings...
		</div>
	);
}
