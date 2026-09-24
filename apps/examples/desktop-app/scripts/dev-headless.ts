import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

const approvalToken = randomUUID();
const children: ReturnType<typeof Bun.spawn>[] = [];

async function reserveAvailablePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Failed to reserve a sidecar port"));
				return;
			}
			server.close((error) => (error ? reject(error) : resolve(address.port)));
		});
	});
}

function spawn(command: string[], env: Record<string, string>) {
	const child = Bun.spawn(command, {
		cwd: import.meta.dir + "/..",
		env: { ...process.env, ...env },
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	children.push(child);
	return child;
}

function stopChildren(): void {
	for (const child of children) {
		if (!child.killed) child.kill();
	}
}

process.on("SIGINT", stopChildren);
process.on("SIGTERM", stopChildren);

async function main(): Promise<void> {
	const sidecarPort = await reserveAvailablePort();
	const codespaces = process.env.CODESPACES === "true";
	const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
	const codespaceName = process.env.CODESPACE_NAME;
	const publicHost =
		codespaces && forwardingDomain && codespaceName
			? `${codespaceName}-${sidecarPort}.${forwardingDomain}`
			: `127.0.0.1:${sidecarPort}`;
	const endpointProtocol = codespaces ? "wss" : "ws";
	const endpoint = `${endpointProtocol}://${publicHost}/transport?approval_token=${approvalToken}`;
	const trustedOrigin =
		codespaces && forwardingDomain && codespaceName
			? `https://${codespaceName}-3125.${forwardingDomain}`
			: "";
	const sidecar = spawn(["bun", "run", "sidecar/index.ts"], {
		CLINE_SIDECAR_APPROVAL_TOKEN: approvalToken,
		CLINE_SIDECAR_PORT: String(sidecarPort),
		CLINE_SIDECAR_HOST: codespaces ? "0.0.0.0" : "127.0.0.1",
		CLINE_SIDECAR_TRUSTED_ORIGINS: trustedOrigin,
	});
	const web = spawn(
		["bun", "run", "next", "dev", "webview", "-p", "3125", "--turbo"],
		{ NEXT_PUBLIC_SIDECAR_WS_ENDPOINT: endpoint },
	);

	const exitCode = await Promise.race([sidecar.exited, web.exited]);
	stopChildren();
	await Promise.allSettled(children.map((child) => child.exited));
	process.exit(exitCode);
}

void main();
