import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { credatDir } from "../utils.js";

describe("status command — pretty output", () => {
	const testDir = join(process.cwd(), ".credat-status-test");
	const originalCwd = process.cwd();

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);

		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(testDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("shows 'No agent' when no agent.json exists", async () => {
		const { statusCommand } = await import("./status.js");
		statusCommand();

		const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls
			.map((c) => c[0])
			.join("\n");

		expect(logs).toContain("No agent");
	});

	it("shows agent info when agent.json exists", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "agent.json"),
			JSON.stringify({
				did: "did:web:test.example",
				algorithm: "ES256",
				domain: "test.example",
				keyPair: {
					algorithm: "ES256",
					publicKey: "AQID",
					privateKey: "BAUG",
				},
				didDocument: { id: "did:web:test.example" },
			}),
		);

		const { statusCommand } = await import("./status.js");
		statusCommand();

		const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls
			.map((c) => c[0])
			.join("\n");

		expect(logs).toContain("did:web:test.example");
		expect(logs).toContain("ES256");
		expect(logs).toContain("test.example");
		expect(logs).toContain("Agent identity loaded");
	});

	it("shows delegation info correctly", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "delegation.json"),
			JSON.stringify({
				token: "test-token",
				claims: {
					agent: "did:web:test.example",
					owner: "did:web:owner.local",
					scopes: ["payments:read"],
					constraints: { maxTransactionValue: 1000 },
					validUntil: "2099-12-31T00:00:00.000Z",
					validFrom: "2024-01-01T00:00:00.000Z",
				},
			}),
		);

		const { statusCommand } = await import("./status.js");
		statusCommand();

		const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls
			.map((c) => c[0])
			.join("\n");

		expect(logs).toContain("payments:read");
		expect(logs).toContain("1000");
		expect(logs).toContain("2099-12-31T00:00:00.000Z");
		expect(logs).toContain("2024-01-01T00:00:00.000Z");
		expect(logs).toContain("Delegation loaded");
	});
});

describe("status command — JSON output", () => {
	const testDir = join(process.cwd(), ".credat-status-json-test");
	const originalCwd = process.cwd();

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);

		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(testDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("outputs full state as JSON", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });

		writeFileSync(
			join(dir, "agent.json"),
			JSON.stringify({
				did: "did:web:test.example",
				algorithm: "ES256",
				domain: "test.example",
				keyPair: {
					algorithm: "ES256",
					publicKey: "AQID",
					privateKey: "BAUG",
				},
				didDocument: { id: "did:web:test.example" },
			}),
		);
		writeFileSync(
			join(dir, "owner.json"),
			JSON.stringify({
				did: "did:web:owner.local",
				keyPair: {
					algorithm: "ES256",
					publicKey: "AQID",
					privateKey: "BAUG",
				},
			}),
		);
		writeFileSync(
			join(dir, "delegation.json"),
			JSON.stringify({
				token: "test-token",
				claims: {
					agent: "did:web:test.example",
					owner: "did:web:owner.local",
					scopes: ["payments:read", "invoices:create"],
					constraints: { maxTransactionValue: 5000 },
					validUntil: "2099-12-31T00:00:00.000Z",
					validFrom: "2024-01-01T00:00:00.000Z",
				},
			}),
		);

		const { statusCommand } = await import("./status.js");
		statusCommand({ json: true });

		const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(output);

		expect(parsed.agent).toEqual({
			did: "did:web:test.example",
			algorithm: "ES256",
			domain: "test.example",
		});
		expect(parsed.owner).toEqual({ did: "did:web:owner.local" });
		expect(parsed.delegation.scopes).toEqual([
			"payments:read",
			"invoices:create",
		]);
		expect(parsed.delegation.constraints).toEqual({
			maxTransactionValue: 5000,
		});
		expect(parsed.delegation.expires).toBe("2099-12-31T00:00:00.000Z");
		expect(parsed.delegation.validFrom).toBe("2024-01-01T00:00:00.000Z");
		expect(parsed.delegation.expired).toBe(false);
	});

	it("outputs empty state as JSON (all nulls)", async () => {
		const { statusCommand } = await import("./status.js");
		statusCommand({ json: true });

		const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(output);

		expect(parsed.agent).toBeNull();
		expect(parsed.owner).toBeNull();
		expect(parsed.delegation).toBeNull();
	});

	it("shows expired=true for past validUntil dates", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });

		writeFileSync(
			join(dir, "delegation.json"),
			JSON.stringify({
				token: "expired-token",
				claims: {
					agent: "did:web:test.example",
					owner: "did:web:owner.local",
					scopes: ["payments:read"],
					validUntil: "2020-01-01T00:00:00.000Z",
				},
			}),
		);

		const { statusCommand } = await import("./status.js");
		statusCommand({ json: true });

		const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(output);

		expect(parsed.delegation.expired).toBe(true);
		expect(parsed.delegation.expires).toBe("2020-01-01T00:00:00.000Z");
	});
});
