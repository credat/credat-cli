import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

describe("verify command", () => {
	const testDir = join(process.cwd(), ".credat-verify-test");
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

	it("exits with error when no token and no delegation.json", async () => {
		const { verifyCommand } = await import("./verify.js");
		await expect(verifyCommand(undefined)).rejects.toThrow(ExitError);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("A delegation token is required"),
		);
	});

	it("loads token from delegation.json but exits when no owner", async () => {
		const dir = credatDir();
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "delegation.json"),
			JSON.stringify({ raw: "test-token", claims: {} }),
		);

		const { verifyCommand } = await import("./verify.js");
		await expect(verifyCommand(undefined)).rejects.toThrow(ExitError);

		// Should have loaded the token (no "token is required" error)
		// but failed because no owner
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("No owner key found"),
		);
	});
});
