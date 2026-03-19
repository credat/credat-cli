import pc from "picocolors";
import { delegationExists, header, loadDelegationFile } from "../utils.js";

interface AuditOptions {
	json?: boolean;
}

interface AuditFinding {
	level: "pass" | "warn" | "fail";
	rule: string;
	message: string;
}

interface DecodedPayload {
	iss?: string;
	sub?: string;
	exp?: number;
	nbf?: number;
	iat?: number;
	agent?: string;
	owner?: string;
	status?: { status_list?: { idx?: number; uri?: string } };
	validUntil?: string;
	validFrom?: string;
	[key: string]: unknown;
}

interface DecodedDisclosure {
	name: string;
	value: unknown;
}

function decodeToken(token: string): {
	payload: DecodedPayload;
	disclosures: DecodedDisclosure[];
} {
	const parts = token.split("~");
	const jwtPart = parts[0];
	if (!jwtPart) throw new Error("Token is empty");

	const payloadRaw = jwtPart.split(".")[1];
	if (!payloadRaw) throw new Error("Malformed token: no payload segment");

	let payload: DecodedPayload;
	try {
		payload = JSON.parse(
			Buffer.from(payloadRaw, "base64url").toString("utf-8"),
		) as DecodedPayload;
	} catch {
		throw new Error("Malformed token: invalid payload encoding or JSON");
	}

	const disclosures: DecodedDisclosure[] = [];
	for (let i = 1; i < parts.length; i++) {
		const seg = parts[i];
		if (!seg) continue;
		try {
			const decoded = JSON.parse(
				Buffer.from(seg, "base64url").toString("utf-8"),
			) as unknown[];
			if (Array.isArray(decoded) && decoded.length >= 3) {
				disclosures.push({ name: String(decoded[1]), value: decoded[2] });
			}
		} catch {
			// skip malformed disclosures
		}
	}

	return { payload, disclosures };
}

function findDisclosure(
	disclosures: DecodedDisclosure[],
	name: string,
): unknown | undefined {
	return disclosures.find((d) => d.name === name)?.value;
}

function auditToken(token: string): AuditFinding[] {
	const findings: AuditFinding[] = [];
	const { payload, disclosures } = decodeToken(token);

	// 1. Expiration check
	const now = Math.floor(Date.now() / 1000);
	if (payload.exp) {
		if (now >= payload.exp) {
			findings.push({
				level: "fail",
				rule: "expiration",
				message: `Token expired on ${new Date(payload.exp * 1000).toISOString()}`,
			});
		} else {
			const daysLeft = Math.floor((payload.exp - now) / 86400);
			if (daysLeft > 365) {
				findings.push({
					level: "warn",
					rule: "expiration",
					message: `Expires in ${daysLeft} days — consider shorter-lived tokens`,
				});
			} else {
				findings.push({
					level: "pass",
					rule: "expiration",
					message: `Expires in ${daysLeft} days`,
				});
			}
		}
	} else if (payload.validUntil) {
		const expiry = new Date(payload.validUntil);
		if (Number.isNaN(expiry.getTime())) {
			findings.push({
				level: "fail",
				rule: "expiration",
				message: `Invalid validUntil format: ${payload.validUntil}`,
			});
		} else if (expiry < new Date()) {
			findings.push({
				level: "fail",
				rule: "expiration",
				message: `Token expired on ${payload.validUntil}`,
			});
		} else {
			const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
			if (daysLeft > 365) {
				findings.push({
					level: "warn",
					rule: "expiration",
					message: `Expires in ${daysLeft} days — consider shorter-lived tokens`,
				});
			} else {
				findings.push({
					level: "pass",
					rule: "expiration",
					message: `Expires in ${daysLeft} days`,
				});
			}
		}
	} else {
		findings.push({
			level: "fail",
			rule: "expiration",
			message: "No expiration set — tokens should always have an expiry",
		});
	}

	// 2. Scope breadth check
	const scopes = findDisclosure(disclosures, "scopes") as string[] | undefined;
	if (scopes && Array.isArray(scopes)) {
		const broad = scopes.filter(
			(s) =>
				typeof s === "string" &&
				(s.endsWith(":*") || s === "*" || s === "admin"),
		);
		if (broad.length > 0) {
			findings.push({
				level: "warn",
				rule: "scopes",
				message: `Broad scopes detected: ${broad.join(", ")} — consider narrowing`,
			});
		} else if (scopes.length > 10) {
			findings.push({
				level: "warn",
				rule: "scopes",
				message: `${scopes.length} scopes — consider grouping into fewer, focused scopes`,
			});
		} else {
			findings.push({
				level: "pass",
				rule: "scopes",
				message: `${scopes.length} scope${scopes.length === 1 ? "" : "s"} defined`,
			});
		}
	} else {
		findings.push({
			level: "warn",
			rule: "scopes",
			message: "No scopes found in disclosures",
		});
	}

	// 3. Constraint check
	const constraints = findDisclosure(disclosures, "constraints") as
		| Record<string, unknown>
		| undefined;
	if (constraints && typeof constraints === "object") {
		if (constraints.maxTransactionValue !== undefined) {
			findings.push({
				level: "pass",
				rule: "constraints.maxValue",
				message: `Max transaction value: ${constraints.maxTransactionValue}`,
			});
		} else {
			findings.push({
				level: "warn",
				rule: "constraints.maxValue",
				message: "No maxTransactionValue constraint set",
			});
		}
	} else {
		findings.push({
			level: "warn",
			rule: "constraints",
			message: "No constraints set — consider adding limits",
		});
	}

	// 4. Revocation endpoint check
	if (payload.status?.status_list?.uri) {
		findings.push({
			level: "pass",
			rule: "revocation",
			message: `Status list configured: ${payload.status.status_list.uri}`,
		});
	} else {
		findings.push({
			level: "fail",
			rule: "revocation",
			message: "No revocation endpoint configured",
		});
	}

	// 5. Not-before check
	if (payload.nbf) {
		if (now < payload.nbf) {
			findings.push({
				level: "warn",
				rule: "notBefore",
				message: `Token not yet valid — activates ${new Date(payload.nbf * 1000).toISOString()}`,
			});
		} else {
			findings.push({
				level: "pass",
				rule: "notBefore",
				message: "Not-before constraint present and active",
			});
		}
	}

	// 6. Issuer/subject presence
	if (!payload.iss) {
		findings.push({
			level: "fail",
			rule: "issuer",
			message: "No issuer (iss) claim found",
		});
	}
	if (!payload.sub && !payload.agent) {
		findings.push({
			level: "fail",
			rule: "subject",
			message: "No subject (sub/agent) claim found",
		});
	}

	return findings;
}

const ICONS: Record<AuditFinding["level"], string> = {
	pass: pc.green("✓"),
	warn: pc.yellow("⚠"),
	fail: pc.red("✗"),
};

export function auditCommand(
	token: string | undefined,
	options: AuditOptions = {},
): void {
	if (!token) {
		if (delegationExists()) {
			token = loadDelegationFile().token;
		} else {
			throw new Error(
				"No token provided. Usage: credat audit <token> or run credat delegate first.",
			);
		}
	}

	const findings = auditToken(token);

	if (options.json) {
		const passes = findings.filter((f) => f.level === "pass").length;
		const warns = findings.filter((f) => f.level === "warn").length;
		const fails = findings.filter((f) => f.level === "fail").length;
		console.log(
			JSON.stringify({
				findings,
				summary: { pass: passes, warn: warns, fail: fails },
			}),
		);
		return;
	}

	header("Security Audit");

	for (const f of findings) {
		console.log(`  ${ICONS[f.level]} ${f.message}`);
	}

	console.log();
	const passes = findings.filter((f) => f.level === "pass").length;
	const warns = findings.filter((f) => f.level === "warn").length;
	const fails = findings.filter((f) => f.level === "fail").length;

	const parts: string[] = [];
	if (passes > 0) parts.push(pc.green(`${passes} passed`));
	if (warns > 0) parts.push(pc.yellow(`${warns} warnings`));
	if (fails > 0) parts.push(pc.red(`${fails} issues`));

	console.log(`  ${parts.join(pc.dim(" · "))}`);
	console.log();
}
