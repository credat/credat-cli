import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createAgent } from "credat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { credatDir, saveAgent } from "../utils.js";

class ExitError extends Error {
	code: number;
	constructor(code: number) {
		super(`process.exit(${code})`);
		this.code = code;
	}
}

describe("delegate command validation", () => {
	const testDir = join(process.cwd(), ".credat-delegate-test");
	const originalCwd = process.cwd();

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);

		saveAgent({
			did: "did:web:test.example",
			domain: "test.example",
			keyPair: {
				algorithm: "ES256" as const,
				publicKey: new Uint8Array([1, 2, 3]),
				privateKey: new Uint8Array([4, 5, 6]),
			},
			didDocument: { id: "did:web:test.example" },
		});

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

	it("rejects non-numeric max-value", async () => {
		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "abc" }),
		).rejects.toThrow(ExitError);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("--max-value must be a positive number"),
		);
	});

	it("rejects zero max-value", async () => {
		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "0" }),
		).rejects.toThrow(ExitError);
	});

	it("rejects negative max-value", async () => {
		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "-5" }),
		).rejects.toThrow(ExitError);
	});

	it("rejects invalid ISO date for --until", async () => {
		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", until: "not-a-date" }),
		).rejects.toThrow(ExitError);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("--until must be a valid ISO 8601 date"),
		);
	});
});

describe("delegate command happy path", () => {
	const testDir = join(process.cwd(), ".credat-delegate-happy-test");
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

	it("creates delegation with real SDK and saves delegation.json", async () => {
		const agent = await createAgent({
			domain: "test.example",
			algorithm: "ES256",
		});
		saveAgent(agent);

		const { delegateCommand } = await import("./delegate.js");
		await delegateCommand({ scopes: "payments:read,invoices:create" });

		const delegationPath = join(credatDir(), "delegation.json");
		expect(existsSync(delegationPath)).toBe(true);

		const delegation = JSON.parse(readFileSync(delegationPath, "utf-8"));
		expect(delegation.token).toBeDefined();
		expect(typeof delegation.token).toBe("string");
		expect(delegation.claims).toBeDefined();
		expect(delegation.claims.agent).toBe(agent.did);
		expect(delegation.claims.scopes).toEqual([
			"payments:read",
			"invoices:create",
		]);
	});

	it("creates owner.json when none exists", async () => {
		const agent = await createAgent({
			domain: "test.example",
			algorithm: "ES256",
		});
		saveAgent(agent);

		const ownerPath = join(credatDir(), "owner.json");
		expect(existsSync(ownerPath)).toBe(false);

		const { delegateCommand } = await import("./delegate.js");
		await delegateCommand({ scopes: "payments:read" });

		expect(existsSync(ownerPath)).toBe(true);

		const owner = JSON.parse(readFileSync(ownerPath, "utf-8"));
		expect(owner.did).toMatch(/^did:web:/);
		expect(owner.keyPair).toBeDefined();
	});

	it("JSON output includes correct fields", async () => {
		const agent = await createAgent({
			domain: "test.example",
			algorithm: "ES256",
		});
		saveAgent(agent);

		const { delegateCommand } = await import("./delegate.js");
		await delegateCommand({
			scopes: "payments:read",
			maxValue: "500",
			json: true,
		});

		const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		// Find the JSON output call (the one that parses as valid JSON)
		const jsonCall = logCalls.find(
			(c) => typeof c[0] === "string" && c[0].startsWith("{"),
		);
		expect(jsonCall).toBeDefined();

		const parsed = JSON.parse(jsonCall![0]);
		expect(parsed.agent).toBe(agent.did);
		expect(parsed.owner).toMatch(/^did:web:/);
		expect(parsed.scopes).toEqual(["payments:read"]);
		expect(parsed.constraints).toEqual({ maxTransactionValue: 500 });
		expect(parsed.token).toBeDefined();
		expect(typeof parsed.token).toBe("string");
	});
});
