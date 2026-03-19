import { createAgent, delegate } from "credat";
import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";
import {
	loadDelegationFile,
	saveAgent,
	saveDelegation,
	saveOwner,
} from "../utils.js";

describe("renew command — error paths", () => {
	useTestDir("renew-errors");

	it("errors when no delegation exists", async () => {
		const { renewCommand } = await import("./renew.js");
		await expect(renewCommand({ until: "2099-12-31T00:00:00Z" })).rejects.toThrow(
			"No delegation found",
		);
	});

	it("errors when no owner exists", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveAgent(agent);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read"],
		});
		saveDelegation(d);
		// Don't save owner — intentionally missing

		const { renewCommand } = await import("./renew.js");
		await expect(renewCommand({ until: "2099-12-31T00:00:00Z" })).rejects.toThrow(
			"No owner found",
		);
	});

	it("errors on invalid date format", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveAgent(agent);
		saveOwner(owner);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read"],
		});
		saveDelegation(d);

		const { renewCommand } = await import("./renew.js");
		await expect(renewCommand({ until: "not-a-date" })).rejects.toThrow(
			"valid ISO 8601",
		);
	});

	it("errors when date is in the past", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveAgent(agent);
		saveOwner(owner);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read"],
		});
		saveDelegation(d);

		const { renewCommand } = await import("./renew.js");
		await expect(renewCommand({ until: "2020-01-01T00:00:00Z" })).rejects.toThrow(
			"must be in the future",
		);
	});
});

describe("renew command — happy path", () => {
	useTestDir("renew-happy");

	it("renews delegation preserving scopes and constraints", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveAgent(agent);
		saveOwner(owner);

		const original = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["payments:read", "invoices:create"],
			constraints: { maxTransactionValue: 5000 },
			validUntil: "2025-01-01T00:00:00Z",
		});
		saveDelegation(original);

		const { renewCommand } = await import("./renew.js");
		await renewCommand({ until: "2099-12-31T23:59:59Z" });

		const renewed = loadDelegationFile();
		// Token changed
		expect(renewed.token).not.toBe(original.token);
		// Scopes preserved
		expect(renewed.claims.scopes).toEqual([
			"payments:read",
			"invoices:create",
		]);
		// Constraints preserved
		expect(renewed.claims.constraints?.maxTransactionValue).toBe(5000);
	});

	it("pretty output shows renewal details", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveAgent(agent);
		saveOwner(owner);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read"],
		});
		saveDelegation(d);

		const { renewCommand } = await import("./renew.js");
		await renewCommand({ until: "2099-06-15T00:00:00Z" });

		const logs = collectLogs();
		expect(logs).toContain("Delegation Renewed");
		expect(logs).toContain(agent.did);
		expect(logs).toContain(owner.did);
		expect(logs).toContain("2099-06-15T00:00:00Z");
		expect(logs).toContain("renewed with new expiry");
	});
});

describe("renew command — JSON output", () => {
	useTestDir("renew-json");

	it("outputs structured JSON", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveAgent(agent);
		saveOwner(owner);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read", "write"],
		});
		saveDelegation(d);

		const { renewCommand } = await import("./renew.js");
		await renewCommand({ until: "2099-01-01T00:00:00Z", json: true });

		const logs = collectLogs();
		const jsonLine = logs.split("\n").find((l: string) => l.startsWith("{"));
		expect(jsonLine).toBeDefined();

		const parsed = JSON.parse(jsonLine!);
		expect(parsed.renewed).toBe(true);
		expect(parsed.agent).toBe(agent.did);
		expect(parsed.owner).toBe(owner.did);
		expect(parsed.scopes).toEqual(["read", "write"]);
		expect(parsed.validUntil).toBe("2099-01-01T00:00:00Z");
		expect(parsed.token).toBeTruthy();
	});
});

describe("renew command — verify renewed token", () => {
	useTestDir("renew-verify");

	it("renewed token is cryptographically valid", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveAgent(agent);
		saveOwner(owner);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read"],
		});
		saveDelegation(d);

		const { renewCommand } = await import("./renew.js");
		await renewCommand({ until: "2099-12-31T00:00:00Z" });

		const renewed = loadDelegationFile();

		const { verifyCommand } = await import("./verify.js");
		await verifyCommand(renewed.token, { json: true });

		const logs = collectLogs();
		const jsonLine = logs.split("\n").find((l: string) => l.startsWith("{"));
		const parsed = JSON.parse(jsonLine!);
		expect(parsed.valid).toBe(true);
		expect(parsed.validUntil).toBe("2099-12-31T00:00:00Z");
	});
});
