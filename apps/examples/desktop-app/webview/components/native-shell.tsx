"use client";

import { useEffect } from "react";

async function triggerDevTools(): Promise<void> {
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("open_devtools");
	} catch {
		// DevTools invoke unavailable in plain browser mode
	}
}

/**
 * Native shell controller.
 * Enables developer tools (F12, Ctrl+Shift+I) and native context menu (Inspect).
 */
export function NativeShell() {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === "F12" ||
				((event.ctrlKey || event.metaKey) &&
					event.shiftKey &&
					event.key.toLowerCase() === "i")
			) {
				event.preventDefault();
				void triggerDevTools();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	return null;
}

