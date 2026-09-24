export const HUB_THEME_STORAGE_KEY = "cline-hub-theme";

export type HubTheme = "light" | "dark";

export function readStoredHubTheme(): HubTheme | null {
	const stored = window.localStorage.getItem(HUB_THEME_STORAGE_KEY);
	return stored === "light" || stored === "dark" ? stored : null;
}

export function readSystemHubTheme(): HubTheme {
	const kind = document.body.dataset.vscodeThemeKind;
	return kind === "vscode-dark" || kind === "vscode-high-contrast"
		? "dark"
		: "light";
}

export function applyHubTheme(theme: HubTheme): HubTheme {
	document.documentElement.classList.toggle("dark", theme === "dark");
	document.documentElement.dataset.clineHubTheme = theme;
	return theme;
}

export function syncHubTheme(): HubTheme {
	return applyHubTheme(readStoredHubTheme() ?? readSystemHubTheme());
}

export const HUB_ACCENT_STORAGE_KEY = "cline-hub-accent";

export type HubAccent = "blue" | "emerald" | "violet" | "amber" | "rose" | "zinc";

export function readStoredHubAccent(): HubAccent | null {
	const stored = window.localStorage.getItem(HUB_ACCENT_STORAGE_KEY);
	return stored as HubAccent | null;
}

export function setStoredHubAccent(accent: HubAccent): HubAccent {
	window.localStorage.setItem(HUB_ACCENT_STORAGE_KEY, accent);
	return accent;
}

export function setStoredHubTheme(theme: HubTheme): HubTheme {
	window.localStorage.setItem(HUB_THEME_STORAGE_KEY, theme);
	return applyHubTheme(theme);
}
