import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createAgent } from "credat";
import { describe, expect, it } from "vitest";
import { ExitError, collectLogs, useTestDir } from "../test-utils.js";
import { credatDir, saveAgent } from "../utils.js";

describe("delegate command validation", () => {
	useTestDir("delegate-test", { mockExit: true });

	it("rejects non-numeric max-value", async () => {
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

		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "abc" }),
		).rejects.toThrow(ExitError);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("--max-value must be a positive number"),
		);
	});

	it("rejects zero max-value", async () => {
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

		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "0" }),
		).rejects.toThrow(ExitError);
	});

	it("rejects negative max-value", async () => {
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

		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "-5" }),
		).rejects.toThrow(ExitError);
	});

	it("rejects invalid ISO date for --until", async () => {
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
	useTestDir("delegate-happy-test");

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

		const logs = collectLogs();
		const jsonLine = logs.split("\n").find((l) => l.startsWith("{"));
		expect(jsonLine).toBeDefined();

		const parsed = JSON.parse(jsonLine!);
		expect(parsed.agent).toBe(agent.did);
		expect(parsed.owner).toMatch(/^did:web:/);
		expect(parsed.scopes).toEqual(["payments:read"]);
		expect(parsed.constraints).toEqual({ maxTransactionValue: 500 });
		expect(parsed.token).toBeDefined();
		expect(typeof parsed.token).toBe("string");
	});
});
