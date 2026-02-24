import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	credatDir,
	deserializeKeyPair,
	loadAgentFile,
	saveAgent,
	serializeKeyPair,
} from "./utils.js";

describe("serializeKeyPair / deserializeKeyPair roundtrip", () => {
	it("preserves algorithm and key bytes through roundtrip", () => {
		const original = {
			algorithm: "ES256",
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
			algorithm: "EdDSA",
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
			algorithm: "ES256",
			publicKey: large,
			privateKey: new Uint8Array(large).reverse(),
		};

		const roundtripped = deserializeKeyPair(serializeKeyPair(original));
		expect(roundtripped.publicKey).toEqual(original.publicKey);
		expect(roundtripped.privateKey).toEqual(original.privateKey);
	});
});

describe("file permissions", () => {
	const testDir = join(process.cwd(), ".credat-test");
	const originalCwd = process.cwd();

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(testDir, { recursive: true, force: true });
	});

	it("saveAgent creates files with 0o600 permissions", () => {
		saveAgent({
			did: "did:web:test.example",
			algorithm: "ES256",
			domain: "test.example",
			keyPair: {
				algorithm: "ES256",
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
			algorithm: "ES256",
			domain: "test.example",
			keyPair: {
				algorithm: "ES256",
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
			algorithm: "ES256",
			domain: "roundtrip.test",
			path: "agents/test",
			keyPair: {
				algorithm: "ES256",
				publicKey: new Uint8Array([11, 22, 33]),
				privateKey: new Uint8Array([44, 55, 66]),
			},
			didDocument: { id: "did:web:roundtrip.test" },
		};

		saveAgent(original);
		const loaded = loadAgentFile();

		expect(loaded.did).toBe(original.did);
		expect(loaded.algorithm).toBe(original.algorithm);
		expect(loaded.domain).toBe(original.domain);
		expect(loaded.path).toBe(original.path);
		expect(loaded.keyPair.publicKey).toEqual(original.keyPair.publicKey);
		expect(loaded.keyPair.privateKey).toEqual(original.keyPair.privateKey);
	});
});
