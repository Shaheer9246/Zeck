import type { WorkspaceContext } from "../extensions/context";
import { isClineProvider } from "../providers/utils";
import type { WorkspaceInfo } from "../session/workspace";
import { DEFAULT_CLINE_SYSTEM_PROMPTS } from "./system";

const WORKSPACE_CONFIGURATION_MARKER = "# Workspace Configuration";

/**
 * Explains the <user_input mode="..."> wrapper and <mode_notice> elements the
 * runtime stamps on user messages (prepareTurnInput / formatUserInputBlock).
 * Every host that sends through the SDK runtime produces those tags, so every
 * host's system prompt must explain them: without this section the model has
 * no idea what the attribute means, and a mid-conversation mode switch is an
 * invisible system-prompt swap it cannot diff. Included for BOTH modes, since
 * after a switch the transcript still contains messages tagged with the other
 * mode.
 */
export const MODE_TAG_INSTRUCTIONS = `# Plan / Act Modes

User messages arrive wrapped in a <user_input mode="..."> tag. The mode attribute is the interaction mode the user was in when they sent that message: "plan" means plan-mode constraints applied (explore, analyze, and align on a plan -- no edits or state-changing commands), while "act" (or "yolo") means implementation was allowed. If the mode attribute changes between messages, the user switched modes -- the newest message's mode is what governs right now, regardless of what earlier messages allowed. A <mode_notice> block inside a message marks exactly when such a switch happened.`;

/**
 * Plan-mode behavioral contract, appended when the session mode is "plan".
 * run_commands intentionally stays available in plan mode -- it is essential
 * for read-only investigation -- so the contract must spell out that it is
 * inspection-only there. Prompting is the first line of defense; the
 * plan-mode command-guard hook (registered by the core runtime builder for
 * plan-mode sessions) is the hard backstop that rejects file-editing
 * run_commands calls with a tool error before approval or execution.
 */
const PLAN_MODE_INSTRUCTIONS_BASE = `# Plan Mode

You are in Plan mode. Your role is to explore, analyze, and align on a production-ready plan -- not to execute.

- Use the code base panel, App.md, Changes.md, file map, and targeted read_files/search_codebase first. Do not roam the repo with shell commands.
- Understand the request, existing stack, constraints, and affected files.
- Ask clarifying questions only when ambiguity blocks a safe plan.
- Present a structured plan with files to create/edit, UI/backend/data impact, risks, and the narrowest verification step.
- Do NOT edit files, write code, run destructive commands, install packages, migrate databases, start servers, or make any state-changing tool calls.

The run_commands tool remains available in plan mode strictly for read-only inspection -- listing files, searching, reading configs, inspecting git history/diffs, and checking versions. Never use it to change anything. File-editing or state-changing commands are hard-blocked and return a tool error. If the task requires mutation, put it in the plan; execution happens only after act mode.`;

export const PLAN_MODE_INSTRUCTIONS = `${PLAN_MODE_INSTRUCTIONS_BASE}

Once the user reviews and explicitly approves the plan in a follow-up message, use switch_to_act_mode to begin implementation. Never call switch_to_act_mode in the same turn you present the plan, and never treat the original request as approval.`;

/**
 * Plan-mode contract for hosts that do NOT expose the switch_to_act_mode tool
 * (the VS Code extension, matching the legacy extension's behavior). The model
 * must direct the user to flip the Plan/Act toggle instead of calling a tool
 * that does not exist in its toolset.
 */
export const PLAN_MODE_INSTRUCTIONS_MANUAL_SWITCH = `${PLAN_MODE_INSTRUCTIONS_BASE}

Once you present the plan, end your turn and wait. You cannot switch to act mode yourself; the user must toggle Plan/Act. If tools require act mode, ask the user to "toggle to Act mode".`;

function redactRemoteUrlCredentials(remote: string): string {
	const schemeEnd = remote.indexOf("://");
	if (schemeEnd < 1) return remote;

	const authorityStart = schemeEnd + 3;
	let authorityEnd = authorityStart;
	while (authorityEnd < remote.length) {
		const char = remote[authorityEnd];
		if (
			char === "/" ||
			char === "?" ||
			char === "#" ||
			char.charCodeAt(0) <= 32
		) {
			break;
		}
		authorityEnd++;
	}

	const userInfoEnd = remote.lastIndexOf("@", authorityEnd - 1);
	if (userInfoEnd < authorityStart) return remote;
	return remote.slice(0, authorityStart) + remote.slice(userInfoEnd + 1);
}

export function processWorkspaceInfo(info: WorkspaceInfo): string {
	return JSON.stringify(
		{
			workspaces: {
				[info.rootPath]: {
					hint: info.hint,
					associatedRemoteUrls: info.associatedRemoteUrls?.map(
						redactRemoteUrlCredentials,
					),
					latestGitCommitHash: info.latestGitCommitHash,
					latestGitBranchName: info.latestGitBranchName,
				},
			},
		},
		null,
		2,
	);
}

function buildWorkspaceMetadata(
	rootPath: string,
	workspaceName?: string,
	metadata?: string,
): string {
	if (metadata?.trim()?.includes(WORKSPACE_CONFIGURATION_MARKER)) {
		return metadata.trim();
	}
	const body =
		metadata ||
		JSON.stringify(
			{
				workspaces: {
					[rootPath]: {
						hint: workspaceName || rootPath.split("/").at(-1) || rootPath,
					},
				},
			},
			null,
			2,
		);
	return `\n${WORKSPACE_CONFIGURATION_MARKER}\n${body}`;
}

function replaceToken(text: string, token: string, value: string): string {
	return text.split(token).join(value);
}

function normalizeBlankLines(text: string): string {
	return text
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * Options for building the Cline system prompt.
 *
 * Extends WorkspaceContext so callers can spread an ExtensionContext.workspace
 * directly. `workspaceRoot` is accepted as an alias for `rootPath` to support
 * existing call sites that set it explicitly.
 */
export interface ClineSystemPromptOptions
	extends Omit<WorkspaceContext, "rootPath"> {
	/**
	 * Workspace root path. Accepts either `rootPath` (from WorkspaceContext/WorkspaceInfo)
	 * or `workspaceRoot` (legacy alias) — whichever is provided will be used.
	 */
	rootPath?: string;
	/** Alias for rootPath — kept for backwards compatibility with existing call sites */
	workspaceRoot?: string;
	/** Per-request system prompt override */
	overridePrompt?: string;
	/** Provider ID — used to gate Cline-specific metadata injection */
	providerId?: string;
	/**
	 * Whether the host exposes the switch_to_act_mode tool in plan mode.
	 * Defaults to true (CLI behavior). Hosts that require the user to flip the
	 * Plan/Act toggle themselves (the VS Code extension) set this to false so
	 * the plan-mode contract directs the model to ask the user instead of
	 * calling a tool that is not in its toolset.
	 */
	planModeSwitchTool?: boolean;
	/**
	 * Compact code-panel / virtual-workspace context injected by the host.
	 *
	 * IMPORTANT:
	 * This should NOT contain every file in the repository.
	 * It should contain only the useful current working snapshot:
	 * - active file path
	 * - selected lines
	 * - open file list
	 * - compact file tree
	 * - dirty files
	 * - recent tool results
	 * - preview/build/test errors
	 * - package scripts if relevant
	 *
	 * Full file contents should be fetched by tools when needed.
	 */
	codePanelContext?: string;
}

export function buildClineSystemPrompt(
	options: ClineSystemPromptOptions,
): string {
	const {
		ide = "Terminal Shell",
		mode,
		platform = "unknown",
		workspaceName,
		metadata,
		rules,
		overridePrompt,
		providerId,
		planModeSwitchTool = true,
		codePanelContext,
	} = options;

	const workspaceRoot = options.workspaceRoot ?? options.rootPath ?? "";
	const isCline = isClineProvider(providerId || "");
	const currentDate = new Date().toISOString().slice(0, 10);

	const codePanel = codePanelContext?.trim()
		? `<code_panel_context>\n${codePanelContext.trim()}\n</code_panel_context>`
		: "";

	const clineMetadata = isCline
		? buildWorkspaceMetadata(workspaceRoot, workspaceName, metadata)
		: "";

	// Mode semantics ride in the rules slot so every host emits them without
	// composing its own copy. Order matches what the CLI historically built by
	// hand (caller rules, then the mode-tag explanation, then the plan-mode
	// contract), keeping CLI output byte-identical after the promotion.
	const effectiveRules = [
		rules,
		MODE_TAG_INSTRUCTIONS,
		mode === "plan"
			? planModeSwitchTool
				? PLAN_MODE_INSTRUCTIONS
				: PLAN_MODE_INSTRUCTIONS_MANUAL_SWITCH
			: undefined,
	]
		.filter(Boolean)
		.join("\n\n");

	const applyTemplate = (text: string): string => {
		const replacements: Array<[string, string]> = [
			["{{PLATFORM_NAME}}", platform],
			["{{CURRENT_DATE}}", currentDate],
			["{{IDE_NAME}}", ide],
			["{{CWD}}", workspaceRoot],
			["{{CLINE_RULES}}", effectiveRules],
			["{{CODE_PANEL_CONTEXT}}", codePanel],
			["{{CLINE_METADATA}}", clineMetadata],
		];

		return normalizeBlankLines(
			replacements.reduce(
				(acc, [token, value]) => replaceToken(acc, token, value),
				text,
			),
		);
	};

	if (overridePrompt?.trim()) {
		let out = applyTemplate(overridePrompt.trim());

		if (
			isCline &&
			metadata?.trim() &&
			!out.includes(WORKSPACE_CONFIGURATION_MARKER)
		) {
			out = `${out}\n\n${clineMetadata}`;
		}

		return normalizeBlankLines(out);
	}

	const basePrompt =
		mode === "yolo"
			? DEFAULT_CLINE_SYSTEM_PROMPTS.YOLO
			: DEFAULT_CLINE_SYSTEM_PROMPTS.ACT;

	return applyTemplate(basePrompt);
}