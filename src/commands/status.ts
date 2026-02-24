import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import {
	credatDir,
	fail,
	header,
	label,
	type SerializedAgent,
	type SerializedOwner,
	success,
} from "../utils.js";

interface DelegationFile {
	raw: string;
	claims: {
		sub?: string;
		iss?: string;
		scope?: string;
		exp?: number;
		nbf?: number;
		constraints?: Record<string, unknown>;
	};
}

interface StatusOptions {
	json?: boolean;
}

export function statusCommand(options: StatusOptions = {}): void {
	const dir = credatDir();

	const agentPath = join(dir, "agent.json");
	const agent = existsSync(agentPath)
		? (JSON.parse(readFileSync(agentPath, "utf-8")) as SerializedAgent)
		: null;

	const ownerPath = join(dir, "owner.json");
	const owner = existsSync(ownerPath)
		? (JSON.parse(readFileSync(ownerPath, "utf-8")) as SerializedOwner)
		: null;

	const delegationPath = join(dir, "delegation.json");
	const delegation = existsSync(delegationPath)
		? (JSON.parse(readFileSync(delegationPath, "utf-8")) as DelegationFile)
		: null;

	if (options.json) {
		const scopes = delegation?.claims.scope
			? delegation.claims.scope.split(" ")
			: undefined;

		let expires: string | undefined;
		let expired: boolean | undefined;
		if (delegation?.claims.exp) {
			const expiry = new Date(delegation.claims.exp * 1000);
			expires = expiry.toISOString();
			expired = expiry < new Date();
		}

		console.log(
			JSON.stringify({
				agent: agent
					? {
							did: agent.did,
							algorithm: agent.algorithm,
							domain: agent.domain,
							path: agent.path,
						}
					: null,
				owner: owner ? { did: owner.did } : null,
				delegation: delegation
					? {
							scopes,
							constraints: delegation.claims.constraints,
							expires,
							expired,
							validFrom: delegation.claims.nbf
								? new Date(delegation.claims.nbf * 1000).toISOString()
								: undefined,
						}
					: null,
			}),
		);
		return;
	}

	// ── Pretty output ──
	header("Agent");
	if (agent) {
		label("DID", pc.green(agent.did));
		label("Algorithm", agent.algorithm);
		label("Domain", agent.domain);
		if (agent.path) {
			label("Path", agent.path);
		}
		success("Agent identity loaded");
	} else {
		fail(`No agent — run ${pc.bold("credat init")}`);
	}

	header("Owner");
	if (owner) {
		label("DID", pc.cyan(owner.did));
		success("Owner identity loaded");
	} else {
		fail(`No owner — run ${pc.bold("credat delegate")} to create one`);
	}

	header("Delegation");
	if (delegation) {
		const claims = delegation.claims;

		if (claims.scope) {
			const scopes = claims.scope.split(" ");
			label("Scopes", scopes.map((s) => pc.yellow(s)).join(", "));
		}

		if (claims.constraints) {
			const c = claims.constraints;
			if (c.maxTransactionValue !== undefined) {
				label("Max Value", String(c.maxTransactionValue));
			}
			if (Array.isArray(c.allowedDomains)) {
				label("Allowed Domains", c.allowedDomains.join(", "));
			}
		}

		if (claims.exp) {
			const expiry = new Date(claims.exp * 1000);
			const expired = expiry < new Date();
			label(
				"Expires",
				expired
					? pc.red(`${expiry.toISOString()} (expired)`)
					: pc.green(expiry.toISOString()),
			);
		}

		if (claims.nbf) {
			label("Valid From", new Date(claims.nbf * 1000).toISOString());
		}

		success("Delegation loaded");
	} else {
		fail(`No delegation — run ${pc.bold("credat delegate")}`);
	}

	console.log();
}
