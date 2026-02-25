import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAgent, delegate } from "credat";
import { describe, expect, it } from "vitest";
import { ExitError, collectLogs, useTestDir } from "../test-utils.js";
import { credatDir, saveAgent, saveOwner } from "../utils.js";

describe("verify command", () => {
	useTestDir("verify-test", { mockExit: true });

	it("exits with error when no token and no delegation.json", async () => {
		const { verifyCommand } = await import("./verify.js");
		await expect(verifyCommand(undefined)).rejects.toThrow(ExitError);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("A delegation token is required"),
		);
	});

	it("loads token from delegation.json but exits when no owner", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "delegation.json"),
			JSON.stringify({
				token: "test-token",
				claims: {
					agent: "did:web:test.example",
					owner: "did:web:owner.local",
					scopes: [],
				},
			}),
		);

		const { verifyCommand } = await import("./verify.js");
		await expect(verifyCommand(undefined)).rejects.toThrow(ExitError);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("No owner key found"),
		);
	});
});

describe("verify command happy path", () => {
	useTestDir("verify-happy-test");

	it("verifies a valid delegation", async () => {
		const agent = await createAgent({
			domain: "test.example",
			algorithm: "ES256",
		});
		const owner = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});

		saveAgent(agent);
		saveOwner(owner);

		const delegation = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["payments:read"],
		});

		const { verifyCommand } = await import("./verify.js");
		await verifyCommand(delegation.token);

		const logs = collectLogs();
		expect(logs).toContain("Valid delegation");
		expect(logs).toContain(agent.did);
		expect(logs).toContain(owner.did);
	});

	it("JSON output for valid delegation includes all fields", async () => {
		const agent = await createAgent({
			domain: "test.example",
			algorithm: "ES256",
		});
		const owner = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});

		saveAgent(agent);
		saveOwner(owner);

		const delegation = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["payments:read", "invoices:create"],
			constraints: { maxTransactionValue: 1000 },
		});

		const { verifyCommand } = await import("./verify.js");
		await verifyCommand(delegation.token, { json: true });

		const logs = collectLogs();
		const jsonLine = logs.split("\n").find((l) => l.startsWith("{"));
		expect(jsonLine).toBeDefined();

		const parsed = JSON.parse(jsonLine!);
		expect(parsed.valid).toBe(true);
		expect(parsed.agent).toBe(agent.did);
		expect(parsed.owner).toBe(owner.did);
		expect(parsed.scopes).toEqual(["payments:read", "invoices:create"]);
		expect(parsed.constraints).toEqual({ maxTransactionValue: 1000 });
		expect(parsed.errors).toEqual([]);
	});

	it("JSON output for invalid token", async () => {
		const owner = await createAgent({
			domain: "owner.local",
			algorithm: "ES256",
		});
		saveOwner(owner);

		const { verifyCommand } = await import("./verify.js");
		await verifyCommand("invalid-token", { json: true });

		const logs = collectLogs();
		const jsonLine = logs.split("\n").find((l) => l.startsWith("{"));
		expect(jsonLine).toBeDefined();

		const parsed = JSON.parse(jsonLine!);
		expect(parsed.valid).toBe(false);
		expect(parsed.errors.length).toBeGreaterThan(0);
	});
});
