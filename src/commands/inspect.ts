import { existsSync, readFileSync } from "node:fs";
import pc from "picocolors";
import {
	delegationExists,
	header,
	label,
	loadDelegationFile,
	truncate,
} from "../utils.js";

interface InspectOptions {
	file?: string;
	json?: boolean;
}

interface DecodedDisclosure {
	salt: string;
	name: string;
	value: unknown;
}

interface InspectedToken {
	header: Record<string, unknown>;
	payload: Record<string, unknown>;
	disclosures: DecodedDisclosure[];
	expirationStatus: "valid" | "expired" | "not-yet-valid" | "no-expiry";
}

function decodeBase64url(str: string): string {
	return Buffer.from(str, "base64url").toString("utf-8");
}

function decodeJwtPart(part: string): Record<string, unknown> {
	return JSON.parse(decodeBase64url(part)) as Record<string, unknown>;
}

function decodeDisclosure(encoded: string): DecodedDisclosure | null {
	try {
		const decoded = JSON.parse(decodeBase64url(encoded)) as unknown[];
		if (!Array.isArray(decoded) || decoded.length < 3) return null;
		return {
			salt: String(decoded[0]),
			name: String(decoded[1]),
			value: decoded[2],
		};
	} catch {
		return null;
	}
}

function getExpirationStatus(
	payload: Record<string, unknown>,
): InspectedToken["expirationStatus"] {
	const now = Math.floor(Date.now() / 1000);

	const nbf = payload.nbf as number | undefined;
	if (typeof nbf === "number" && now < nbf) return "not-yet-valid";

	const exp = payload.exp as number | undefined;
	if (typeof exp === "number" && now >= exp) return "expired";

	if (typeof exp === "number") return "valid";

	// Also check validUntil (ISO string in payload)
	const validUntil = payload.validUntil as string | undefined;
	if (typeof validUntil === "string") {
		return new Date(validUntil) < new Date() ? "expired" : "valid";
	}

	return "no-expiry";
}

function parseToken(raw: string): InspectedToken {
	const parts = raw.split("~");
	const jwtPart = parts[0];
	if (!jwtPart) {
		throw new Error("Token is empty");
	}

	const jwtSegments = jwtPart.split(".");
	const hdrRaw = jwtSegments[0];
	const payloadRaw = jwtSegments[1];
	if (!hdrRaw || !payloadRaw) {
		throw new Error(
			"Malformed token: expected at least header.payload segments",
		);
	}

	const hdr = decodeJwtPart(hdrRaw);
	const payload = decodeJwtPart(payloadRaw);

	const disclosures: DecodedDisclosure[] = [];
	for (let i = 1; i < parts.length; i++) {
		const segment = parts[i];
		if (!segment) continue;
		const d = decodeDisclosure(segment);
		if (d) disclosures.push(d);
	}

	return {
		header: hdr,
		payload,
		disclosures,
		expirationStatus: getExpirationStatus(payload),
	};
}

function resolveToken(
	token: string | undefined,
	options: InspectOptions,
): string {
	// 1. --file flag
	if (options.file) {
		if (!existsSync(options.file)) {
			throw new Error(`File not found: ${options.file}`);
		}
		const content = readFileSync(options.file, "utf-8").trim();
		// If the file is JSON (delegation.json format), extract the token
		if (content.startsWith("{")) {
			const data = JSON.parse(content) as { token?: string };
			if (!data.token) {
				throw new Error("File is JSON but has no 'token' field");
			}
			return data.token;
		}
		return content;
	}

	// 2. Direct token argument
	if (token) return token;

	// 3. Fall back to .credat/delegation.json
	if (delegationExists()) {
		return loadDelegationFile().token;
	}

	throw new Error(
		"No token provided. Usage: credat inspect <token>, --file <path>, or run credat delegate first",
	);
}

function formatTimestamp(ts: unknown): string {
	if (typeof ts === "number") {
		return new Date(ts * 1000).toISOString();
	}
	if (typeof ts === "string") return ts;
	return String(ts);
}

function statusBadge(status: InspectedToken["expirationStatus"]): string {
	switch (status) {
		case "valid":
			return pc.green("valid");
		case "expired":
			return pc.red("expired");
		case "not-yet-valid":
			return pc.yellow("not yet valid");
		case "no-expiry":
			return pc.dim("no expiry set");
	}
}

function printPretty(result: InspectedToken): void {
	const { header: hdr, payload, disclosures, expirationStatus } = result;

	// ── Header ──
	header("Header");
	if (hdr.alg) label("Algorithm", String(hdr.alg));
	if (hdr.typ) label("Type", String(hdr.typ));
	if (hdr.kid) label("Key ID", String(hdr.kid));

	// ── Payload ──
	header("Payload");
	if (payload.iss) label("Issuer", pc.cyan(String(payload.iss)));
	if (payload.sub) label("Subject", pc.green(String(payload.sub)));
	if (payload.vct) label("Credential Type", String(payload.vct));
	if (payload.agent) label("Agent", pc.green(String(payload.agent)));
	if (payload.owner) label("Owner", pc.cyan(String(payload.owner)));

	if (payload.iat) label("Issued At", formatTimestamp(payload.iat));
	if (payload.exp) label("Expires", formatTimestamp(payload.exp));
	if (payload.nbf) label("Not Before", formatTimestamp(payload.nbf));
	if (payload.validUntil) label("Valid Until", String(payload.validUntil));
	if (payload.validFrom) label("Valid From", String(payload.validFrom));

	// Show remaining payload fields (skip internals and already-displayed)
	const displayed = new Set([
		"iss",
		"sub",
		"vct",
		"agent",
		"owner",
		"iat",
		"exp",
		"nbf",
		"validUntil",
		"validFrom",
		"_sd",
		"_sd_alg",
	]);
	for (const [key, val] of Object.entries(payload)) {
		if (displayed.has(key)) continue;
		label(key, pc.dim(truncate(JSON.stringify(val), 80)));
	}

	// ── Disclosures ──
	if (disclosures.length > 0) {
		header("Selective Disclosures");
		for (const d of disclosures) {
			const formatted =
				typeof d.value === "object" ? JSON.stringify(d.value) : String(d.value);
			label(d.name, pc.yellow(truncate(formatted, 80)));
		}
	}

	// ── SD Algorithm ──
	if (payload._sd_alg) {
		console.log();
		label("SD Hash Algorithm", String(payload._sd_alg));
		label(
			"SD Digests",
			Array.isArray(payload._sd) ? String(payload._sd.length) : "0",
		);
	}

	// ── Expiration Status ──
	console.log();
	label("Status", statusBadge(expirationStatus));
	console.log();
}

export function inspectCommand(
	token: string | undefined,
	options: InspectOptions = {},
): void {
	const raw = resolveToken(token, options);
	const result = parseToken(raw);

	if (options.json) {
		console.log(
			JSON.stringify({
				header: result.header,
				payload: result.payload,
				disclosures: result.disclosures,
				expirationStatus: result.expirationStatus,
			}),
		);
		return;
	}

	printPretty(result);
}
