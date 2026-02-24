import {
	createAgent,
	createChallenge,
	delegate,
	hasScope,
	presentCredentials,
	verifyDelegation,
	verifyPresentation,
} from "credat";
import pc from "picocolors";
import { fail, label, sleep, step, success, truncate } from "../utils.js";

export async function demoCommand(): Promise<void> {
	console.log();
	console.log(
		pc.bold(pc.cyan("  ╔══════════════════════════════════════════╗")),
	);
	console.log(
		pc.bold(pc.cyan("  ║        Credat Trust Flow Demo            ║")),
	);
	console.log(
		pc.bold(pc.cyan("  ║  Agent Identity + Delegation + Handshake ║")),
	);
	console.log(
		pc.bold(pc.cyan("  ╚══════════════════════════════════════════╝")),
	);

	// ── Step 1: Create Owner ──
	step(1, "Create Owner Identity");
	await sleep(300);

	const owner = await createAgent({
		domain: "acme.corp",
		algorithm: "ES256",
	});

	label("Owner DID", pc.green(owner.did));
	label("Algorithm", "ES256 (P-256)");
	success("Owner created");

	// ── Step 2: Create Agent ──
	step(2, "Create Agent Identity");
	await sleep(300);

	const agent = await createAgent({
		domain: "acme.corp",
		path: "agents/assistant",
		algorithm: "ES256",
	});

	label("Agent DID", pc.green(agent.did));
	label("Path", "agents/assistant");
	success("Agent created");

	// ── Step 3: Delegate ──
	step(3, "Owner Delegates to Agent");
	await sleep(300);

	const scopes = ["payments:read", "payments:create", "invoices:read"];
	const constraints = {
		maxTransactionValue: 1000,
		allowedDomains: ["api.stripe.com", "api.acme.corp"],
	};
	const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

	const delegation = await delegate({
		agent: agent.did,
		owner: owner.did,
		ownerKeyPair: owner.keyPair,
		scopes,
		constraints,
		validUntil,
	});

	label("Scopes", scopes.map((s) => pc.yellow(s)).join(", "));
	label("Max Value", pc.magenta("$1,000"));
	label("Domains", constraints.allowedDomains.join(", "));
	label("Expires", validUntil);
	label("Token", pc.dim(truncate(delegation.raw, 60)));
	success("Delegation VC issued");

	// ── Step 4: Verify delegation ──
	step(4, "Verify Delegation (standalone)");
	await sleep(300);

	const verifyResult = await verifyDelegation(delegation.raw, {
		ownerPublicKey: owner.keyPair.publicKey,
	});

	if (verifyResult.valid) {
		success(`Valid: ${pc.green("true")}`);
	} else {
		fail(`Valid: ${pc.red("false")}`);
	}
	label("Agent (from VC)", verifyResult.agent);
	label("Scopes (from VC)", verifyResult.scopes.join(", "));

	// ── Step 5: Handshake ──
	step(5, "Service Challenges Agent (Handshake)");
	await sleep(300);

	const serviceDid = "did:web:api.stripe.com";
	const challenge = createChallenge({ from: serviceDid });

	label("Challenge from", pc.cyan(serviceDid));
	label("Nonce", pc.dim(truncate(challenge.nonce, 40)));
	success("Challenge created");

	// ── Step 6: Agent presents credentials ──
	step(6, "Agent Presents Credentials");
	await sleep(300);

	const presentation = await presentCredentials({
		challenge,
		delegation: delegation.raw,
		agent,
	});

	label("Presentation type", presentation.type);
	label("Proof", pc.dim(truncate(presentation.proof, 40)));
	success("Credentials presented");

	// ── Step 7: Service verifies ──
	step(7, "Service Verifies Presentation");
	await sleep(300);

	const handshakeResult = await verifyPresentation(presentation, {
		challenge,
		ownerPublicKey: owner.keyPair.publicKey,
		agentPublicKey: agent.keyPair.publicKey,
	});

	if (handshakeResult.valid) {
		success(pc.bold(pc.green("Handshake verified!")));
	} else {
		fail(pc.bold(pc.red("Handshake failed")));
		for (const err of handshakeResult.errors) {
			console.log(`    ${pc.red("•")} ${err.message}`);
		}
		return;
	}

	label("Verified agent", handshakeResult.agent);
	label("Verified owner", handshakeResult.owner);
	label(
		"Granted scopes",
		handshakeResult.scopes.map((s) => pc.yellow(s)).join(", "),
	);

	// ── Step 8: Scope check ──
	step(8, "Check Scopes");
	await sleep(200);

	const checks = ["payments:create", "payments:read", "admin:delete"];

	for (const scope of checks) {
		const has = hasScope(handshakeResult, scope);
		if (has) {
			console.log(`  ${pc.green("✓")} ${scope}`);
		} else {
			console.log(`  ${pc.red("✗")} ${scope} ${pc.dim("(not granted)")}`);
		}
	}

	// ── Summary ──
	console.log();
	console.log(pc.bold(pc.cyan("  ══════════════════════════════════════════")));
	console.log();
	console.log(`  ${pc.bold("The full trust flow completed successfully.")}`);
	console.log();
	console.log(
		`  ${pc.dim("Owner")} ${pc.bold("→")} ${pc.dim("delegated scopes to")} ${pc.bold("→")} ${pc.dim("Agent")}`,
	);
	console.log(
		`  ${pc.dim("Service")} ${pc.bold("→")} ${pc.dim("challenged")} ${pc.bold("→")} ${pc.dim("Agent proved identity")}`,
	);
	console.log(
		`  ${pc.dim("Service")} ${pc.bold("→")} ${pc.dim("verified delegation + proof")} ${pc.bold("→")} ${pc.green("Trusted")}`,
	);
	console.log();
	console.log(pc.dim("  No passwords. No API keys. Just cryptographic trust."));
	console.log();
}
