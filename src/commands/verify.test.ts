import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAgent, delegate } from "credat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { credatDir, saveAgent, saveOwner } from "../utils.js";

class ExitError extends Error {
	code: number;
	constructor(code: number) {
		super(`process.exit(${code})`);
		this.code = code;
	}
}

describe("verify command", () => {
	const testDir = join(process.cwd(), ".credat-verify-test");
	const originalCwd = process.cwd();

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);

		vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new ExitError(code as number);
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(testDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

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
			JSON.stringify({ token: "test-token", claims: {} }),
		);

		const { verifyCommand } = await import("./verify.js");
		await expect(verifyCommand(undefined)).rejects.toThrow(ExitError);

		// Should have loaded the token (no "token is required" error)
		// but failed because no owner
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("No owner key found"),
		);
	});
});

describe("verify command happy path", () => {
	const testDir = join(process.cwd(), ".credat-verify-happy-test");
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

		const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls
			.map((c) => c[0])
			.join("\n");

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

		const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const jsonCall = logCalls.find(
			(c) => typeof c[0] === "string" && c[0].startsWith("{"),
		);
		expect(jsonCall).toBeDefined();

		const parsed = JSON.parse(jsonCall![0]);
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

		const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const jsonCall = logCalls.find(
			(c) => typeof c[0] === "string" && c[0].startsWith("{"),
		);
		expect(jsonCall).toBeDefined();

		const parsed = JSON.parse(jsonCall![0]);
		expect(parsed.valid).toBe(false);
		expect(parsed.errors.length).toBeGreaterThan(0);
	});
});
