/// <reference types="@types/bun" />
export {};

type PackageManifest = {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

const packageJson = (await Bun.file(
	new URL("./package.json", import.meta.url),
).json()) as PackageManifest;

// Keep published third-party runtime packages external, but bundle internal workspace code.
const external = Object.keys({
	...(packageJson.dependencies ?? {}),
	...(packageJson.peerDependencies ?? {}),
}).filter((name) => !name.startsWith("@cline/"));

type BuildMode = "package" | "bundle" | "dev";
const rawMode = Bun.env.BUILD_MODE ?? "package";
const buildMode: BuildMode =
	rawMode === "bundle" || rawMode === "dev" ? rawMode : "package";

const shouldEmitTypes = buildMode === "package";
const sourcemap = Bun.env.CLINE_SOURCEMAPS === "1" ? "linked" : "none";
// minify: true keeps identifier mangling active even when sourcemaps are enabled.
const minify = Bun.env.CLINE_SOURCEMAPS !== "1";

const runBuild = async (
	name: string,
	options: Parameters<typeof Bun.build>[0],
) => {
	const result = await Bun.build({
		...options,
		throw: false,
	});

	if (result.logs && result.logs.length > 0) {
		console.warn(`${name} build emitted ${result.logs.length} logs:`);
		for (const log of result.logs) {
			console.error(log);
		}
	}

	if (!result.success) {
		const formattedErrors = (result.logs ?? [])
			.map((log) => (typeof log === "object" && log !== null && "message" in log ? log.message : String(log)))
			.join("\n");
		throw new Error(`Failed ${name} build:\n${formattedErrors}`);
	}
};

await runBuild("node", {
	entrypoints: [
		"./src/index.ts",
		"./src/automation/index.ts",
		"./src/db/index.ts",
		"./src/node.ts",
		"./src/remote-config/index.ts",
		"./src/storage/index.ts",
	],
	outdir: "./dist",
	target: "node",
	external,
	packages: "bundle",
	minify,
	sourcemap,
});

await runBuild("browser", {
	entrypoints: ["./src/index.browser.ts"],
	outdir: "./dist",
	target: "browser",
	external,
	packages: "bundle",
	minify,
	sourcemap,
});

if (shouldEmitTypes) {
	const tsc = Bun.spawn(
		["bun", "tsc", "--emitDeclarationOnly", "--project", "tsconfig.build.json"],
		{
			stdout: "inherit",
			stderr: "inherit",
		},
	);

	const exitCode = await tsc.exited;
	if (exitCode !== 0) {
		throw new Error(`Declaration build failed with exit code ${exitCode}`);
	}
}
