import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import {
	credatDir,
	delegationExists,
	fail,
	header,
	label,
	loadDelegationFile,
	type SerializedAgent,
	type SerializedOwner,
	success,
} from "../utils.js";

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

	const delegation = delegationExists() ? loadDelegationFile() : null;

	if (options.json) {
		const validUntil = delegation?.claims.validUntil;
		const expired = validUntil ? new Date(validUntil) < new Date() : undefined;

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
							scopes: delegation.claims.scopes,
							constraints: delegation.claims.constraints,
							expires: validUntil ?? undefined,
							expired,
							validFrom: delegation.claims.validFrom,
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

		if (claims.scopes.length > 0) {
			label("Scopes", claims.scopes.map((s) => pc.yellow(s)).join(", "));
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

		if (claims.validUntil) {
			const expiry = new Date(claims.validUntil);
			const expired = expiry < new Date();
			label(
				"Expires",
				expired
					? pc.red(`${expiry.toISOString()} (expired)`)
					: pc.green(expiry.toISOString()),
			);
		}

		if (claims.validFrom) {
			label("Valid From", claims.validFrom);
		}

		success("Delegation loaded");
	} else {
		fail(`No delegation — run ${pc.bold("credat delegate")}`);
	}

	console.log();
}
