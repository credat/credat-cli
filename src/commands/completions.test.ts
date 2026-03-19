import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";

describe("completions command", () => {
	useTestDir("completions");

	it("generates bash completions", async () => {
		const { completionsCommand } = await import("./completions.js");
		completionsCommand("bash");

		const logs = collectLogs();
		expect(logs).toContain("_credat()");
		expect(logs).toContain("complete -F _credat credat");
		expect(logs).toContain("init");
		expect(logs).toContain("delegate");
		expect(logs).toContain("handshake");
	});

	it("generates zsh completions", async () => {
		const { completionsCommand } = await import("./completions.js");
		completionsCommand("zsh");

		const logs = collectLogs();
		expect(logs).toContain("#compdef credat");
		expect(logs).toContain("_credat");
		expect(logs).toContain("init:Create an agent identity");
	});

	it("generates fish completions", async () => {
		const { completionsCommand } = await import("./completions.js");
		completionsCommand("fish");

		const logs = collectLogs();
		expect(logs).toContain("complete -c credat");
		expect(logs).toContain("__fish_use_subcommand");
		expect(logs).toContain("init");
	});

	it("errors on unsupported shell", async () => {
		const { completionsCommand } = await import("./completions.js");
		expect(() => completionsCommand("powershell")).toThrow("Unsupported shell");
	});
});
