import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAgent } from "../utils.js";

class ExitError extends Error {
	code: number;
	constructor(code: number) {
		super(`process.exit(${code})`);
		this.code = code;
	}
}

describe("delegate command validation", () => {
	const testDir = join(process.cwd(), ".credat-delegate-test");
	const originalCwd = process.cwd();

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);

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

	it("rejects non-numeric max-value", async () => {
		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "abc" }),
		).rejects.toThrow(ExitError);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("--max-value must be a positive number"),
		);
	});

	it("rejects zero max-value", async () => {
		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "0" }),
		).rejects.toThrow(ExitError);
	});

	it("rejects negative max-value", async () => {
		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", maxValue: "-5" }),
		).rejects.toThrow(ExitError);
	});

	it("rejects invalid ISO date for --until", async () => {
		const { delegateCommand } = await import("./delegate.js");
		await expect(
			delegateCommand({ scopes: "payments:read", until: "not-a-date" }),
		).rejects.toThrow(ExitError);

		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("--until must be a valid ISO 8601 date"),
		);
	});
});
