import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAgent, createStatusList, delegate, encodeStatusList } from "@credat/sdk";
import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";
import { credatDir, saveDelegation, saveOwner } from "../utils.js";

/** Create a fake token with a status list entry in the payload. */
function fakeTokenWithStatus(idx: number, uri: string): string {
	const hdr = Buffer.from(JSON.stringify({ alg: "ES256", typ: "dc+sd-jwt" })).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({
			iss: "did:web:owner.local",
			sub: "did:web:agent.local",
			status: { status_list: { idx, uri } },
		}),
	).toString("base64url");
	return `${hdr}.${payload}.fake-sig`;
}

/** Create a fake token WITHOUT a status list entry. */
function fakeTokenWithoutStatus(): string {
	const hdr = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({ iss: "did:web:owner.local", sub: "did:web:agent.local" }),
	).toString("base64url");
	return `${hdr}.${payload}.fake-sig`;
}

/** Seed a status-list.json file in .credat/. */
function seedStatusList(): void {
	const dir = credatDir();
	mkdirSync(dir, { recursive: true });
	const list = createStatusList({
		id: "default",
		issuer: "did:web:owner.local",
		url: "https://owner.local/status/1",
	});
	const file = {
		id: list.id,
		issuer: list.issuer,
		url: "https://owner.local/status/1",
		size: list.size,
		encoded: encodeStatusList(list.bitstring),
	};
	writeFileSync(join(dir, "status-list.json"), JSON.stringify(file));
}

describe("revoke command — error paths", () => {
	useTestDir("revoke-errors");

	it("errors when no token and no delegation.json", async () => {
		const { revokeCommand } = await import("./revoke.js");
		expect(() => revokeCommand()).toThrow("No delegation found");
	});

	it("errors when token has no status list entry", async () => {
		const { revokeCommand } = await import("./revoke.js");
		expect(() =>
			revokeCommand({ token: fakeTokenWithoutStatus() }),
		).toThrow("no status list entry");
	});

	it("errors when --index is not a valid number", async () => {
		const { revokeCommand } = await import("./revoke.js");
		expect(() => revokeCommand({ index: "abc" })).toThrow(
			"--index must be a non-negative integer",
		);
	});

	it("errors when --index is negative", async () => {
		const { revokeCommand } = await import("./revoke.js");
		expect(() => revokeCommand({ index: "-1" })).toThrow(
			"--index must be a non-negative integer",
		);
	});
});

describe("revoke command — with explicit --index", () => {
	useTestDir("revoke-index");

	it("revokes with --index and creates status list when owner exists", async () => {
		const owner = await createAgent({ domain: "owner.local", algorithm: "ES256" });
		saveOwner(owner);
		seedStatusList();

		const { revokeCommand } = await import("./revoke.js");
		revokeCommand({ index: "42" });

		const logs = collectLogs();
		expect(logs).toContain("revoked");
		expect(logs).toContain("42");

		// Verify status list was saved
		const slPath = join(credatDir(), "status-list.json");
		expect(existsSync(slPath)).toBe(true);
	});

	it("reports already revoked on second revocation", async () => {
		const owner = await createAgent({ domain: "owner.local", algorithm: "ES256" });
		saveOwner(owner);
		seedStatusList();

		const { revokeCommand } = await import("./revoke.js");
		revokeCommand({ index: "10" });

		const logs1 = collectLogs();
		expect(logs1).toContain("revoked");

		// Second call
		revokeCommand({ index: "10" });
		const logs2 = collectLogs();
		expect(logs2).toContain("already revoked");
	});
});

describe("revoke command — from token", () => {
	useTestDir("revoke-token");

	it("extracts index from token and revokes", async () => {
		const owner = await createAgent({ domain: "owner.local", algorithm: "ES256" });
		saveOwner(owner);
		seedStatusList();

		const token = fakeTokenWithStatus(7, "https://owner.local/status/1");

		const { revokeCommand } = await import("./revoke.js");
		revokeCommand({ token });

		const logs = collectLogs();
		expect(logs).toContain("revoked");
		expect(logs).toContain("7");
	});
});

describe("revoke command — from delegation.json", () => {
	useTestDir("revoke-delegation");

	it("loads token from delegation.json and revokes", async () => {
		const agent = await createAgent({ domain: "agent.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "owner.local", algorithm: "ES256" });
		saveOwner(owner);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read"],
			statusList: { url: "https://owner.local/status/1", index: 99 },
		});
		saveDelegation(d);
		seedStatusList();

		const { revokeCommand } = await import("./revoke.js");
		revokeCommand();

		const logs = collectLogs();
		expect(logs).toContain("revoked");
		expect(logs).toContain("99");
	});
});

describe("revoke command — JSON output", () => {
	useTestDir("revoke-json");

	it("outputs JSON for successful revocation", async () => {
		const owner = await createAgent({ domain: "owner.local", algorithm: "ES256" });
		saveOwner(owner);
		seedStatusList();

		const { revokeCommand } = await import("./revoke.js");
		revokeCommand({ index: "5", json: true });

		const logs = collectLogs();
		const jsonLine = logs.split("\n").find((l: string) => l.startsWith("{"));
		expect(jsonLine).toBeDefined();

		const parsed = JSON.parse(jsonLine!);
		expect(parsed.revoked).toBe(true);
		expect(parsed.index).toBe(5);
		expect(parsed.alreadyRevoked).toBe(false);
	});

	it("outputs JSON for already-revoked", async () => {
		const owner = await createAgent({ domain: "owner.local", algorithm: "ES256" });
		saveOwner(owner);
		seedStatusList();

		const { revokeCommand } = await import("./revoke.js");
		revokeCommand({ index: "5" });
		revokeCommand({ index: "5", json: true });

		const logs = collectLogs();
		const jsonLines = logs.split("\n").filter((l: string) => l.startsWith("{"));
		const last = JSON.parse(jsonLines[jsonLines.length - 1]!);
		expect(last.revoked).toBe(true);
		expect(last.alreadyRevoked).toBe(true);
	});
});

describe("revoke command — custom status list path", () => {
	useTestDir("revoke-custom-sl");

	it("uses --status-list for custom path", async () => {
		const owner = await createAgent({ domain: "owner.local", algorithm: "ES256" });
		saveOwner(owner);

		// Create status list at custom location
		const list = createStatusList({
			id: "custom",
			issuer: owner.did,
			url: "https://owner.local/status/custom",
		});
		const customPath = join(process.cwd(), "custom-sl.json");
		writeFileSync(
			customPath,
			JSON.stringify({
				id: list.id,
				issuer: list.issuer,
				url: "https://owner.local/status/custom",
				size: list.size,
				encoded: encodeStatusList(list.bitstring),
			}),
		);

		const { revokeCommand } = await import("./revoke.js");
		revokeCommand({ index: "3", statusList: customPath });

		const logs = collectLogs();
		expect(logs).toContain("revoked");
		expect(logs).toContain("3");

		// Verify it saved back to the custom path
		const saved = JSON.parse(readFileSync(customPath, "utf-8"));
		expect(saved.id).toBe("custom");
	});
});
