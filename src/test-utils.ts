import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * Sentinel error thrown by mocked process.exit() in tests.
 * Use with: `vi.spyOn(process, "exit").mockImplementation(...)`.
 */
export class ExitError extends Error {
	code: number;
	constructor(code: number) {
		super(`process.exit(${code})`);
		this.code = code;
	}
}

/**
 * Collect all console.log output into a single string.
 * Must be called after `vi.spyOn(console, "log")`.
 */
export function collectLogs(): string {
	return (console.log as ReturnType<typeof vi.fn>).mock.calls
		.map((c) => c[0])
		.join("\n");
}

/**
 * Sets up a temp directory, chdir into it, and mocks console + process.exit.
 * Returns cleanup in afterEach automatically.
 *
 * @param name - Unique suffix for the temp dir (e.g. "init-test")
 * @param opts.mockExit - If true, mock process.exit to throw ExitError (default: false)
 */
export function useTestDir(
	name: string,
	opts: { mockExit?: boolean } = {},
): void {
	const testDir = join(process.cwd(), `.credat-${name}`);
	const originalCwd = process.cwd();

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		process.chdir(testDir);

		if (opts.mockExit) {
			vi.spyOn(process, "exit").mockImplementation((code) => {
				throw new ExitError(code as number);
			});
		}
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(testDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});
}
