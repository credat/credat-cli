import {
	type AgentIdentity,
	createAgent,
	createChallenge,
	delegate,
	presentCredentials,
	verifyPresentation,
} from "@credat/sdk";
import pc from "picocolors";
import {
	delegationExists,
	fail,
	header,
	label,
	loadAgentFile,
	loadDelegationFile,
	loadOwnerFile,
	ownerExists,
	step,
	success,
} from "../utils.js";

interface ChallengeOptions {
	from: string;
	json?: boolean;
}

interface PresentOptions {
	challenge: string;
	json?: boolean;
}

interface VerifyOptions {
	presentation: string;
	challenge: string;
	json?: boolean;
}

interface DemoOptions {
	json?: boolean;
}

export function handshakeChallengeCommand(options: ChallengeOptions): void {
	const challenge = createChallenge({ from: options.from });

	if (options.json) {
		console.log(JSON.stringify(challenge));
		return;
	}

	header("Challenge Created");
	label("From", pc.cyan(options.from));
	label("Nonce", pc.dim(challenge.nonce));
	label("Timestamp", challenge.timestamp);
	console.log();
	console.log(pc.dim("  Send this to the agent:"));
	console.log(`  ${pc.yellow(JSON.stringify(challenge))}`);
	console.log();
}

export async function handshakePresentCommand(
	options: PresentOptions,
): Promise<void> {
	let challenge: ReturnType<typeof createChallenge>;
	try {
		challenge = JSON.parse(options.challenge);
	} catch {
		throw new Error("Invalid challenge JSON");
	}

	if (challenge.type !== "credat:challenge") {
		throw new Error("Invalid challenge: wrong type field");
	}

	const agentFile = loadAgentFile();
	const agent: AgentIdentity = {
		...agentFile,
		didDocument: agentFile.didDocument as AgentIdentity["didDocument"],
	};
	if (!delegationExists()) {
		throw new Error(
			`No delegation found. Run ${pc.bold("credat delegate")} first.`,
		);
	}
	const delegation = loadDelegationFile();

	const presentation = await presentCredentials({
		challenge,
		delegation: delegation.token,
		agent,
	});

	if (options.json) {
		console.log(JSON.stringify(presentation));
		return;
	}

	header("Presentation Created");
	label("From", pc.green(presentation.from));
	label("Nonce", pc.dim(presentation.nonce));
	console.log();
	console.log(pc.dim("  Send this back to the challenger:"));
	console.log(`  ${pc.yellow(JSON.stringify(presentation))}`);
	console.log();
}

export async function handshakeVerifyCommand(
	options: VerifyOptions,
): Promise<void> {
	let presentation: Awaited<ReturnType<typeof presentCredentials>>;
	let challenge: ReturnType<typeof createChallenge>;

	try {
		presentation = JSON.parse(options.presentation);
	} catch {
		throw new Error("Invalid presentation JSON");
	}
	try {
		challenge = JSON.parse(options.challenge);
	} catch {
		throw new Error("Invalid challenge JSON");
	}

	if (!ownerExists()) {
		throw new Error(
			`No owner key found. Run ${pc.bold("credat delegate")} first.`,
		);
	}

	const owner = loadOwnerFile();
	const agent = loadAgentFile();

	const result = await verifyPresentation(presentation, {
		challenge,
		ownerPublicKey: owner.keyPair.publicKey,
		agentPublicKey: agent.keyPair.publicKey,
	});

	if (options.json) {
		console.log(
			JSON.stringify({
				valid: result.valid,
				agent: result.agent ?? null,
				owner: result.owner ?? null,
				scopes: result.scopes ?? [],
				errors: result.errors.map((e) => e.message),
			}),
		);
		return;
	}

	header("Verification Result");
	if (result.valid) {
		success(pc.bold("Handshake verified"));
	} else {
		fail(pc.bold("Handshake failed"));
	}
	console.log();
	label("Agent", result.agent ?? pc.dim("(unknown)"));
	label("Owner", result.owner ?? pc.dim("(unknown)"));
	const scopes = result.scopes ?? [];
	if (scopes.length > 0) {
		label("Scopes", scopes.map((s) => pc.yellow(s)).join(", "));
	}
	if (result.errors.length > 0) {
		console.log();
		for (const err of result.errors) {
			console.log(`  ${pc.red("•")} ${err.message}`);
		}
	}
	console.log();
}

export async function handshakeDemoCommand(
	options: DemoOptions,
): Promise<void> {
	step(1, "Create service identity (challenger)");
	const service = await createAgent({
		domain: "service.local",
		algorithm: "ES256",
	});
	if (!options.json) {
		label("Service DID", pc.cyan(service.did));
	}

	step(2, "Create agent identity");
	const agent = await createAgent({
		domain: "agent.local",
		algorithm: "ES256",
	});
	if (!options.json) {
		label("Agent DID", pc.green(agent.did));
	}

	step(3, "Owner delegates to agent");
	const owner = await createAgent({
		domain: "owner.local",
		algorithm: "ES256",
	});
	const delegation = await delegate({
		agent: agent.did,
		owner: owner.did,
		ownerKeyPair: owner.keyPair,
		scopes: ["payments:read", "invoices:create"],
	});
	if (!options.json) {
		label("Owner DID", pc.cyan(owner.did));
		label("Scopes", pc.yellow("payments:read, invoices:create"));
	}

	step(4, "Service sends challenge");
	const challenge = createChallenge({ from: service.did });
	if (!options.json) {
		label("Nonce", pc.dim(challenge.nonce));
	}

	step(5, "Agent presents credentials");
	const presentation = await presentCredentials({
		challenge,
		delegation: delegation.token,
		agent,
	});
	if (!options.json) {
		label("Proof", pc.dim(`${presentation.proof.slice(0, 32)}...`));
	}

	step(6, "Service verifies presentation");
	const result = await verifyPresentation(presentation, {
		challenge,
		ownerPublicKey: owner.keyPair.publicKey,
		agentPublicKey: agent.keyPair.publicKey,
	});

	if (options.json) {
		console.log(
			JSON.stringify({
				valid: result.valid,
				agent: result.agent,
				owner: result.owner,
				scopes: result.scopes,
			}),
		);
		return;
	}

	console.log();
	if (result.valid) {
		success(pc.bold("Handshake complete — trust established"));
	} else {
		fail(pc.bold("Handshake failed"));
	}
	label("Agent", result.agent ?? "(unknown)");
	label("Scopes", (result.scopes ?? []).map((s) => pc.yellow(s)).join(", "));
	console.log();
}
