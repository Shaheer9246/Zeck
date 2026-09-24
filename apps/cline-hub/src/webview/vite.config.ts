import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

let reactPlugin: any;
try {
	const mod = await import("@vitejs/plugin-react-swc");
	reactPlugin = mod.default || mod;
} catch {
	try {
		const mod = await import("@vitejs/plugin-react");
		reactPlugin = mod.default || mod;
	} catch {
		reactPlugin = () => ({ name: "react-noop" });
	}
}

const mermaidChunkGroups = [
	{
		name: "mermaid-parser",
		maxSize: 450_000,
		test: /node_modules[\\/](?:\.bun[\\/])?@mermaid-js[+]parser/,
	},
	{
		name: "mermaid-langium",
		test: /node_modules[\\/](?:\.bun[\\/])?langium/,
	},
	{
		name: "mermaid-layout",
		maxSize: 450_000,
		test: /node_modules[\\/](?:\.bun[\\/])?(?:cytoscape|cytoscape-cose-bilkent|dagre|elkjs)/,
	},
	{
		name: "mermaid-markup",
		test: /node_modules[\\/](?:\.bun[\\/])?(?:katex|dompurify)/,
	},
];

export default defineConfig({
	plugins: [reactPlugin(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@base-ui/react": path.resolve(__dirname, "./node_modules/@base-ui/react"),
			"@base-ui/utils": path.resolve(__dirname, "../../../../node_modules/.bun/@base-ui+utils@0.3.2+0ea9ec2a211d4613/node_modules/@base-ui/utils"),
		},
		preserveSymlinks: true,
		dedupe: ["react", "react-dom"],
	},
	base: "./",
	server: {
		cors: true,
		headers: {
			"Access-Control-Allow-Origin": "*",
		},
		hmr: {
			host: "localhost",
		},
	},
	build: {
		outDir: "../../dist/webview",
		emptyOutDir: true,
		cssMinify: "esbuild",
		chunkSizeWarningLimit: 600,
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: mermaidChunkGroups,
				},
			},
		},
	},
});
