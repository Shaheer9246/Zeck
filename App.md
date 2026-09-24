# Cline Desktop App Guide

This document describes the current Desktop app after the production VS Code extension was removed. The Desktop package is `@cline/code` and lives at:

```text
apps/examples/desktop-app
```

The Desktop app is a Tauri v2 shell around a Next.js webview and a Bun sidecar. The sidecar connects the UI to the shared Cline Hub/Core runtime.

## High-Level Architecture

```text
Tauri native shell
        |
        v
Next.js + React webview  <---- WebSocket / HTTP ---->  Bun sidecar
                                                          |
                                                          v
                                                Shared Cline Hub client
                                                          |
                                                          v
                                             @cline/core / @cline/llms
                                                          |
                                                          v
                                             Provider, tools, MCP, sessions
```

The Desktop app does not contain a private copy of the agent runtime. It connects to the canonical shared Hub. This allows the CLI and Desktop to observe compatible sessions and use the same core behavior.

## Important Directories

### Desktop package root

`apps/examples/desktop-app/`

Important files:

- `package.json`: scripts, dependencies, and package name `@cline/code`.
- `bun.mts`: Desktop build/runtime orchestration.
- `README.md`: Desktop-specific development notes.
- `EXPERIMENTAL.md`: experimental Desktop features and limitations.
- `tsconfig.json`: base TypeScript configuration.
- `tsconfig.dev.json`: development typecheck configuration.
- `vitest.config.ts`: Desktop test configuration.

### Webview

`apps/examples/desktop-app/webview/`

This is the React/Next.js user interface. It contains:

- Chat UI and message rendering.
- Composer and prompt input.
- Settings and provider configuration.
- MCP configuration and OAuth controls.
- Session history and session restoration views.
- Workspace and Git controls.
- Tool approval and question dialogs.
- Preview-capable UI components and browser-facing transport helpers.

The webview communicates with the sidecar through the Desktop transport client. It should not directly own provider credentials, filesystem operations, agent execution, or tool approval resolution.

### Sidecar

`apps/examples/desktop-app/sidecar/`

The sidecar is a Bun process that owns the Desktop-to-Hub boundary.

Important files:

- `index.ts`: process entry point and startup/shutdown lifecycle.
- `server.ts`: Bun HTTP server and WebSocket transport.
- `context.ts`: shared sidecar state, session manager, event broadcast, and approval state.
- `chat-session.ts`: Desktop chat-session adapter around `ClineCore`.
- `commands.ts`: command router for frontend requests.
- `types.ts`: transport, session, and sidecar types.
- `client-context.ts`: Desktop identity and telemetry context.
- `paths.ts`: workspace and application path resolution.
- `session-data/`: session discovery, messages, artifacts, and search.
- `attachments.ts`: attachment materialization and cleanup.
- `mcp.ts` and `mcp-oauth.ts`: MCP configuration and authorization.
- `connectors.ts`: external connector/CLI integration.
- `desktop-settings.ts`: Desktop-specific settings persistence.
- `provider settings` modules: local provider configuration and OAuth handling.
- `ARCHITECTURE.md`: lower-level sidecar design and command map.

### Tauri shell

`apps/examples/desktop-app/src-tauri/`

This contains the native application shell and platform packaging configuration:

- `src/main.rs`: native Tauri entry point.
- `tauri.conf.json`: default application configuration.
- `tauri.dev.conf.json`: development configuration.
- `tauri.release.conf.json`: release configuration.
- `tauri.beta.conf.json`: beta configuration.
- `tauri.windows.conf.json`: Windows-specific configuration.
- `capabilities/default.json`: Tauri permissions/capabilities.
- `icons/`: application and platform icons.
- `dmg/`: macOS installer background assets.

## Startup Flow

### Native Desktop startup

Run:

```bash
cd apps/examples/desktop-app
bun run dev
```

The development flow is:

1. Tauri starts with `src-tauri/tauri.dev.conf.json`.
2. The configured development command builds or starts the UI and sidecar.
3. The native shell opens the Desktop window.
4. The sidecar starts on `127.0.0.1:3126` by default.
5. The Next.js webview runs on `http://localhost:3125`.
6. The webview connects to `ws://127.0.0.1:3126/transport`.
7. The sidecar initializes the shared Hub/Core session manager.
8. The UI can then list sessions, start tasks, stream output, and resolve approvals.

Headless development is useful when the native window is not needed:

```bash
bun run dev:sidecar
bun run dev:web
```

The sidecar prints a JSON `ready` message containing the HTTP endpoint, WebSocket endpoint, process ID, and mode.

## Sidecar Startup Details

`sidecar/index.ts` performs these operations:

1. Confirms it is running under Bun.
2. Resolves the workspace root.
3. Sets the home directory when needed.
4. Configures connector CLI launching.
5. Creates Desktop observability and telemetry.
6. Creates the sidecar context.
7. Resolves the login-shell `PATH` so tools such as `gh` are available to spawned processes.
8. Seeds the global web-search setting only when the user has not set it.
9. Prewarms workspace metadata.
10. Initializes the shared session manager.
11. Starts the HTTP/WebSocket server.
12. Watches for a managed Hub build mismatch.
13. Prints the connection endpoint to stdout.
14. Handles SIGINT, SIGTERM, uncaught exceptions, and unhandled rejections.

The sidecar uses a five-second shutdown timeout.

## WebSocket Transport

The transport protocol is defined in `sidecar/ARCHITECTURE.md` and implemented by `sidecar/server.ts`.

Request shape:

```json
{
  "type": "command",
  "id": "request-id",
  "command": "command_name",
  "args": {}
}
```

Response shape:

```json
{
  "type": "response",
  "id": "request-id",
  "ok": true,
  "result": {}
}
```

Event shape:

```json
{
  "type": "event",
  "event": {
    "name": "event_name",
    "payload": {}
  }
}
```

The WebSocket endpoint is `/transport`. The server also exposes `/health` and HTTP APIs such as the marketplace catalog endpoint.

Security behavior:

- Browser origins are checked against the trusted-origin list.
- The approval token is passed as the `approval_token` query parameter.
- Only a browser client with a valid origin and approval token can receive or resolve tool approvals.
- Originless local clients remain supported for non-browser integrations but cannot approve tools.
- The server attempts the preferred port first and falls back to an OS-assigned port.

The frontend transport helper is under `webview/lib/desktop-transport` and provides the UI-facing `invoke()` and subscription behavior.

## Command and Event Flow

A typical user action follows this path:

1. A React component calls the Desktop transport client.
2. The client sends a command request over WebSocket.
3. `sidecar/server.ts` decodes the request.
4. `sidecar/commands.ts` routes the command.
5. The command calls Core, Hub, a session store, filesystem code, or an OS command.
6. The sidecar returns a response and/or broadcasts events.
7. The webview updates React state and renders the result.

Streaming task output follows the same boundary, except the sidecar broadcasts incremental chat events instead of waiting for one final response.

## Task Execution Flow

The central Desktop task adapter is:

```text
apps/examples/desktop-app/sidecar/chat-session.ts
```

The task flow is:

1. The user enters a prompt in the webview composer.
2. The webview sends a chat-session command to the sidecar.
3. `chat-session.ts` validates the session/workspace state.
4. Attachments are materialized when present.
5. Runtime slash commands such as `/skill`, `/workflow`, `/team`, and `/fork` are resolved.
6. The Desktop session configuration is split and passed to `ClineCore`.
7. Core starts or resumes the session through the shared Hub.
8. Core invokes the selected provider and built-in/MCP tools.
9. Tool approvals and user questions are sent back to the webview through sidecar events.
10. The webview responds with approval/question results.
11. The sidecar resolves the waiting promise and Core continues execution.
12. Streaming text, reasoning, tool calls, status changes, and completion events are broadcast to the UI.
13. Session messages and artifacts are persisted through the session-data helpers.
14. Attachments and temporary materialized files are cleaned up when appropriate.

The sidecar keeps approval and question promise maps in memory while the webview is connected.

## System Prompt Ownership

`sidecar/chat-session.ts` imports prompt-related helpers from `@cline/shared`, including:

- `buildClineSystemPrompt`
- `formatUserCommandBlock`

The Desktop adapter also calls Core APIs such as `ClineCore`, `splitCoreSessionConfig`, and `createUserInstructionConfigService`.

For system-prompt work, inspect in this order:

1. `apps/examples/desktop-app/sidecar/chat-session.ts` for Desktop-specific prompt preprocessing.
2. `sdk/packages/shared` for shared prompt builders and formatting helpers.
3. `sdk/packages/core` for the agent/session runtime that consumes the prompt.
4. The provider/model request path under `sdk/packages/llms` when provider-specific behavior matters.

A Desktop-only prompt change belongs at the sidecar adapter boundary. A behavior that must be identical across Desktop, CLI, and other clients belongs in the shared SDK/Core layer.

Do not put secrets, provider credentials, or filesystem authority in the system prompt. Keep those concerns in the sidecar/Core boundary.

## Preview Feature Insertion Points

For a preview system, separate the responsibilities:

- UI rendering and preview controls: `apps/examples/desktop-app/webview/`.
- Webview-to-backend commands: the Desktop transport helper and `sidecar/commands.ts`.
- Workspace file access or generated preview artifacts: sidecar code, not React components.
- Task/agent instructions for creating preview content: `sidecar/chat-session.ts` or shared Core prompt assembly, depending on whether the rule is Desktop-only or universal.
- Security policy for preview content: sidecar/server boundary, with explicit origin and filesystem checks.

A preview panel should not execute arbitrary generated HTML directly in the main application context. Use an isolated browser surface or sandboxed iframe with a narrow message bridge, and keep the host app's transport/token APIs unavailable to preview content.

## MCP Skills and Other Features

MCP configuration and authorization are handled by the sidecar command layer. The usual path is:

```text
React settings component
  -> Desktop transport command
  -> sidecar/commands.ts
  -> sidecar/mcp.ts or shared Core MCP APIs
  -> WebSocket response/event
```

Skills, rules, and workflows are resolved through Core's user-instruction configuration service. Runtime slash commands are expanded in `chat-session.ts` before the prompt is dispatched, subject to mode and tool availability.

New feature placement rule:

- Pure presentation: webview.
- OS/filesystem/provider credentials: sidecar.
- Agent behavior shared by all clients: SDK/Core.
- Desktop-only task behavior: sidecar adapter.
- Native window/permissions/packaging: Tauri files.

## Package Commands

From `apps/examples/desktop-app`:

```bash
bun run dev
bun run dev:sidecar
bun run dev:web
bun run dev:headless
bun run build
bun run build:web
bun run build:sidecar
bun run build:sidecar:bin
bun run build:binary
bun run typecheck
bun run test:chat-ui
bun run test:settings-ui
bun run test:sidecar
bun run package
bun run package:desktop:mac
bun run package:desktop:windows
bun run package:desktop:linux
```

The repository-level validation used during extension removal was:

```bash
bun run build:sdk
bun -F @cline/cli build
bun -F @cline/cline-hub build:webview
bun -F @cline/code typecheck
```

## Practical Editing Checklist

Before changing task or prompt behavior:

1. Identify whether the change is Desktop-only or shared across clients.
2. Trace the command from the webview component to `sidecar/commands.ts`.
3. Trace task/prompt behavior through `sidecar/chat-session.ts`.
4. Keep long-running agent work in Core/Hub rather than in React handlers.
5. Use typed transport commands and events.
6. Preserve approval and question promise resolution.
7. Add focused tests beside the sidecar or webview code being changed.
8. Run `bun -F @cline/code typecheck`.
9. Run the relevant Desktop test script.
10. Rebuild SDK packages before testing changes to shared SDK/Core source.
