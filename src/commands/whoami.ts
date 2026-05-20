import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import {
	credatDir,
	delegationExists,
	loadDelegationFile,
	type SerializedAgent,
	type SerializedOwner,
} from "../utils.js";

interface WhoamiOptions {
	json?: boolean;
}

export function whoamiCommand(options: WhoamiOptions = {}): void {
	const dir = credatDir();
	const agentPath = join(dir, "agent.json");

	if (!existsSync(agentPath)) {
		if (options.json) {
			console.log(
				JSON.stringify({ agent: null, owner: null, delegation: false }),
			);
			return;
		}
		console.log(
			`  ${pc.red("✗")} No agent identity. Run ${pc.bold("credat init")} first.`,
		);
		return;
	}

	const agent = JSON.parse(readFileSync(agentPath, "utf-8")) as SerializedAgent;

	const ownerPath = join(dir, "owner.json");
	const owner = existsSync(ownerPath)
		? (JSON.parse(readFileSync(ownerPath, "utf-8")) as SerializedOwner)
		: null;

	const hasDelegation = delegationExists();
	const delegation = hasDelegation ? loadDelegationFile() : null;

	if (options.json) {
		console.log(
			JSON.stringify({
				agent: {
					did: agent.did,
					algorithm: agent.algorithm,
					domain: agent.domain,
					path: agent.path,
				},
				owner: owner ? { did: owner.did } : null,
				delegation: hasDelegation,
				scopes: delegation?.claims.scopes ?? null,
			}),
		);
		return;
	}

	// One-liner identity display
	const parts = [
		pc.green(agent.did),
		pc.dim(`(${agent.algorithm}, ${agent.domain})`),
	];

	if (owner) {
		parts.push(pc.dim("→ delegated by"), pc.cyan(owner.did));
	}

	if (delegation) {
		const scopes = delegation.claims.scopes.map((s) => pc.yellow(s)).join(", ");
		parts.push(pc.dim("["), scopes, pc.dim("]"));
	}

	console.log(`  ${parts.join(" ")}`);
}
