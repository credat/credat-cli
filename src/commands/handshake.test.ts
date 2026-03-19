import { createAgent, createChallenge, delegate } from "credat";
import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";
import { saveAgent, saveDelegation, saveOwner } from "../utils.js";

describe("handshake challenge", () => {
	useTestDir("hs-challenge");

	it("creates a challenge with --from DID", async () => {
		const { handshakeChallengeCommand } = await import("./handshake.js");
		handshakeChallengeCommand({ from: "did:web:service.local" });

		const logs = collectLogs();
		expect(logs).toContain("Challenge Created");
		expect(logs).toContain("did:web:service.local");
	});

	it("JSON output is valid challenge message", async () => {
		const { handshakeChallengeCommand } = await import("./handshake.js");
		handshakeChallengeCommand({ from: "did:web:s.local", json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(parsed.type).toBe("credat:challenge");
		expect(parsed.from).toBe("did:web:s.local");
		expect(parsed.nonce).toBeTruthy();
		expect(parsed.timestamp).toBeTruthy();
	});
});

describe("handshake present", () => {
	useTestDir("hs-present");

	it("creates presentation from challenge + local delegation", async () => {
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

		const challenge = createChallenge({ from: "did:web:service.local" });

		const { handshakePresentCommand } = await import("./handshake.js");
		await handshakePresentCommand({
			challenge: JSON.stringify(challenge),
			json: true,
		});

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(parsed.type).toBe("credat:presentation");
		expect(parsed.from).toBe(agent.did);
		expect(parsed.proof).toBeTruthy();
	});

	it("errors on invalid challenge JSON", async () => {
		const { handshakePresentCommand } = await import("./handshake.js");
		await expect(
			handshakePresentCommand({ challenge: "not-json" }),
		).rejects.toThrow("Invalid challenge JSON");
	});

	it("errors on wrong challenge type", async () => {
		const { handshakePresentCommand } = await import("./handshake.js");
		await expect(
			handshakePresentCommand({
				challenge: JSON.stringify({ type: "wrong" }),
			}),
		).rejects.toThrow("wrong type");
	});

	it("errors when no delegation exists", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		saveAgent(agent);

		const challenge = createChallenge({ from: "did:web:s.local" });
		const { handshakePresentCommand } = await import("./handshake.js");
		await expect(
			handshakePresentCommand({ challenge: JSON.stringify(challenge) }),
		).rejects.toThrow("No delegation found");
	});
});

describe("handshake verify", () => {
	useTestDir("hs-verify");

	it("verifies a valid presentation", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveAgent(agent);
		saveOwner(owner);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["payments:read"],
		});
		saveDelegation(d);

		const challenge = createChallenge({ from: "did:web:service.local" });

		// Present
		const { handshakePresentCommand, handshakeVerifyCommand } = await import(
			"./handshake.js"
		);
		await handshakePresentCommand({
			challenge: JSON.stringify(challenge),
			json: true,
		});
		const presentLogs = collectLogs();
		const presentation = JSON.parse(
			presentLogs.split("\n").find((l: string) => l.startsWith("{"))!,
		);

		// Verify
		await handshakeVerifyCommand({
			presentation: JSON.stringify(presentation),
			challenge: JSON.stringify(challenge),
			json: true,
		});
		const verifyLogs = collectLogs();
		const jsonLines = verifyLogs
			.split("\n")
			.filter((l: string) => l.startsWith("{"));
		const result = JSON.parse(jsonLines[jsonLines.length - 1]!);
		expect(result.valid).toBe(true);
		expect(result.agent).toBe(agent.did);
		expect(result.scopes).toContain("payments:read");
	});
});

describe("handshake demo", () => {
	useTestDir("hs-demo");

	it("runs full handshake flow", async () => {
		const { handshakeDemoCommand } = await import("./handshake.js");
		await handshakeDemoCommand({});

		const logs = collectLogs();
		expect(logs).toContain("Create service identity");
		expect(logs).toContain("Agent presents credentials");
		expect(logs).toContain("Service verifies presentation");
		expect(logs).toContain("trust established");
	});

	it("JSON output for demo", async () => {
		const { handshakeDemoCommand } = await import("./handshake.js");
		await handshakeDemoCommand({ json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(parsed.valid).toBe(true);
		expect(parsed.scopes).toContain("payments:read");
	});
});
