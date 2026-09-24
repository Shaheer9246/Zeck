# Zeck (Cline Fork) — Developer Architecture & Customization Guide

This document is the definitive guide for developers looking to modify, extend, or build upon the **Zeck** codebase (a fork of Cline). 

Following the removal of the production VS Code extension, Zeck is structured as a standalone, modern multi-client ecosystem centered around the **Desktop Application** (`@cline/code`), the **CLI** (`@cline/cli`), the **Hub** (`@cline/cline-hub`), and shared SDK packages (`@cline/core`, `@cline/shared`, `@cline/llms`, `@cline/ui`).

---

## Table of Contents

1. [High-Level Architecture (Post-Extension Removal)](#1-high-level-architecture)
2. [How to Add a Preview Feature](#2-how-to-add-a-preview-feature)
3. [How to Edit the Preview Feature](#3-how-to-edit-the-preview-feature)
4. [How to Add or Edit MCP (Model Context Protocol)](#4-how-to-add-or-edit-mcp)
5. [How to Customize How the Agent Responds & System Prompts](#5-how-to-customize-agent-responses--prompts)
6. [How to Edit the First Main Page (Welcome Screen)](#6-how-to-edit-the-first-main-page)
7. [How to Add or Edit Tools & Permissions](#7-how-to-add-or-edit-tools--permissions)
8. [File-by-File Master Reference Matrix](#8-file-by-file-master-reference-matrix)
9. [Development, Build, & Verification Commands](#9-development-build--verification-commands)

---

## 1. High-Level Architecture

The Zeck repository runs a **three-tier decoupled architecture**:

```text
┌────────────────────────────────────────────────────────┐
│               Tauri Native Shell (v2)                  │
│       apps/examples/desktop-app/src-tauri/             │
└──────────────────────────┬─────────────────────────────┘
                           │ Embeds / Manages
┌──────────────────────────▼─────────────────────────────┐
│          Next.js 14+ React Webview UI (Port 3125)      │
│          apps/examples/desktop-app/webview/            │
│  - Chat view & Welcome page                            │
│  - Markdown & Tool blocks                              │
│  - Settings & MCP UI                                   │
└──────────────────────────▲─────────────────────────────┘
                           │ WebSocket / HTTP (JSON-RPC)
                           │ ws://127.0.0.1:3126/transport
┌──────────────────────────▼─────────────────────────────┐
│             Bun Sidecar Server (Port 3126)             │
│           apps/examples/desktop-app/sidecar/           │
│  - server.ts: HTTP & WebSocket transport               │
│  - commands.ts: Command router (dispatch)              │
│  - chat-session.ts: Adapter to ClineCore runtime       │
│  - mcp.ts & mcp-oauth.ts: MCP server orchestration     │
│  - context.ts: In-memory approvals & state             │
└──────────────────────────┬─────────────────────────────┘
                           │ Direct TS imports / IPC
┌──────────────────────────▼─────────────────────────────┐
│        Canonical Shared Hub & Core Agent Runtime       │
│    apps/cline-hub/  &  @cline/core  &  @cline/llms     │
│  - LLM providers & streaming token generation          │
│  - Tool execution & file mutations                     │
│  - SQLite session persistence & checkpoints            │
└────────────────────────────────────────────────────────┘
```

### What Changed in Zeck:
- **VS Code Extension removed:** `apps/vscode` and `apps/vscode-rollout` were completely deleted.
- **Standalone Desktop application:** The primary rich graphical interface is now the Desktop app under `apps/examples/desktop-app/`.
- **Decoupled Webview & Sidecar:** The React UI never executes filesystem commands or stores API keys directly; it talks via typed WebSocket commands to `sidecar/`.

---

## 2. How to Add a Preview Feature

If you want to add an in-app browser or live web preview (such as rendering HTML/CSS, Next.js, Vite, or React apps created by Zeck):

### Architecture of Preview
A secure preview requires 3 pieces:
1. **Frontend View**: A split panel or tab containing an isolated `<iframe>` with address bar and device toggles.
2. **Sidecar Transport**: Commands to start a static file server or proxy local dev server ports.
3. **Agent Awareness**: Instructions in the system prompt so the agent knows how to start preview servers and refresh the preview after file edits.

### Files You Need to ADD (Create New Files)

| File Path to Create | Purpose |
| :--- | :--- |
| `apps/examples/desktop-app/webview/components/views/preview/preview-pane.tsx` | The React preview UI component: contains URL bar, reload button, responsive width switches (desktop, tablet, mobile), and `<iframe sandbox="..." />`. |
| `apps/examples/desktop-app/webview/components/views/preview/use-preview.ts` | React hook managing preview state: current URL, loading state, error states, and listening for sidecar reload events. |
| `apps/examples/desktop-app/sidecar/preview-server.ts` | Local HTTP static file server or reverse proxy running on Bun that securely serves workspace files or proxies the user's dev server port (e.g., 3000, 5173). |

### Files You Need to EDIT (Existing Files)

| File Path to Edit | What to Change |
| :--- | :--- |
| `apps/examples/desktop-app/webview/app/page.tsx` | Import `PreviewPane`. Add a layout split (e.g. resizable panels via `ResizablePanelGroup` or tab switcher in `AgentHeader`) to display the preview side-by-side with chat. |
| `apps/examples/desktop-app/webview/lib/desktop-app-state.ts` | Add preview state fields to `DesktopAppState`: `previewOpen: boolean`, `previewUrl?: string`, `previewDevice: "desktop" \| "tablet" \| "mobile"`. |
| `apps/examples/desktop-app/sidecar/commands.ts` | Register new command handlers in the `commands.ts` switch/if chain: `start_preview_server`, `stop_preview_server`, `get_preview_url`. |
| `apps/examples/desktop-app/sidecar/types.ts` | Add command definitions to `ChatSessionCommandRequest` and new event types to `SidecarEvent` (e.g., `preview_updated`, `preview_reloaded`). |
| `apps/examples/desktop-app/sidecar/server.ts` | Mount the preview router or add HTTP endpoints under `/preview/*` if serving directly through the sidecar Bun HTTP server. |
| `apps/examples/desktop-app/sidecar/chat-session.ts` | In `handleToolExecutionFinished` or file mutation handlers (`write_to_file`), broadcast a `preview_reload` event so the preview updates automatically when the AI edits code. |

### Step-by-Step Code Blueprint:

#### 1. In `sidecar/commands.ts`:
```typescript
// Register preview commands in sidecar/commands.ts
if (command === "start_preview") {
  const root = String(args?.workspaceRoot || ctx.workspaceRoot);
  const port = Number(args?.port || 3300);
  const previewUrl = await startWorkspacePreviewServer(root, port);
  return { ok: true, url: previewUrl };
}

if (command === "reload_preview") {
  broadcastEvent("preview_reload", { timestamp: Date.now() });
  return { ok: true };
}
```

#### 2. In `webview/components/views/preview/preview-pane.tsx`:
```tsx
export function PreviewPane({ url, onClose }: { url: string; onClose: () => void }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      <div className="flex items-center justify-between p-2 border-b gap-2">
        <input value={url} readOnly className="text-xs px-2 py-1 bg-muted rounded flex-1" />
        <button onClick={() => setDevice(d => d === "desktop" ? "mobile" : "desktop")}>
          {device === "desktop" ? "Mobile View" : "Desktop View"}
        </button>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="flex-1 flex items-center justify-center p-2 bg-muted/30">
        <iframe
          src={url}
          sandbox="allow-scripts allow-forms allow-same-origin"
          className={cn("h-full border rounded bg-white transition-all", 
            device === "mobile" ? "w-[375px]" : "w-full"
          )}
        />
      </div>
    </div>
  );
}
```

---

## 3. How to Edit the Preview Feature

If preview is already implemented and you need to customize or fix it:

| Desired Modification | Files to Edit | Details |
| :--- | :--- | :--- |
| **Change Preview Layout / Split View** | `apps/examples/desktop-app/webview/app/page.tsx`<br>`apps/examples/desktop-app/webview/components/views/preview/preview-pane.tsx` | Change how the preview pane docks: toggle between bottom drawer, right split-screen (`ResizablePanel`), or separate floating window. |
| **Add Viewport Presets (Tablet, Mobile, Desktop)** | `apps/examples/desktop-app/webview/components/views/preview/preview-pane.tsx` | Add button controls with specific widths: iPhone (390px), iPad (768px), Responsive (100%). |
| **Modify Security / Sandbox Policy** | `apps/examples/desktop-app/webview/components/views/preview/preview-pane.tsx`<br>`apps/examples/desktop-app/sidecar/server.ts` | Edit the `sandbox="..."` attribute on `<iframe>`. Ensure you do NOT allow top-navigation or expose `window.desktopClient` or token APIs to the preview frame. |
| **Capture Console Logs & Errors** | `apps/examples/desktop-app/sidecar/preview-server.ts`<br>`apps/examples/desktop-app/webview/components/views/preview/preview-pane.tsx` | Inject a lightweight script tag into served HTML that listens to `window.console.error` and uses `postMessage` to send error logs to the parent preview pane. |
| **Auto-Reload on Code Edit** | `apps/examples/desktop-app/sidecar/chat-session.ts` | Locate where `ClineCore` emits tool execution events. When the tool is `write_to_file` or `replace_in_file`, invoke `broadcastEvent("preview_reload", {})`. |

---

## 4. How to Add or Edit MCP (Model Context Protocol)

MCP allows Zeck to connect to external tool providers (PostgreSQL, GitHub, Brave Search, Puppeteer, local scripts) via standard JSON-RPC over `stdio` or `sse`.

### Where MCP is Controlled in the Codebase:

```text
User Interface:
  apps/examples/desktop-app/webview/components/views/settings/mcp-view.tsx
      │  (UI toggles, server cards, OAuth trigger, add server modal)
      ▼
Desktop Transport Client:
  apps/examples/desktop-app/webview/lib/desktop-client.ts
      │  invoke("list_mcp_servers"), invoke("set_mcp_server_disabled"), etc.
      ▼
Sidecar Command Router:
  apps/examples/desktop-app/sidecar/commands.ts (Lines 2220–2360)
      │  Routes "list_mcp_servers", "authorize_mcp_server_oauth", etc.
      ▼
Sidecar MCP Orchestrator:
  apps/examples/desktop-app/sidecar/mcp.ts
  apps/examples/desktop-app/sidecar/mcp-oauth.ts
      │  Reads/writes configuration file (cline_mcp_settings.json)
      ▼
Core Agent Engine:
  @cline/core (parseMcpServerRegistration, probeMcpServerConnection, McpHub)
```

### Scenario A: Editing the MCP Settings UI
- **File to Edit**: `apps/examples/desktop-app/webview/components/views/settings/mcp-view.tsx`
- **What you can customize**:
  - Add search / filter bar to filter through registered MCP servers.
  - Change badges indicating whether an MCP server is `stdio` vs `sse`.
  - Add custom configuration fields (e.g. environment variable editor, working directory selector).
  - Add a "Test Connection" button that calls `invoke("probe_mcp_server", { name: server.name })`.

### Scenario B: Adding New MCP Commands to the Sidecar
- **File to Edit**: `apps/examples/desktop-app/sidecar/commands.ts`
- **Lines to Edit**: Around line 2220 (`// ── MCP server management ──`).
- **Example additions**:
  ```typescript
  if (command === "restart_mcp_server") {
    const name = String(args?.name ?? "").trim();
    // Disable then re-enable to restart child stdio process
    setMcpServerDisabled({ filePath: path, name, disabled: true });
    await sleep(200);
    setMcpServerDisabled({ filePath: path, name, disabled: false });
    return readMcpServersResponse();
  }
  ```

### Scenario C: Customizing MCP Storage Location or Pre-Configured Servers
- **File to Edit**: `apps/examples/desktop-app/sidecar/mcp.ts`
- **Key Functions**:
  - `resolveMcpSettingsPath()`: Returns the path to `cline_mcp_settings.json` (defaults to `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` or custom Zeck path).
  - `ensureMcpSettingsFile()`: Initializes default configuration. You can edit this to bundle built-in default MCP servers (like a local terminal tool, file searcher, or custom SQLite runner).

### Scenario D: Customizing MCP OAuth Flow
- **File to Edit**: `apps/examples/desktop-app/sidecar/mcp-oauth.ts`
- **What it does**: Handles browser OAuth redirects for MCP servers requiring authentication.
- **Customizations**: Changing the local callback redirect port (defaults to `3127`), changing URL opener logic (`openUrlInDefaultBrowser`), or managing token refresh.

---

## 5. How to Customize Agent Responses & Prompts

### Where Prompt Generation Lives:
The agent's personality, rules, tool formatting, and markdown instructions are assembled in two places:
1. **Shared Prompt Builder**: `@cline/shared` (`buildClineSystemPrompt`).
2. **Desktop Session Adapter**: `apps/examples/desktop-app/sidecar/chat-session.ts`.

### How to Edit the System Prompt:
- **File to Edit**: `apps/examples/desktop-app/sidecar/chat-session.ts`
- Locate the prompt preparation block in `chat-session.ts`:
  ```typescript
  // In chat-session.ts, locate buildClineSystemPrompt call
  const systemPrompt = await buildClineSystemPrompt({
    cwd: workspaceRoot,
    supportsComputerUse: false,
    mcpHub,
    // ...
  });
  ```
- **To inject custom instructions for Zeck**:
  You can append or prepend custom system instructions right before the session config is passed to `sessionManager.start()` or `sessionManager.send()`:
  ```typescript
  const customInstructions = `
  You are Zeck, a high-performance AI coding assistant.
  - Be concise, accurate, and direct.
  - When editing files, prioritize surgical diffs.
  - Always explain the files modified at the end of the turn.
  `;
  // Inject into coreSessionConfig.customInstructions or append to system prompt
  ```

### How to Edit Streaming Responses (Backend):
- **File to Edit**: `apps/examples/desktop-app/sidecar/chat-session.ts`
- **Event listener**:
  ```typescript
  sessionManager.subscribe((event) => {
    // event types: "chat_text", "chat_reasoning", "tool_call", "status"
    broadcastEvent("chat_event", event);
  });
  ```
- You can filter, transform, or sanitize stream chunks here (for example, stripping internal tokens or formatting reasoning blocks).

### How to Edit How Responses are Rendered in the UI (Frontend):

| Component to Edit | File Path | Purpose |
| :--- | :--- | :--- |
| **Main Message List** | `apps/examples/desktop-app/webview/components/views/chat/chat-messages.tsx` | Controls scroll anchoring, auto-scroll to bottom, grouping of consecutive user/assistant messages. |
| **Message Bubble** | `apps/examples/desktop-app/webview/components/views/chat/messages/message-bubble.tsx` | Styles the user bubble vs assistant bubble, avatar icon, timestamps, copy-to-clipboard buttons. |
| **Markdown Renderer** | `apps/examples/desktop-app/webview/components/ui/markdown.tsx` | Syntax highlighting for code blocks (using Prism or Shiki), table rendering, and link handling. |
| **Tool Execution Block** | `apps/examples/desktop-app/webview/components/views/chat/messages/tool-message-block.tsx` | Renders file write boxes, terminal output blocks, search tool cards, with collapsible output. |
| **Reasoning / Thought Block** | `apps/examples/desktop-app/webview/components/views/chat/messages/reasoning-block.tsx` | Renders collapsible "Thinking..." accordions for models that support chain-of-thought (e.g., DeepSeek R1, Claude Extended Thinking). |
| **Tool Approval Dialog** | `apps/examples/desktop-app/webview/components/views/chat/messages/tool-approval-panel.tsx` | Renders the "Approve / Reject" action bar when the agent requests permission to run shell commands or edit files. |

---

## 6. How to Edit the First Main Page

When a user opens Zeck and has no active chat history, the app renders the **Welcome / First Screen**.

```text
apps/examples/desktop-app/webview/app/page.tsx
  └── Evaluates: if (hasActiveMessages) -> <ChatMessages />
                 else -> <WelcomeScreen />
                           ├── <AgentWelcomeHero /> (Greeting / Logo / Tagline)
                           ├── <WelcomeWorkspaceControls /> (Current workspace folder picker & branch)
                           ├── <WelcomeSetupNotice /> (Provider connection warnings)
                           ├── <AgentQuickActions /> (Suggested prompt buttons)
                           └── <ChatInputBar /> (Bottom prompt composer)
```

### Key Files for the Main / Welcome Page:

| File Path | What It Controls |
| :--- | :--- |
| `apps/examples/desktop-app/webview/components/views/chat/welcome-chat.tsx` | **The primary Welcome Screen component**. Defines the layout of the initial landing view, suggested tasks, agenda reminders, and workspace cards. |
| `apps/examples/desktop-app/webview/components/views/chat/welcome-workspace-controls.tsx` | The workspace picker on the welcome page (folder name, change folder button, Git branch status, recent projects). |
| `apps/examples/desktop-app/webview/components/views/chat/welcome-setup-notice.tsx` | The notification banner shown when no API key or LLM provider has been configured yet. |
| `apps/examples/desktop-app/webview/components/views/chat/chat-input-bar.tsx` | The prompt composer (input textarea, model selector pill, attachment button, slash command menu `/`). |
| `apps/examples/desktop-app/webview/app/page.tsx` | The master layout controller that toggles between `<WelcomeScreen />` and `<ChatMessages />` based on `sessionState.messages.length`. |

### How to Modify the First Main Page:

#### 1. Changing the Welcome Hero & Greeting:
In `apps/examples/desktop-app/webview/components/views/chat/welcome-chat.tsx`, look at line 6:
```tsx
import { AgentQuickActions, AgentWelcomeHero } from "@cline/ui";
```
You can replace `<AgentWelcomeHero />` with your own custom branded header:
```tsx
<div className="flex flex-col items-center justify-center text-center py-8">
  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4 font-bold text-xl">
    Z
  </div>
  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
    Welcome to Zeck
  </h1>
  <p className="text-sm text-muted-foreground mt-1 max-w-md">
    Your autonomous software engineering partner. Choose a workspace below or type a prompt to begin.
  </p>
</div>
```

#### 2. Changing Suggested Prompt Buttons (Quick Actions):
In `welcome-chat.tsx`, edit `actions` / `quickActionTasks`:
```tsx
const defaultQuickActions: AgentQuickAction[] = [
  { id: "1", label: "Analyze Workspace", description: "Review repository architecture", value: "Explain the architecture of this project" },
  { id: "2", label: "Find Bugs", description: "Audit for errors or security issues", value: "Audit the codebase for potential bugs and performance bottlenecks" },
  { id: "3", label: "Add Unit Tests", description: "Generate tests for core modules", value: "Generate comprehensive unit tests for the main components" },
];
```

#### 3. Customizing the Empty Workspace State:
In `welcome-workspace-controls.tsx`, customize what happens when no directory is selected (e.g., add a drag-and-drop folder dropzone or a list of recent git repositories).

---

## 7. How to Add or Edit Tools & Permissions

Zeck's agent can execute built-in tools (e.g., `execute_command`, `read_file`, `write_to_file`, `search_files`).

### Where Tools are Managed:

```text
1. Tool Declarations:
   @cline/core (getCoreBuiltinToolCatalog)
   
2. Execution & Approval in Sidecar:
   apps/examples/desktop-app/sidecar/chat-session.ts (requestToolApproval)
   
3. Approval UI in Webview:
   apps/examples/desktop-app/webview/components/views/chat/messages/tool-approval-panel.tsx
   
4. Summaries & Visual Display:
   apps/examples/desktop-app/webview/components/views/chat/messages/tool-summaries.ts
   apps/examples/desktop-app/webview/components/views/chat/messages/tool-message-block.tsx
```

### Steps to Add a New Custom Tool:
1. **Define the tool schema** in `@cline/core` or your custom prompt addendum in `sidecar/chat-session.ts`.
2. **Handle tool approval** in `sidecar/chat-session.ts`: if the tool requires user confirmation, verify `capabilities.requestToolApproval` pushes an event to the frontend.
3. **Handle rendering** in `tool-summaries.ts`: add a human-readable summary (e.g., `"Deploying to Cloud..."` or `"Running Database Migration..."`).
4. **Handle UI icon** in `tool-icons.ts`: map your tool name to a Lucide icon.

---

## 8. File-by-File Master Reference Matrix

Use this quick-reference table when deciding which file to touch:

| Feature / Goal | Files to Add (Create) | Files to Edit |
| :--- | :--- | :--- |
| **Add Web Preview** | `webview/.../preview/preview-pane.tsx`<br>`webview/.../preview/use-preview.ts`<br>`sidecar/preview-server.ts` | `webview/app/page.tsx`<br>`webview/lib/desktop-app-state.ts`<br>`sidecar/commands.ts`<br>`sidecar/server.ts`<br>`sidecar/types.ts` |
| **Edit Preview Behavior** | *None* | `webview/.../preview/preview-pane.tsx`<br>`sidecar/server.ts`<br>`sidecar/chat-session.ts` |
| **Add / Edit MCP Server** | *None* | `webview/components/views/settings/mcp-view.tsx`<br>`sidecar/mcp.ts`<br>`sidecar/commands.ts`<br>`sidecar/mcp-oauth.ts` |
| **Change System Prompt / Persona** | *None* | `sidecar/chat-session.ts`<br>`@cline/shared` (prompt builders) |
| **Change Response Markdown / Bubbles** | *None* | `webview/.../chat/messages/message-bubble.tsx`<br>`webview/.../chat/messages/tool-message-block.tsx`<br>`webview/components/ui/markdown.tsx` |
| **Edit Main Welcome Screen** | *None* | `webview/components/views/chat/welcome-chat.tsx`<br>`webview/.../chat/welcome-workspace-controls.tsx`<br>`webview/app/page.tsx` |
| **Add New LLM Provider** | *None* | `webview/components/views/settings/add-provider.tsx`<br>`webview/components/views/settings/provider-list-view.tsx`<br>`sidecar/commands.ts`<br>`@cline/llms` |
| **Session Workspaces & Storage Isolation** | *None* | `sdk/packages/core/src/services/workspace/chat-workspace.ts`<br>`apps/cline-hub/src/server/sessions.ts`<br>`apps/cline-hub/src/webview/src/Chat.tsx` |
| **Change Global Theme / Design Tokens** | *None* | `webview/app/globals.css`<br>`webview/lib/theme.ts`<br>`sdk/packages/ui/theme/*` |

---

## 9. Development, Build, & Verification Commands

To test your edits in Zeck:

```bash
# Navigate to Desktop App
cd apps/examples/desktop-app

# 1. Typecheck the Desktop TypeScript files
bun run typecheck

# 2. Run Headless Dev Server (Webview on 3125, Sidecar on 3126)
bun run dev:sidecar   # Terminal 1: Starts Bun Sidecar
bun run dev:web       # Terminal 2: Starts Next.js Webview

# 3. Run Native Tauri Desktop Application
bun run dev

# 4. Run UI Component Tests
bun run test:chat-ui
bun run test:settings-ui
bun run test:sidecar

# 5. Build Desktop Production Package
bun run build
```

---
*Document created for Zeck Developers. Keep this file updated as new features and endpoints are introduced.*
