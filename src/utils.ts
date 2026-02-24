import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { uint8ArrayToBase64url, base64urlToUint8Array } from "credat";
import pc from "picocolors";

const CREDAT_DIR = ".credat";

export function credatDir(): string {
	return join(process.cwd(), CREDAT_DIR);
}

function ensureDir(): void {
	const dir = credatDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

// ── Serialization helpers for Uint8Array <-> base64url ──

interface SerializedKeyPair {
	algorithm: string;
	publicKey: string;
	privateKey: string;
}

function serializeKeyPair(kp: {
	algorithm: string;
	publicKey: Uint8Array;
	privateKey: Uint8Array;
}): SerializedKeyPair {
	return {
		algorithm: kp.algorithm,
		publicKey: uint8ArrayToBase64url(kp.publicKey),
		privateKey: uint8ArrayToBase64url(kp.privateKey),
	};
}

function deserializeKeyPair(kp: SerializedKeyPair): {
	algorithm: string;
	publicKey: Uint8Array;
	privateKey: Uint8Array;
} {
	return {
		algorithm: kp.algorithm,
		publicKey: base64urlToUint8Array(kp.publicKey),
		privateKey: base64urlToUint8Array(kp.privateKey),
	};
}

// ── Agent file I/O ──

export interface SerializedAgent {
	did: string;
	algorithm: string;
	domain: string;
	path?: string;
	keyPair: SerializedKeyPair;
	didDocument: unknown;
}

export function saveAgent(agent: {
	did: string;
	algorithm: string;
	domain: string;
	path?: string;
	keyPair: { algorithm: string; publicKey: Uint8Array; privateKey: Uint8Array };
	didDocument: unknown;
}): void {
	ensureDir();
	const data: SerializedAgent = {
		did: agent.did,
		algorithm: agent.algorithm,
		domain: agent.domain,
		path: agent.path,
		keyPair: serializeKeyPair(agent.keyPair),
		didDocument: agent.didDocument,
	};
	writeFileSync(
		join(credatDir(), "agent.json"),
		JSON.stringify(data, null, "\t"),
	);
}

export function loadAgentFile(): SerializedAgent & {
	keyPair: {
		algorithm: string;
		publicKey: Uint8Array;
		privateKey: Uint8Array;
	};
} {
	const path = join(credatDir(), "agent.json");
	if (!existsSync(path)) {
		throw new Error(
			`No agent found. Run ${pc.bold("credat init")} first.`,
		);
	}
	const raw = JSON.parse(readFileSync(path, "utf-8")) as SerializedAgent;
	return {
		...raw,
		keyPair: deserializeKeyPair(raw.keyPair),
	};
}

// ── Owner file I/O ──

export interface SerializedOwner {
	did: string;
	keyPair: SerializedKeyPair;
}

export function saveOwner(owner: {
	did: string;
	keyPair: { algorithm: string; publicKey: Uint8Array; privateKey: Uint8Array };
}): void {
	ensureDir();
	const data: SerializedOwner = {
		did: owner.did,
		keyPair: serializeKeyPair(owner.keyPair),
	};
	writeFileSync(
		join(credatDir(), "owner.json"),
		JSON.stringify(data, null, "\t"),
	);
}

export function loadOwnerFile(): SerializedOwner & {
	keyPair: {
		algorithm: string;
		publicKey: Uint8Array;
		privateKey: Uint8Array;
	};
} {
	const path = join(credatDir(), "owner.json");
	if (!existsSync(path)) {
		return null as never; // caller handles
	}
	const raw = JSON.parse(readFileSync(path, "utf-8")) as SerializedOwner;
	return {
		...raw,
		keyPair: deserializeKeyPair(raw.keyPair),
	};
}

export function ownerExists(): boolean {
	return existsSync(join(credatDir(), "owner.json"));
}

// ── Delegation file I/O ──

export function saveDelegation(data: {
	raw: string;
	claims: unknown;
}): void {
	ensureDir();
	writeFileSync(
		join(credatDir(), "delegation.json"),
		JSON.stringify(data, null, "\t"),
	);
}

// ── Formatting helpers ──

export function truncate(str: string, len = 60): string {
	if (str.length <= len) return str;
	return `${str.slice(0, len)}...`;
}

export function header(text: string): void {
	console.log();
	console.log(pc.bold(pc.cyan(`  ${text}`)));
	console.log(pc.dim("  " + "─".repeat(text.length + 2)));
}

export function label(key: string, value: string): void {
	console.log(`  ${pc.dim(key + ":")} ${value}`);
}

export function success(text: string): void {
	console.log(`  ${pc.green("✓")} ${text}`);
}

export function fail(text: string): void {
	console.log(`  ${pc.red("✗")} ${text}`);
}

export function step(num: number, text: string): void {
	console.log();
	console.log(
		`  ${pc.bold(pc.yellow(`[${num}]`))} ${pc.bold(text)}`,
	);
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
