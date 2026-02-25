import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { credatDir } from "../utils.js";

class ExitError extends Error {
	code: number;
	constructor(code: number) {
		super(`process.exit(${code})`);
		this.code = code;
	}
}

describe("init command --force guard", () => {
	const testDir = join(process.cwd(), ".credat-init-test");
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
	const testDir = join(process.cwd(), ".credat-init-happy-test");
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

		const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls
			.map((c) => c[0])
			.join("\n");

		expect(logs).toContain("https://test.example/.well-known/did.json");
	});

	it("outputs path-based URL when path is provided", async () => {
		const { initCommand } = await import("./init.js");
		await initCommand({ domain: "test.example", path: "agents/bot" });

		const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls
			.map((c) => c[0])
			.join("\n");

		expect(logs).toContain("https://test.example/agents/bot/did.json");
	});
});
