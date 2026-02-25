import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyDelegation } from "credat";
import pc from "picocolors";
import {
	credatDir,
	fail,
	header,
	label,
	loadOwnerFile,
	ownerExists,
	success,
} from "../utils.js";

interface VerifyOptions {
	json?: boolean;
}

export async function verifyCommand(
	token: string | undefined,
	options: VerifyOptions = {},
): Promise<void> {
	if (!token) {
		const delegationPath = join(credatDir(), "delegation.json");
		if (existsSync(delegationPath)) {
			const data = JSON.parse(readFileSync(delegationPath, "utf-8")) as {
				token: string;
			};
			token = data.token;
			if (!options.json) {
				console.log(pc.dim("  Loaded token from .credat/delegation.json"));
			}
		} else {
			if (options.json) {
				console.log(
					JSON.stringify({ valid: false, error: "No delegation token found" }),
				);
				return;
			}
			console.error(pc.red("  A delegation token is required."));
			console.error(
				pc.dim(
					`  Usage: ${pc.bold("credat verify <token>")} or run ${pc.bold("credat delegate")} first`,
				),
			);
			process.exit(1);
		}
	}

	if (!ownerExists()) {
		if (options.json) {
			console.log(
				JSON.stringify({ valid: false, error: "No owner key found" }),
			);
			return;
		}
		console.error(pc.red("  No owner key found in .credat/owner.json"));
		console.error(
			pc.dim("  Run a delegation first or provide the owner key file."),
		);
		process.exit(1);
	}

	const owner = loadOwnerFile();

	const result = await verifyDelegation(token, {
		ownerPublicKey: owner.keyPair.publicKey,
	});

	if (options.json) {
		console.log(
			JSON.stringify({
				valid: result.valid,
				agent: result.agent ?? null,
				owner: result.owner ?? null,
				scopes: result.scopes ?? [],
				constraints: result.constraints ?? null,
				validFrom: result.validFrom ?? null,
				validUntil: result.validUntil ?? null,
				errors: result.errors.map((e) => e.message),
			}),
		);
		return;
	}

	header("Verification Result");

	if (result.valid) {
		success(pc.bold("Valid delegation"));
	} else {
		fail(pc.bold("Invalid delegation"));
	}

	console.log();
	label("Agent", result.agent ?? pc.dim("(unknown)"));
	label("Owner", result.owner ?? pc.dim("(unknown)"));

	const scopes = result.scopes ?? [];
	if (scopes.length > 0) {
		label("Scopes", scopes.map((s) => pc.yellow(s)).join(", "));
	}

	if (result.constraints) {
		const c = result.constraints;
		if (c.maxTransactionValue !== undefined) {
			label("Max Value", String(c.maxTransactionValue));
		}
		if (c.allowedDomains) {
			label("Allowed Domains", c.allowedDomains.join(", "));
		}
		if (c.rateLimit !== undefined) {
			label("Rate Limit", String(c.rateLimit));
		}
	}

	if (result.validFrom) {
		label("Valid From", result.validFrom);
	}
	if (result.validUntil) {
		label("Valid Until", result.validUntil);
	}

	if (result.errors.length > 0) {
		console.log();
		console.log(pc.red("  Errors:"));
		for (const err of result.errors) {
			console.log(`    ${pc.red("•")} ${err.message}`);
		}
	}

	console.log();
}
