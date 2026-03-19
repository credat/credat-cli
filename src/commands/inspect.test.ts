import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAgent, delegate } from "credat";
import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";
import { credatDir, saveDelegation } from "../utils.js";

/** Build a minimal JWT token with given header/payload (no real signature). */
function fakeToken(
	header: Record<string, unknown>,
	payload: Record<string, unknown>,
	disclosures: unknown[][] = [],
): string {
	const hdr = Buffer.from(JSON.stringify(header)).toString("base64url");
	const pld = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const sig = "fake-sig";
	const jwt = `${hdr}.${pld}.${sig}`;
	if (disclosures.length === 0) return jwt;
	const encoded = disclosures
		.map((d) => Buffer.from(JSON.stringify(d)).toString("base64url"))
		.join("~");
	return `${jwt}~${encoded}~`;
}

describe("inspect command — token resolution", () => {
	useTestDir("inspect-resolve", { mockExit: true });

	it("errors when no token, no file, no delegation.json", async () => {
		const { inspectCommand } = await import("./inspect.js");
		expect(() => inspectCommand(undefined)).toThrow("No token provided");
	});

	it("loads token from --file (raw token file)", async () => {
		const token = fakeToken(
			{ alg: "ES256", typ: "dc+sd-jwt" },
			{ iss: "did:web:owner.local", sub: "did:web:agent.local" },
		);
		writeFileSync("token.txt", token);

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(undefined, { file: "token.txt" });

		const logs = collectLogs();
		expect(logs).toContain("did:web:owner.local");
		expect(logs).toContain("did:web:agent.local");
	});

	it("loads token from --file (delegation.json format)", async () => {
		writeFileSync(
			"my-delegation.json",
			JSON.stringify({
				token: fakeToken(
					{ alg: "EdDSA", typ: "dc+sd-jwt" },
					{ iss: "did:web:file-owner", sub: "did:web:file-agent" },
				),
				claims: {},
			}),
		);

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(undefined, { file: "my-delegation.json" });

		const logs = collectLogs();
		expect(logs).toContain("did:web:file-owner");
		expect(logs).toContain("EdDSA");
	});

	it("errors on --file with non-existent file", async () => {
		const { inspectCommand } = await import("./inspect.js");
		expect(() =>
			inspectCommand(undefined, { file: "nope.json" }),
		).toThrow("File not found");
	});

	it("falls back to .credat/delegation.json", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "delegation.json"),
			JSON.stringify({
				token: fakeToken(
					{ alg: "ES256", typ: "dc+sd-jwt" },
					{ iss: "did:web:fallback-owner", sub: "did:web:fallback-agent" },
				),
				claims: {
					agent: "did:web:fallback-agent",
					owner: "did:web:fallback-owner",
					scopes: [],
				},
			}),
		);

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(undefined);

		const logs = collectLogs();
		expect(logs).toContain("did:web:fallback-owner");
	});
});

describe("inspect command — decoding", () => {
	useTestDir("inspect-decode");

	it("decodes header, payload, and disclosures", async () => {
		const token = fakeToken(
			{ alg: "ES256", typ: "dc+sd-jwt", kid: "did:web:owner#key-0" },
			{
				iss: "did:web:owner.local",
				sub: "did:web:agent.local",
				vct: "AgentDelegationCredential",
				iat: 1700000000,
				exp: 1800000000,
				_sd: ["hash1"],
				_sd_alg: "sha-256",
			},
			[
				["salt1", "scopes", ["payments:read", "invoices:create"]],
				["salt2", "constraints", { maxTransactionValue: 5000 }],
			],
		);

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(token);

		const logs = collectLogs();
		expect(logs).toContain("ES256");
		expect(logs).toContain("dc+sd-jwt");
		expect(logs).toContain("did:web:owner#key-0");
		expect(logs).toContain("did:web:owner.local");
		expect(logs).toContain("did:web:agent.local");
		expect(logs).toContain("AgentDelegationCredential");
		expect(logs).toContain("scopes");
		expect(logs).toContain("payments:read");
		expect(logs).toContain("constraints");
		expect(logs).toContain("5000");
		expect(logs).toContain("sha-256");
	});

	it("shows 'valid' for non-expired token", async () => {
		const futureExp = Math.floor(Date.now() / 1000) + 86400;
		const token = fakeToken(
			{ alg: "ES256" },
			{ iss: "did:web:o", exp: futureExp },
		);

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(token);

		const logs = collectLogs();
		expect(logs).toContain("valid");
	});

	it("shows 'expired' for expired token", async () => {
		const pastExp = Math.floor(Date.now() / 1000) - 86400;
		const token = fakeToken(
			{ alg: "ES256" },
			{ iss: "did:web:o", exp: pastExp },
		);

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(token);

		const logs = collectLogs();
		expect(logs).toContain("expired");
	});

	it("shows 'not yet valid' for nbf in the future", async () => {
		const futureNbf = Math.floor(Date.now() / 1000) + 86400;
		const token = fakeToken(
			{ alg: "ES256" },
			{ iss: "did:web:o", nbf: futureNbf },
		);

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(token);

		const logs = collectLogs();
		expect(logs).toContain("not yet valid");
	});

	it("shows 'no expiry set' when no exp or validUntil", async () => {
		const token = fakeToken({ alg: "ES256" }, { iss: "did:web:o" });

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(token);

		const logs = collectLogs();
		expect(logs).toContain("no expiry set");
	});
});

describe("inspect command — malformed tokens", () => {
	useTestDir("inspect-malformed");

	it("throws on completely invalid token", async () => {
		const { inspectCommand } = await import("./inspect.js");
		expect(() => inspectCommand("not-a-token")).toThrow();
	});

	it("throws on empty token", async () => {
		const { inspectCommand } = await import("./inspect.js");
		expect(() => inspectCommand("")).toThrow("No token provided");
	});

	it("throws on token with only one segment", async () => {
		const hdr = Buffer.from('{"alg":"ES256"}').toString("base64url");
		const { inspectCommand } = await import("./inspect.js");
		expect(() => inspectCommand(hdr)).toThrow("Malformed token");
	});
});

describe("inspect command — JSON output", () => {
	useTestDir("inspect-json");

	it("outputs structured JSON", async () => {
		const token = fakeToken(
			{ alg: "ES256", typ: "dc+sd-jwt" },
			{
				iss: "did:web:owner.local",
				sub: "did:web:agent.local",
				exp: Math.floor(Date.now() / 1000) + 86400,
			},
			[["s1", "scopes", ["read"]]],
		);

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(token, { json: true });

		const logs = collectLogs();
		const jsonLine = logs.split("\n").find((l: string) => l.startsWith("{"));
		expect(jsonLine).toBeDefined();

		const parsed = JSON.parse(jsonLine!);
		expect(parsed.header.alg).toBe("ES256");
		expect(parsed.payload.iss).toBe("did:web:owner.local");
		expect(parsed.disclosures).toHaveLength(1);
		expect(parsed.disclosures[0].name).toBe("scopes");
		expect(parsed.disclosures[0].value).toEqual(["read"]);
		expect(parsed.expirationStatus).toBe("valid");
	});
});

describe("inspect command — real SDK token", () => {
	useTestDir("inspect-sdk");

	it("inspects a real delegation token from the SDK", async () => {
		const agent = await createAgent({
			domain: "test.example",
			algorithm: "ES256",
		});
		const owner = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});

		const delegation = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["payments:read", "invoices:create"],
			constraints: { maxTransactionValue: 5000 },
			validUntil: "2099-12-31T23:59:59Z",
		});

		const { inspectCommand } = await import("./inspect.js");
		inspectCommand(delegation.token);

		const logs = collectLogs();
		expect(logs).toContain("ES256");
		expect(logs).toContain("dc+sd-jwt");
		expect(logs).toContain(owner.did);
		expect(logs).toContain(agent.did);
		expect(logs).toContain("AgentDelegationCredential");
		expect(logs).toContain("scopes");
		expect(logs).toContain("payments:read");
		expect(logs).toContain("constraints");
		expect(logs).toContain("5000");
		expect(logs).toContain("valid");
	});

	it("JSON output for real SDK token", async () => {
		const agent = await createAgent({
			domain: "test.example",
			algorithm: "ES256",
		});
		const owner = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});

		const delegation = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read"],
		});

		saveDelegation(delegation);

		const { inspectCommand } = await import("./inspect.js");
		// No token arg — should load from delegation.json
		inspectCommand(undefined, { json: true });

		const logs = collectLogs();
		const jsonLine = logs.split("\n").find((l: string) => l.startsWith("{"));
		const parsed = JSON.parse(jsonLine!);

		expect(parsed.header.alg).toBe("ES256");
		expect(parsed.header.typ).toBe("dc+sd-jwt");
		expect(parsed.payload.iss).toBe(owner.did);
		expect(parsed.payload.agent).toBe(agent.did);
		expect(parsed.disclosures.length).toBeGreaterThan(0);
		expect(parsed.disclosures.some((d: { name: string }) => d.name === "scopes")).toBe(
			true,
		);
	});
});
