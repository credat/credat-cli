import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useTestDir } from "./test-utils.js";
import {
	credatDir,
	delegationExists,
	deserializeKeyPair,
	loadAgentFile,
	loadDelegationFile,
	loadOwnerFile,
	saveAgent,
	saveDelegation,
	saveOwner,
	serializeKeyPair,
	truncate,
} from "./utils.js";

describe("serializeKeyPair / deserializeKeyPair roundtrip", () => {
	it("preserves algorithm and key bytes through roundtrip", () => {
		const original = {
			algorithm: "ES256" as const,
			publicKey: new Uint8Array([1, 2, 3, 4, 5]),
			privateKey: new Uint8Array([10, 20, 30, 40, 50]),
		};

		const serialized = serializeKeyPair(original);
		expect(typeof serialized.publicKey).toBe("string");
		expect(typeof serialized.privateKey).toBe("string");
		expect(serialized.algorithm).toBe("ES256");

		const deserialized = deserializeKeyPair(serialized);
		expect(deserialized.algorithm).toBe(original.algorithm);
		expect(deserialized.publicKey).toEqual(original.publicKey);
		expect(deserialized.privateKey).toEqual(original.privateKey);
	});

	it("handles empty Uint8Arrays", () => {
		const original = {
			algorithm: "EdDSA" as const,
			publicKey: new Uint8Array([]),
			privateKey: new Uint8Array([]),
		};

		const roundtripped = deserializeKeyPair(serializeKeyPair(original));
		expect(roundtripped.publicKey).toEqual(original.publicKey);
		expect(roundtripped.privateKey).toEqual(original.privateKey);
	});

	it("handles large key data", () => {
		const large = new Uint8Array(256);
		for (let i = 0; i < 256; i++) large[i] = i;

		const original = {
			algorithm: "ES256" as const,
			publicKey: large,
			privateKey: new Uint8Array(large).reverse(),
		};

		const roundtripped = deserializeKeyPair(serializeKeyPair(original));
		expect(roundtripped.publicKey).toEqual(original.publicKey);
		expect(roundtripped.privateKey).toEqual(original.privateKey);
	});
});

describe("file permissions", () => {
	useTestDir("perm-test");

	it("saveAgent creates files with 0o600 permissions", () => {
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

		const agentPath = join(credatDir(), "agent.json");
		expect(existsSync(agentPath)).toBe(true);

		const stat = statSync(agentPath);
		expect(stat.mode & 0o777).toBe(0o600);
	});

	it("creates .credat directory with 0o700 permissions", () => {
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

		const stat = statSync(credatDir());
		expect(stat.mode & 0o777).toBe(0o700);
	});

	it("loadAgentFile throws when no agent exists", () => {
		expect(() => loadAgentFile()).toThrow("No agent found");
	});

	it("saveAgent + loadAgentFile roundtrip preserves data", () => {
		const original = {
			did: "did:web:roundtrip.test",
			domain: "roundtrip.test",
			path: "agents/test",
			keyPair: {
				algorithm: "ES256" as const,
				publicKey: new Uint8Array([11, 22, 33]),
				privateKey: new Uint8Array([44, 55, 66]),
			},
			didDocument: { id: "did:web:roundtrip.test" },
		};

		saveAgent(original);
		const loaded = loadAgentFile();

		expect(loaded.did).toBe(original.did);
		expect(loaded.algorithm).toBe(original.keyPair.algorithm);
		expect(loaded.domain).toBe(original.domain);
		expect(loaded.path).toBe(original.path);
		expect(loaded.keyPair.publicKey).toEqual(original.keyPair.publicKey);
		expect(loaded.keyPair.privateKey).toEqual(original.keyPair.privateKey);
	});
});

describe("owner file I/O", () => {
	useTestDir("owner-test");

	it("saveOwner + loadOwnerFile roundtrip preserves data", () => {
		const original = {
			did: "did:web:owner.test",
			keyPair: {
				algorithm: "ES256" as const,
				publicKey: new Uint8Array([100, 200, 150]),
				privateKey: new Uint8Array([50, 60, 70]),
			},
		};

		saveOwner(original);
		const loaded = loadOwnerFile();

		expect(loaded.did).toBe(original.did);
		expect(loaded.keyPair.algorithm).toBe(original.keyPair.algorithm);
		expect(loaded.keyPair.publicKey).toEqual(original.keyPair.publicKey);
		expect(loaded.keyPair.privateKey).toEqual(original.keyPair.privateKey);
	});

	it("loadOwnerFile throws when no owner exists", () => {
		expect(() => loadOwnerFile()).toThrow("No owner found");
	});

	it("saveOwner creates file with 0o600 permissions", () => {
		saveOwner({
			did: "did:web:owner.test",
			keyPair: {
				algorithm: "ES256" as const,
				publicKey: new Uint8Array([1]),
				privateKey: new Uint8Array([2]),
			},
		});

		const ownerPath = join(credatDir(), "owner.json");
		const stat = statSync(ownerPath);
		expect(stat.mode & 0o777).toBe(0o600);
	});
});

describe("delegation file I/O", () => {
	useTestDir("delegation-test");

	it("creates delegation.json with 0o600 permissions", () => {
		saveDelegation({
			token: "test-token",
			claims: {
				agent: "did:web:test.example",
				owner: "did:web:owner.local",
				scopes: ["payments:read"],
			},
		});

		const delegationPath = join(credatDir(), "delegation.json");
		expect(existsSync(delegationPath)).toBe(true);

		const stat = statSync(delegationPath);
		expect(stat.mode & 0o777).toBe(0o600);
	});

	it("delegationExists returns false when no delegation", () => {
		expect(delegationExists()).toBe(false);
	});

	it("delegationExists returns true after saving", () => {
		saveDelegation({
			token: "test-token",
			claims: {
				agent: "did:web:test.example",
				owner: "did:web:owner.local",
				scopes: ["payments:read"],
			},
		});
		expect(delegationExists()).toBe(true);
	});

	it("loadDelegationFile throws when no delegation exists", () => {
		expect(() => loadDelegationFile()).toThrow("No delegation found");
	});

	it("saveDelegation + loadDelegationFile roundtrip preserves data", () => {
		const original = {
			token: "test-token-123",
			claims: {
				agent: "did:web:test.example",
				owner: "did:web:owner.local",
				scopes: ["payments:read", "invoices:create"],
				constraints: { maxTransactionValue: 5000 },
				validUntil: "2099-12-31T00:00:00.000Z",
				validFrom: "2024-01-01T00:00:00.000Z",
			},
		};

		saveDelegation(original);
		const loaded = loadDelegationFile();

		expect(loaded.token).toBe(original.token);
		expect(loaded.claims.agent).toBe(original.claims.agent);
		expect(loaded.claims.owner).toBe(original.claims.owner);
		expect(loaded.claims.scopes).toEqual(original.claims.scopes);
		expect(loaded.claims.constraints).toEqual(original.claims.constraints);
		expect(loaded.claims.validUntil).toBe(original.claims.validUntil);
		expect(loaded.claims.validFrom).toBe(original.claims.validFrom);
	});
});

describe("truncate", () => {
	it("returns the string unchanged when shorter than limit", () => {
		expect(truncate("hello", 60)).toBe("hello");
	});

	it("returns the string unchanged when exactly at limit", () => {
		const str = "a".repeat(60);
		expect(truncate(str, 60)).toBe(str);
	});

	it("truncates with ellipsis when longer than limit", () => {
		const str = "a".repeat(80);
		expect(truncate(str, 60)).toBe("a".repeat(60) + "...");
	});

	it("handles empty string", () => {
		expect(truncate("", 60)).toBe("");
	});

	it("uses default limit of 60", () => {
		const short = "a".repeat(60);
		expect(truncate(short)).toBe(short);

		const long = "a".repeat(61);
		expect(truncate(long)).toBe("a".repeat(60) + "...");
	});
});
