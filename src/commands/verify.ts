import { verifyDelegation } from "credat";
import pc from "picocolors";
import { fail, header, label, loadOwnerFile, ownerExists, success } from "../utils.js";

interface VerifyCommandOptions {
	token?: string;
}

export async function verifyCommand(
	token: string | undefined,
	_options: VerifyCommandOptions,
): Promise<void> {
	if (!token) {
		console.error(
			pc.red("  A delegation token is required."),
		);
		console.error(
			pc.dim(`  Usage: ${pc.bold("credat verify <token>")}`),
		);
		process.exit(1);
	}

	if (!ownerExists()) {
		console.error(
			pc.red("  No owner key found in .credat/owner.json"),
		);
		console.error(
			pc.dim(
				"  Run a delegation first or provide the owner key file.",
			),
		);
		process.exit(1);
	}

	const owner = loadOwnerFile();

	const result = await verifyDelegation(token, {
		ownerPublicKey: owner.keyPair.publicKey,
		algorithm: owner.keyPair.algorithm,
	});

	header("Verification Result");

	if (result.valid) {
		success(pc.bold("Valid delegation"));
	} else {
		fail(pc.bold("Invalid delegation"));
	}

	console.log();
	label("Agent", result.agent || pc.dim("(unknown)"));
	label("Owner", result.owner || pc.dim("(unknown)"));

	if (result.scopes.length > 0) {
		label(
			"Scopes",
			result.scopes.map((s) => pc.yellow(s)).join(", "),
		);
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
