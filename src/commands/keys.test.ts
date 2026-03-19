import { createAgent } from "credat";
import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";
import { loadAgentFile, saveAgent, saveOwner } from "../utils.js";

describe("keys export", () => {
	useTestDir("keys-export");

	it("exports agent keys in JWK format", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		saveAgent(agent);

		const { keysExportCommand } = await import("./keys.js");
		keysExportCommand({ as: "agent", json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(
			logs.split("\n").find((l: string) => l.startsWith("{"))!,
		);
		expect(parsed.keys.algorithm).toBe("ES256");
		expect(parsed.keys.publicKey.kty).toBe("EC");
		expect(parsed.keys.privateKey.d).toBeTruthy();
	});

	it("pretty output warns about private key sensitivity", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		saveAgent(agent);

		const { keysExportCommand } = await import("./keys.js");
		keysExportCommand({ as: "agent" });

		const logs = collectLogs();
		expect(logs).toContain("PRIVATE KEY");
	});

	it("exports owner keys with --json", async () => {
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveOwner(owner);

		const { keysExportCommand } = await import("./keys.js");
		keysExportCommand({ as: "owner", json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(parsed.type).toBe("owner");
		expect(parsed.did).toBe(owner.did);
		expect(parsed.keys.algorithm).toBe("ES256");
	});
});

describe("keys import", () => {
	useTestDir("keys-import");

	it("roundtrips export → import for agent", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		saveAgent(agent);

		const { keysExportCommand, keysImportCommand } = await import("./keys.js");

		// Export
		keysExportCommand({ as: "agent", json: true });
		const logs = collectLogs();
		const exported = JSON.parse(
			logs.split("\n").find((l: string) => l.startsWith("{"))!,
		);

		// Import back
		keysImportCommand(JSON.stringify(exported.keys), { as: "agent" });

		// Verify keys are the same
		const loaded = loadAgentFile();
		expect(Buffer.from(loaded.keyPair.publicKey).toString("base64url")).toBe(
			Buffer.from(agent.keyPair.publicKey).toString("base64url"),
		);
	});

	it("rejects invalid JSON", async () => {
		const { keysImportCommand } = await import("./keys.js");
		expect(() => keysImportCommand("not json", { as: "agent" })).toThrow(
			"could not parse JSON",
		);
	});

	it("rejects missing fields", async () => {
		const { keysImportCommand } = await import("./keys.js");
		expect(() =>
			keysImportCommand(JSON.stringify({ algorithm: "ES256" }), {
				as: "agent",
			}),
		).toThrow("missing required fields");
	});

	it("rejects unsupported algorithm", async () => {
		const { keysImportCommand } = await import("./keys.js");
		expect(() =>
			keysImportCommand(
				JSON.stringify({
					algorithm: "RS256",
					publicKey: {},
					privateKey: { d: "abc" },
				}),
				{ as: "agent" },
			),
		).toThrow("Unsupported algorithm");
	});
});

describe("keys list", () => {
	useTestDir("keys-list");

	it("shows both agent and owner keys", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "EdDSA" });
		saveAgent(agent);
		saveOwner(owner);

		const { keysListCommand } = await import("./keys.js");
		keysListCommand({ json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(parsed.keys).toHaveLength(2);
		expect(parsed.keys[0].type).toBe("agent");
		expect(parsed.keys[1].type).toBe("owner");
		expect(parsed.keys[0].publicKeyFingerprint).toBeTruthy();
	});

	it("shows message when no keys exist", async () => {
		const { keysListCommand } = await import("./keys.js");
		keysListCommand({});

		const logs = collectLogs();
		expect(logs).toContain("No keys found");
	});
});
