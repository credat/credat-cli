import { createAgent, delegate } from "credat";
import { describe, expect, it } from "vitest";
import { collectLogs, useTestDir } from "../test-utils.js";
import { saveDelegation, saveOwner } from "../utils.js";

/** Build a fake token with given payload and optional disclosures. */
function fakeToken(
	payload: Record<string, unknown>,
	disclosures: unknown[][] = [],
): string {
	const hdr = Buffer.from(
		JSON.stringify({ alg: "ES256", typ: "dc+sd-jwt" }),
	).toString("base64url");
	const pld = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const sig = "fake-sig";
	const jwt = `${hdr}.${pld}.${sig}`;
	if (disclosures.length === 0) return jwt;
	const encoded = disclosures
		.map((d) => Buffer.from(JSON.stringify(d)).toString("base64url"))
		.join("~");
	return `${jwt}~${encoded}~`;
}

describe("audit command — error paths", () => {
	useTestDir("audit-errors");

	it("errors when no token and no delegation.json", async () => {
		const { auditCommand } = await import("./audit.js");
		expect(() => auditCommand(undefined)).toThrow("No token provided");
	});
});

describe("audit command — expiration checks", () => {
	useTestDir("audit-expiry");

	it("flags expired token", async () => {
		const pastExp = Math.floor(Date.now() / 1000) - 86400;
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: pastExp },
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const expFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "expiration",
		);
		expect(expFinding.level).toBe("fail");
		expect(expFinding.message).toContain("expired");
	});

	it("warns on far-future expiry (>365 days)", async () => {
		const farExp = Math.floor(Date.now() / 1000) + 86400 * 500;
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: farExp },
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const expFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "expiration",
		);
		expect(expFinding.level).toBe("warn");
		expect(expFinding.message).toContain("shorter-lived");
	});

	it("passes on reasonable expiry (<365 days)", async () => {
		const okExp = Math.floor(Date.now() / 1000) + 86400 * 30;
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: okExp },
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const expFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "expiration",
		);
		expect(expFinding.level).toBe("pass");
	});

	it("fails when no expiration at all", async () => {
		const token = fakeToken({ iss: "did:web:o", sub: "did:web:a" }, [
			["s", "scopes", ["read"]],
		]);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const expFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "expiration",
		);
		expect(expFinding.level).toBe("fail");
		expect(expFinding.message).toContain("No expiration");
	});

	it("handles validUntil (ISO string) instead of exp", async () => {
		const token = fakeToken(
			{
				iss: "did:web:o",
				sub: "did:web:a",
				validUntil: "2099-12-31T23:59:59Z",
			},
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const expFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "expiration",
		);
		// Far future → warn
		expect(expFinding.level).toBe("warn");
	});
});

describe("audit command — scope checks", () => {
	useTestDir("audit-scopes");

	it("warns on broad wildcard scopes", async () => {
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: Math.floor(Date.now() / 1000) + 86400 },
			[["s", "scopes", ["admin:*", "payments:read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const scopeFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "scopes",
		);
		expect(scopeFinding.level).toBe("warn");
		expect(scopeFinding.message).toContain("admin:*");
	});

	it("passes on narrow, focused scopes", async () => {
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: Math.floor(Date.now() / 1000) + 86400 },
			[["s", "scopes", ["payments:read", "invoices:create"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const scopeFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "scopes",
		);
		expect(scopeFinding.level).toBe("pass");
	});
});

describe("audit command — constraint checks", () => {
	useTestDir("audit-constraints");

	it("passes when maxTransactionValue is set", async () => {
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: Math.floor(Date.now() / 1000) + 86400 },
			[
				["s", "scopes", ["read"]],
				["c", "constraints", { maxTransactionValue: 5000 }],
			],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const cFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "constraints.maxValue",
		);
		expect(cFinding.level).toBe("pass");
	});

	it("warns when no constraints at all", async () => {
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: Math.floor(Date.now() / 1000) + 86400 },
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const cFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "constraints",
		);
		expect(cFinding.level).toBe("warn");
	});
});

describe("audit command — revocation checks", () => {
	useTestDir("audit-revocation");

	it("fails when no revocation endpoint", async () => {
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: Math.floor(Date.now() / 1000) + 86400 },
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const rFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "revocation",
		);
		expect(rFinding.level).toBe("fail");
	});

	it("passes when status list is configured", async () => {
		const token = fakeToken(
			{
				iss: "did:web:o",
				sub: "did:web:a",
				exp: Math.floor(Date.now() / 1000) + 86400,
				status: { status_list: { idx: 0, uri: "https://example.com/status" } },
			},
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		const rFinding = parsed.findings.find(
			(f: { rule: string }) => f.rule === "revocation",
		);
		expect(rFinding.level).toBe("pass");
	});
});

describe("audit command — issuer/subject checks", () => {
	useTestDir("audit-identity");

	it("fails when no issuer", async () => {
		const token = fakeToken(
			{ sub: "did:web:a", exp: Math.floor(Date.now() / 1000) + 86400 },
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(parsed.findings.some((f: { rule: string }) => f.rule === "issuer")).toBe(true);
	});
});

describe("audit command — pretty output", () => {
	useTestDir("audit-pretty");

	it("shows colored output with icons", async () => {
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: Math.floor(Date.now() / 1000) + 86400 },
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token);

		const logs = collectLogs();
		expect(logs).toContain("Security Audit");
		expect(logs).toContain("passed");
	});
});

describe("audit command — fallback to delegation.json", () => {
	useTestDir("audit-fallback");

	it("loads token from delegation.json when no arg", async () => {
		const agent = await createAgent({ domain: "a.local", algorithm: "ES256" });
		const owner = await createAgent({ domain: "o.local", algorithm: "ES256" });
		saveOwner(owner);

		const d = await delegate({
			agent: agent.did,
			owner: owner.did,
			ownerKeyPair: owner.keyPair,
			scopes: ["read"],
		});
		saveDelegation(d);

		const { auditCommand } = await import("./audit.js");
		auditCommand(undefined, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(parsed.findings.length).toBeGreaterThan(0);
		expect(parsed.summary).toBeDefined();
	});
});

describe("audit command — summary counts", () => {
	useTestDir("audit-summary");

	it("JSON summary has correct counts", async () => {
		// Token with: good expiry, narrow scopes, no constraints, no revocation
		const token = fakeToken(
			{ iss: "did:web:o", sub: "did:web:a", exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
			[["s", "scopes", ["read"]]],
		);

		const { auditCommand } = await import("./audit.js");
		auditCommand(token, { json: true });

		const logs = collectLogs();
		const parsed = JSON.parse(logs.split("\n").find((l: string) => l.startsWith("{"))!);
		expect(parsed.summary.pass + parsed.summary.warn + parsed.summary.fail).toBe(
			parsed.findings.length,
		);
	});
});
