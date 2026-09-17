# Repository Changes

Date: 2026-09-17

This document records the production VS Code extension removal and the cleanup performed afterward. The changes are currently uncommitted.

## Goal

Keep the Cline Desktop app, CLI, SDK, Hub, and shared agent runtime. Remove the production Cline VS Code extension and its rollout/publishing machinery.

The preserved example at `apps/examples/vscode` was intentionally not removed.

## Removed Production Extension

### Main directories

- Deleted `apps/vscode/`.
- Deleted `apps/vscode-rollout/`.
- Deleted 1,376 tracked files total:
  - 1,359 files from `apps/vscode`.
  - 17 files from `apps/vscode-rollout`.

The deleted production extension package was named `claude-dev`.

### Workspace and dependency cleanup

- Removed these explicit workspace entries from the root `package.json`:
  - `apps/vscode/webview-ui`
  - `apps/vscode/testing-platform`
- Preserved the broad `apps/*` workspace glob.
- Preserved `apps/examples/vscode/src/webview`.
- Ran `bun install`.
- Bun reported four packages removed during installation.
- `bun.lock` was regenerated so the deleted extension workspace packages and their dependency graph are no longer represented.

## Removed Extension-Only Support

- Deleted `.vscode/launch.json`, which contained extension-host launch configurations.
- Deleted `.vscode/tasks.json`, which contained extension compilation, proto, webview, and watch tasks.
- Removed extension-only recommendations from `.vscode/extensions.json`:
  - `connor4312.esbuild-problem-matchers`
  - `ms-vscode.extension-test-runner`
- Removed obsolete extension paths from `.vscode/settings.json` while keeping shared Biome/editor settings.
- Deleted `.cline/skills/publish-extension/SKILL.md`.
- Deleted the linked publishing skill entries:
  - `.agents/skills/publish-extension`
  - `.claude/skills/publish-extension`
- Deleted 15 pending Changesets whose package target was `claude-dev`.

## Hook and Ignore Cleanup

- Updated `.husky/pre-commit`:
  - Before: changed directory to `apps/vscode` before running `lint-staged`.
  - After: runs `bunx lint-staged` from the repository root.
- Removed ignored/generated paths that only belonged to the VS Code extension from `.gitignore`.
- Removed the same obsolete extension paths from `sdk/.gitignore`.
- Removed the deleted extension path from `biome.json` ignore configuration.

## Documentation Cleanup

Updated active documentation so it no longer presents the removed production extension as part of the current product surface:

- `AGENTS.md`: removed the VS Code extension development section.
- `README.md`: removed the VS Code Marketplace product block.
- `apps/cli/README.md`: removed the VS Code extension link and changed the shared-surface description to reference Desktop, JetBrains, and SDK.
- `docs/cline-overview.mdx`: removed the VS Code extension card.

Historical references remain intentionally in some files, including old changelog entries and legacy contributor/rule documentation. They are not runtime dependencies.

## Preserved Products

These were not deleted:

- `apps/examples/desktop-app`
- `apps/cli`
- `apps/cline-hub`
- `sdk/`
- `apps/examples/vscode`
- Shared UI and shared agent packages

## Validation Performed

All checks below passed after the removal:

```text
SDK: PASS
CLI: PASS
HUB: PASS
DESKTOP: PASS
DIFF: PASS
```

Commands used:

```bash
bun install
bun run build:sdk
bun -F @cline/cli build
bun -F @cline/cline-hub build:webview
bun -F @cline/code typecheck
git diff --check HEAD
```

The final Desktop typecheck also passed after the documentation and configuration cleanup.

## Current Git State

At the point this document was created:

- 1,396 files were deleted or modified by the removal work.
- 1,376 of those were files under the two production extension directories.
- The remaining changes are workspace, lockfile, hook, documentation, editor configuration, ignore rules, publishing metadata, and Changeset cleanup.
- No commit or push was performed.

To inspect every changed path:

```bash
git status --short
git diff --name-status HEAD
```

## Important Boundary

This work removed the production VS Code extension. It did not convert the extension into the CLI. The CLI already exists independently in `apps/cli` and uses the shared SDK/Core packages. The Desktop app is independently implemented in `apps/examples/desktop-app`.
