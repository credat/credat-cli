import { createAgent, type DelegationConstraints, delegate } from "credat";
import pc from "picocolors";
import {
	header,
	label,
	loadAgentFile,
	loadOwnerFile,
	ownerExists,
	saveDelegation,
	saveOwner,
	success,
	truncate,
} from "../utils.js";

interface DelegateCommandOptions {
	agent?: string;
	scopes: string;
	maxValue?: string;
	until?: string;
	json?: boolean;
}

export async function delegateCommand(
	options: DelegateCommandOptions,
): Promise<void> {
	// Resolve agent DID
	let agentDid: string;

	if (options.agent) {
		agentDid = options.agent;
	} else {
		try {
			const agent = loadAgentFile();
			agentDid = agent.did;
		} catch {
			if (options.json) {
				console.log(
					JSON.stringify({
						error: "No agent DID provided and no local agent found",
					}),
				);
				return;
			}
			console.error(
				pc.red("  No agent DID provided and no local agent found."),
			);
			console.error(
				pc.dim(
					`  Run ${pc.bold("credat init")} or use ${pc.bold("--agent <did>")}`,
				),
			);
			process.exit(1);
		}
	}

	// Resolve or create owner
	let owner: {
		did: string;
		keyPair: {
			algorithm: string;
			publicKey: Uint8Array;
			privateKey: Uint8Array;
		};
	};

	if (ownerExists()) {
		owner = loadOwnerFile();
		if (!options.json) {
			console.log(pc.dim("  Loaded owner from .credat/owner.json"));
		}
	} else {
		// Create a new owner identity
		const ownerIdentity = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});
		owner = {
			did: ownerIdentity.did,
			keyPair: ownerIdentity.keyPair,
		};
		saveOwner(owner);
		if (!options.json) {
			console.log(pc.dim("  Created new owner identity → .credat/owner.json"));
		}
	}

	if (options.maxValue !== undefined) {
		const n = Number(options.maxValue);
		if (!Number.isFinite(n) || n <= 0) {
			if (options.json) {
				console.log(
					JSON.stringify({
						error: "--max-value must be a positive number",
					}),
				);
				return;
			}
			console.error(pc.red("  --max-value must be a positive number."));
			process.exit(1);
		}
	}

	if (options.until !== undefined) {
		if (Number.isNaN(Date.parse(options.until))) {
			if (options.json) {
				console.log(
					JSON.stringify({
						error: "--until must be a valid ISO 8601 date",
					}),
				);
				return;
			}
			console.error(pc.red("  --until must be a valid ISO 8601 date."));
			process.exit(1);
		}
	}

	const scopes = options.scopes.split(",").map((s) => s.trim());

	const constraints: DelegationConstraints = {};
	if (options.maxValue) {
		constraints.maxTransactionValue = Number(options.maxValue);
	}

	const validUntil = options.until;

	const delegation = await delegate({
		agent: agentDid,
		owner: owner.did,
		ownerKeyPair: owner.keyPair,
		scopes,
		constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
		validUntil,
	});

	saveDelegation(delegation);

	if (options.json) {
		console.log(
			JSON.stringify({
				agent: agentDid,
				owner: owner.did,
				scopes,
				constraints:
					Object.keys(constraints).length > 0 ? constraints : undefined,
				validUntil: validUntil || null,
				token: delegation.raw,
			}),
		);
		return;
	}

	header("Delegation Issued");
	label("Agent", pc.green(agentDid));
	label("Owner", pc.cyan(owner.did));
	label("Scopes", scopes.map((s) => pc.yellow(s)).join(", "));

	if (constraints.maxTransactionValue !== undefined) {
		label("Max Value", String(constraints.maxTransactionValue));
	}
	if (validUntil) {
		label("Valid Until", validUntil);
	}

	console.log();
	label("Token", pc.dim(truncate(delegation.raw, 80)));
	label("Saved to", pc.dim(".credat/delegation.json"));
	console.log();
	success("Delegation credential created");
}
