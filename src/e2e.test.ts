import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	createAgent,
	createStatusList,
	delegate,
	encodeStatusList,
} from "credat";
import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "./test-utils.js";
import {
	credatDir,
	loadAgentFile,
	loadDelegationFile,
	loadOwnerFile,
	saveAgent,
	saveDelegation,
	saveOwner,
} from "./utils.js";

// ── Full workflow: init → delegate → verify → inspect → revoke ──

describe("E2E: full delegation lifecycle", () => {
	useTestDir("e2e-lifecycle");

	it("init → delegate → verify → inspect → revoke", async () => {
		// 1. Init — create agent identity
		const { initCommand } = await import("./commands/init.js");
		await initCommand({ domain: "agent.example", algorithm: "ES256" });

		const agent = loadAgentFile();
		expect(agent.did).toContain("did:web:agent.example");
		expect(existsSync(join(credatDir(), "agent.json"))).toBe(true);

		// 2. Delegate — issue credential with constraints
		const { delegateCommand } = await import("./commands/delegate.js");
		await delegateCommand({
			scopes: "payments:read,invoices:create",
			maxValue: "5000",
			until: "2099-12-31T23:59:59Z",
		});

		const delegation = loadDelegationFile();
		expect(delegation.token).toBeTruthy();
		expect(delegation.claims.scopes).toEqual([
			"payments:read",
			"invoices:create",
		]);
		expect(existsSync(join(credatDir(), "owner.json"))).toBe(true);

		// 3. Verify — cryptographic verification
		const { verifyCommand } = await import("./commands/verify.js");
		await verifyCommand(delegation.token);

		let logs = collectLogs();
		expect(logs).toContain("Valid delegation");
		expect(logs).toContain(agent.did);

		// 4. Inspect — decode without verification
		const { inspectCommand } = await import("./commands/inspect.js");
		inspectCommand(delegation.token);

		logs = collectLogs();
		expect(logs).toContain("ES256");
		expect(logs).toContain("dc+sd-jwt");
		expect(logs).toContain("AgentDelegationCredential");
		expect(logs).toContain("payments:read");

		// 5. Revoke — need a status list for this token
		// The delegation above doesn't have a status list entry,
		// so we revoke by explicit index
		const list = createStatusList({
			id: "default",
			issuer: loadOwnerFile().did,
			url: `${loadOwnerFile().did}/status/1`,
		});
		const slPath = join(credatDir(), "status-list.json");
		writeFileSync(
			slPath,
			JSON.stringify({
				id: list.id,
				issuer: list.issuer,
				url: `${list.issuer}/status/1`,
				size: list.size,
				encoded: encodeStatusList(list.bitstring),
			}),
		);

		const { revokeCommand } = await import("./commands/revoke.js");
		revokeCommand({ index: "0" });

		logs = collectLogs();
		expect(logs).toContain("revoked");
	});
});

describe("E2E: delegation with status list entry → revoke from token", () => {
	useTestDir("e2e-status-revoke");

	it("delegate with statusList → inspect sees status → revoke extracts index", async () => {
		// Setup identities
		const agentId = await createAgent({
			domain: "agent.local",
			algorithm: "ES256",
		});
		const ownerId = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});
		saveAgent(agentId);
		saveOwner(ownerId);

		// Create status list file
		const list = createStatusList({
			id: "default",
			issuer: ownerId.did,
			url: `${ownerId.did}/status/1`,
		});
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "status-list.json"),
			JSON.stringify({
				id: list.id,
				issuer: list.issuer,
				url: `${list.issuer}/status/1`,
				size: list.size,
				encoded: encodeStatusList(list.bitstring),
			}),
		);

		// Delegate with status list entry
		const d = await delegate({
			agent: agentId.did,
			owner: ownerId.did,
			ownerKeyPair: ownerId.keyPair,
			scopes: ["admin:read"],
			statusList: { url: `${ownerId.did}/status/1`, index: 42 },
		});
		saveDelegation(d);

		// Inspect — should see status entry in payload
		const { inspectCommand } = await import("./commands/inspect.js");
		inspectCommand(d.token, { json: true });

		let logs = collectLogs();
		const inspectJson = JSON.parse(
			logs.split("\n").find((l: string) => l.startsWith("{"))!,
		);
		expect(inspectJson.payload.status).toBeDefined();
		expect(inspectJson.payload.status.status_list.idx).toBe(42);

		// Revoke — should extract index 42 from token
		const { revokeCommand } = await import("./commands/revoke.js");
		revokeCommand();

		logs = collectLogs();
		expect(logs).toContain("revoked");
		expect(logs).toContain("42");
	});
});

// ── Constraint combinations ──

describe("E2E: constraint combinations in delegate → verify → inspect", () => {
	useTestDir("e2e-constraints");

	it("maxValue + validUntil propagate through verify and inspect", async () => {
		const agentId = await createAgent({
			domain: "agent.local",
			algorithm: "ES256",
		});
		const ownerId = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});
		saveAgent(agentId);
		saveOwner(ownerId);

		const { delegateCommand } = await import("./commands/delegate.js");
		await delegateCommand({
			scopes: "payments:write",
			maxValue: "10000",
			until: "2099-06-15T00:00:00Z",
		});

		const delegation = loadDelegationFile();

		// Verify sees constraints
		const { verifyCommand } = await import("./commands/verify.js");
		await verifyCommand(delegation.token, { json: true });

		let logs = collectLogs();
		const verifyJson = JSON.parse(
			logs.split("\n").find((l: string) => l.startsWith("{"))!,
		);
		expect(verifyJson.valid).toBe(true);
		expect(verifyJson.scopes).toEqual(["payments:write"]);
		expect(verifyJson.constraints.maxTransactionValue).toBe(10000);
		expect(verifyJson.validUntil).toBe("2099-06-15T00:00:00Z");

		// Inspect sees constraints in disclosures
		const { inspectCommand } = await import("./commands/inspect.js");
		inspectCommand(delegation.token, { json: true });

		logs = collectLogs();
		const inspectJson = JSON.parse(
			logs
				.split("\n")
				.filter((l: string) => l.startsWith("{"))
				.pop()!,
		);
		const constraintDisc = inspectJson.disclosures.find(
			(d: { name: string }) => d.name === "constraints",
		);
		expect(constraintDisc).toBeDefined();
		expect(constraintDisc.value.maxTransactionValue).toBe(10000);
	});

	it("EdDSA algorithm works across the full flow", async () => {
		// Create both agent and owner with EdDSA
		const agentId = await createAgent({
			domain: "ed.local",
			algorithm: "EdDSA",
		});
		const ownerId = await createAgent({
			domain: "owner.local",
			algorithm: "EdDSA",
		});
		saveAgent(agentId);
		saveOwner(ownerId);

		const d = await delegate({
			agent: agentId.did,
			owner: ownerId.did,
			ownerKeyPair: ownerId.keyPair,
			scopes: ["read"],
		});
		saveDelegation(d);

		const { verifyCommand } = await import("./commands/verify.js");
		await verifyCommand(d.token);

		const logs = collectLogs();
		expect(logs).toContain("Valid delegation");

		// Inspect confirms EdDSA (alg comes from owner/issuer key)
		const { inspectCommand } = await import("./commands/inspect.js");
		inspectCommand(d.token, { json: true });

		const allLogs = collectLogs();
		const inspectJson = JSON.parse(
			allLogs
				.split("\n")
				.filter((l: string) => l.startsWith("{"))
				.pop()!,
		);
		expect(inspectJson.header.alg).toBe("EdDSA");
	});
});

// ── Status command after each step ──

describe("E2E: status reflects state at each stage", () => {
	useTestDir("e2e-status");

	it("shows progressive state: none → agent → agent+owner+delegation", async () => {
		const { statusCommand } = await import("./commands/status.js");

		// Stage 0: empty
		statusCommand({ json: true });
		let logs = collectLogs();
		let status = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(status.agent).toBeNull();
		expect(status.owner).toBeNull();
		expect(status.delegation).toBeNull();

		// Stage 1: after init
		const { initCommand } = await import("./commands/init.js");
		await initCommand({ domain: "status.local", algorithm: "ES256" });

		statusCommand({ json: true });
		logs = collectLogs();
		const jsonLines = logs.split("\n").filter((l: string) => l.startsWith("{"));
		status = JSON.parse(jsonLines[jsonLines.length - 1]!);
		expect(status.agent).not.toBeNull();
		expect(status.agent.did).toContain("did:web:status.local");
		expect(status.owner).toBeNull();
		expect(status.delegation).toBeNull();

		// Stage 2: after delegate
		const { delegateCommand } = await import("./commands/delegate.js");
		await delegateCommand({
			scopes: "read",
			until: "2099-12-31T00:00:00Z",
		});

		statusCommand({ json: true });
		logs = collectLogs();
		const allJsonLines = logs
			.split("\n")
			.filter((l: string) => l.startsWith("{"));
		status = JSON.parse(allJsonLines[allJsonLines.length - 1]!);
		expect(status.agent).not.toBeNull();
		expect(status.owner).not.toBeNull();
		expect(status.delegation).not.toBeNull();
		expect(status.delegation.scopes).toEqual(["read"]);
		expect(status.delegation.expired).toBe(false);
	});
});

// ── Owner reuse ──

describe("E2E: owner identity reuse", () => {
	useTestDir("e2e-owner-reuse");

	it("second delegate reuses existing owner", async () => {
		const { initCommand } = await import("./commands/init.js");
		await initCommand({ domain: "reuse.local", algorithm: "ES256" });

		const { delegateCommand } = await import("./commands/delegate.js");
		await delegateCommand({ scopes: "read" });

		const owner1 = loadOwnerFile();

		// Second delegation — should reuse same owner
		await delegateCommand({ scopes: "write" });

		const owner2 = loadOwnerFile();
		expect(owner2.did).toBe(owner1.did);

		// Verify the new delegation
		const delegation = loadDelegationFile();
		const { verifyCommand } = await import("./commands/verify.js");
		await verifyCommand(delegation.token);

		const logs = collectLogs();
		expect(logs).toContain("Valid delegation");
	});
});

// ── JSON output consistency ──

describe("E2E: JSON output is parseable across all commands", () => {
	useTestDir("e2e-json");

	it("all --json outputs are valid JSON", async () => {
		const agentId = await createAgent({
			domain: "json.local",
			algorithm: "ES256",
		});
		const ownerId = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});
		saveAgent(agentId);
		saveOwner(ownerId);

		const d = await delegate({
			agent: agentId.did,
			owner: ownerId.did,
			ownerKeyPair: ownerId.keyPair,
			scopes: ["read"],
		});
		saveDelegation(d);

		// Status JSON
		const { statusCommand } = await import("./commands/status.js");
		statusCommand({ json: true });

		// Verify JSON
		const { verifyCommand } = await import("./commands/verify.js");
		await verifyCommand(d.token, { json: true });

		// Inspect JSON
		const { inspectCommand } = await import("./commands/inspect.js");
		inspectCommand(d.token, { json: true });

		// All outputs should be parseable JSON
		const logs = collectLogs();
		const jsonLines = logs
			.split("\n")
			.filter((l: string) => l.startsWith("{"));
		expect(jsonLines.length).toBeGreaterThanOrEqual(3);

		for (const line of jsonLines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
	});
});
