import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createAgent, delegate } from "@credat/sdk";
import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";
import { saveAgent, saveOwner } from "../utils.js";

describe("--output flag on init", () => {
	useTestDir("output-init");

	it("saves agent to custom path", async () => {
		const { initCommand } = await import("./init.js");
		const customPath = join(process.cwd(), "custom", "my-agent.json");

		await initCommand({
			domain: "test.local",
			algorithm: "ES256",
			output: customPath,
		});

		expect(existsSync(customPath)).toBe(true);
		const data = JSON.parse(readFileSync(customPath, "utf-8"));
		expect(data.did).toContain("did:web:test.local");

		// Check permissions (0o600)
		const stats = statSync(customPath);
		expect(stats.mode & 0o777).toBe(0o600);

		const logs = collectLogs();
		expect(logs).toContain(customPath);
	});

	it("default behavior unchanged when no --output", async () => {
		const { initCommand } = await import("./init.js");
		await initCommand({ domain: "default.local", algorithm: "ES256" });

		expect(existsSync(join(process.cwd(), ".credat", "agent.json"))).toBe(
			true,
		);
	});
});

describe("--output flag on delegate", () => {
	useTestDir("output-delegate");

	it("saves delegation to custom path", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		saveAgent(agent);

		const { delegateCommand } = await import("./delegate.js");
		const customPath = join(process.cwd(), "out", "deleg.json");

		await delegateCommand({
			scopes: "read",
			output: customPath,
		});

		expect(existsSync(customPath)).toBe(true);
		const data = JSON.parse(readFileSync(customPath, "utf-8"));
		expect(data.token).toBeTruthy();

		const stats = statSync(customPath);
		expect(stats.mode & 0o777).toBe(0o600);

		const logs = collectLogs();
		expect(logs).toContain(customPath);
	});
});
