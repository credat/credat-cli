import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";
import { credatDir } from "../utils.js";

const AGENT = {
	did: "did:web:acme.corp",
	algorithm: "ES256",
	domain: "acme.corp",
	keyPair: { algorithm: "ES256", publicKey: "AQID", privateKey: "BAUG" },
	didDocument: { id: "did:web:acme.corp" },
};

const OWNER = {
	did: "did:web:owner.local",
	keyPair: { algorithm: "ES256", publicKey: "AQID", privateKey: "BAUG" },
};

const DELEGATION = {
	token: "test-token",
	claims: {
		agent: "did:web:acme.corp",
		owner: "did:web:owner.local",
		scopes: ["payments:read", "invoices:create"],
	},
};

function writeFixture(name: string, data: unknown): void {
	const dir = credatDir();
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), JSON.stringify(data));
}

describe("whoami command — pretty output", () => {
	useTestDir("whoami-test");

	it("shows error when no agent exists", async () => {
		const { whoamiCommand } = await import("./whoami.js");
		whoamiCommand();

		const logs = collectLogs();
		expect(logs).toContain("No agent identity");
		expect(logs).toContain("credat init");
	});

	it("shows agent DID with algorithm and domain", async () => {
		writeFixture("agent.json", AGENT);

		const { whoamiCommand } = await import("./whoami.js");
		whoamiCommand();

		const logs = collectLogs();
		expect(logs).toContain("did:web:acme.corp");
		expect(logs).toContain("ES256");
		expect(logs).toContain("acme.corp");
	});

	it("shows owner when delegated", async () => {
		writeFixture("agent.json", AGENT);
		writeFixture("owner.json", OWNER);

		const { whoamiCommand } = await import("./whoami.js");
		whoamiCommand();

		const logs = collectLogs();
		expect(logs).toContain("did:web:acme.corp");
		expect(logs).toContain("did:web:owner.local");
		expect(logs).toContain("delegated by");
	});

	it("shows scopes when delegation exists", async () => {
		writeFixture("agent.json", AGENT);
		writeFixture("owner.json", OWNER);
		writeFixture("delegation.json", DELEGATION);

		const { whoamiCommand } = await import("./whoami.js");
		whoamiCommand();

		const logs = collectLogs();
		expect(logs).toContain("payments:read");
		expect(logs).toContain("invoices:create");
	});
});

describe("whoami command — JSON output", () => {
	useTestDir("whoami-json-test");

	it("outputs null agent when no identity exists", async () => {
		const { whoamiCommand } = await import("./whoami.js");
		whoamiCommand({ json: true });

		const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(output);
		expect(parsed).toEqual({ agent: null, owner: null, delegation: false });
	});

	it("outputs full identity as JSON", async () => {
		writeFixture("agent.json", AGENT);
		writeFixture("owner.json", OWNER);
		writeFixture("delegation.json", DELEGATION);

		const { whoamiCommand } = await import("./whoami.js");
		whoamiCommand({ json: true });

		const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(output);

		expect(parsed.agent).toEqual({
			did: "did:web:acme.corp",
			algorithm: "ES256",
			domain: "acme.corp",
		});
		expect(parsed.owner).toEqual({ did: "did:web:owner.local" });
		expect(parsed.delegation).toBe(true);
		expect(parsed.scopes).toEqual(["payments:read", "invoices:create"]);
	});

	it("outputs agent-only JSON when no delegation", async () => {
		writeFixture("agent.json", AGENT);

		const { whoamiCommand } = await import("./whoami.js");
		whoamiCommand({ json: true });

		const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(output);

		expect(parsed.agent.did).toBe("did:web:acme.corp");
		expect(parsed.owner).toBeNull();
		expect(parsed.delegation).toBe(false);
		expect(parsed.scopes).toBeNull();
	});
});
