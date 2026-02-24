import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
