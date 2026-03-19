import { delegate } from "@credat/sdk";
import pc from "picocolors";
import {
	delegationExists,
	header,
	label,
	loadDelegationFile,
	loadOwnerFile,
	ownerExists,
	saveDelegation,
	success,
	truncate,
} from "../utils.js";

interface RenewOptions {
	until: string;
	json?: boolean;
}

export async function renewCommand(options: RenewOptions): Promise<void> {
	// 1. Load existing delegation
	if (!delegationExists()) {
		throw new Error(
			`No delegation found. Run ${pc.bold("credat delegate")} first.`,
		);
	}
	if (!ownerExists()) {
		throw new Error(`No owner found. Run ${pc.bold("credat delegate")} first.`);
	}

	const existing = loadDelegationFile();
	const owner = loadOwnerFile();

	// 2. Validate new expiry
	if (Number.isNaN(Date.parse(options.until))) {
		throw new Error("--until must be a valid ISO 8601 date");
	}

	const newExpiry = new Date(options.until);
	if (newExpiry <= new Date()) {
		throw new Error("--until must be in the future");
	}

	// 3. Re-issue with same params, new expiry
	const newDelegation = await delegate({
		agent: existing.claims.agent,
		owner: existing.claims.owner,
		ownerKeyPair: owner.keyPair,
		scopes: existing.claims.scopes,
		constraints: existing.claims.constraints,
		validUntil: options.until,
	});

	saveDelegation(newDelegation);

	// 4. Output
	if (options.json) {
		console.log(
			JSON.stringify({
				renewed: true,
				agent: existing.claims.agent,
				owner: existing.claims.owner,
				scopes: existing.claims.scopes,
				constraints: existing.claims.constraints ?? null,
				validUntil: options.until,
				token: newDelegation.token,
			}),
		);
		return;
	}

	header("Delegation Renewed");
	label("Agent", pc.green(existing.claims.agent));
	label("Owner", pc.cyan(existing.claims.owner));
	label("Scopes", existing.claims.scopes.map((s) => pc.yellow(s)).join(", "));
	label("New Expiry", pc.green(options.until));
	console.log();
	label("Token", pc.dim(truncate(newDelegation.token, 80)));
	label("Saved to", pc.dim(".credat/delegation.json"));
	console.log();
	success("Delegation renewed with new expiry");
}
