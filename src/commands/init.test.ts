import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ExitError, collectLogs, useTestDir } from "../test-utils.js";
import { credatDir } from "../utils.js";

describe("init command --force guard", () => {
	useTestDir("init-test", { mockExit: true });

	it("exits when agent.json exists and --force is not set", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "agent.json"), "{}");

		const { initCommand } = await import("./init.js");
		await expect(initCommand({ domain: "test.example" })).rejects.toThrow(
			ExitError,
		);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("Agent identity already exists"),
		);
	});

	it("overwrites when --force is set", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "agent.json"), "{}");

		const { initCommand } = await import("./init.js");
		await initCommand({ domain: "test.example", force: true });

		expect(existsSync(join(dir, "agent.json"))).toBe(true);
	});
});

describe("init command happy path", () => {
	useTestDir("init-happy-test");

	it("creates agent.json with correct DID format", async () => {
		const { initCommand } = await import("./init.js");
		await initCommand({ domain: "test.example" });

		const agentPath = join(credatDir(), "agent.json");
		expect(existsSync(agentPath)).toBe(true);

		const agent = JSON.parse(readFileSync(agentPath, "utf-8"));
		expect(agent.did).toMatch(/^did:web:/);
		expect(agent.did).toContain("test.example");
		expect(agent.domain).toBe("test.example");
		expect(agent.keyPair).toBeDefined();
		expect(agent.didDocument).toBeDefined();
		expect(agent.didDocument.id).toBe(agent.did);
	});

	it("creates agent with EdDSA algorithm", async () => {
		const { initCommand } = await import("./init.js");
		await initCommand({ domain: "test.example", algorithm: "EdDSA" });

		const agentPath = join(credatDir(), "agent.json");
		const agent = JSON.parse(readFileSync(agentPath, "utf-8"));

		expect(agent.algorithm).toBe("EdDSA");
		expect(agent.keyPair.algorithm).toBe("EdDSA");
	});

	it("outputs DID document hosting URL", async () => {
		const { initCommand } = await import("./init.js");
		await initCommand({ domain: "test.example" });

		expect(collectLogs()).toContain(
			"https://test.example/.well-known/did.json",
		);
	});

	it("outputs path-based URL when path is provided", async () => {
		const { initCommand } = await import("./init.js");
		await initCommand({ domain: "test.example", path: "agents/bot" });

		expect(collectLogs()).toContain(
			"https://test.example/agents/bot/did.json",
		);
	});
});
