import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	type Algorithm,
	base64urlToUint8Array,
	type KeyPair,
	uint8ArrayToBase64url,
} from "credat";
import pc from "picocolors";

const CREDAT_DIR = ".credat";

export function credatDir(): string {
	return join(process.cwd(), CREDAT_DIR);
}

function ensureDir(): void {
	const dir = credatDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
}

// ── Serialization helpers for Uint8Array <-> base64url ──

interface SerializedKeyPair {
	algorithm: string;
	publicKey: string;
	privateKey: string;
}

export function serializeKeyPair(kp: KeyPair): SerializedKeyPair {
	return {
		algorithm: kp.algorithm,
		publicKey: uint8ArrayToBase64url(kp.publicKey),
		privateKey: uint8ArrayToBase64url(kp.privateKey),
	};
}

export function deserializeKeyPair(kp: SerializedKeyPair): KeyPair {
	return {
		algorithm: kp.algorithm as Algorithm,
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
	domain: string;
	path?: string;
	keyPair: KeyPair;
	didDocument: unknown;
}): void {
	ensureDir();
	const data: SerializedAgent = {
		did: agent.did,
		algorithm: agent.keyPair.algorithm,
		domain: agent.domain,
		path: agent.path,
		keyPair: serializeKeyPair(agent.keyPair),
		didDocument: agent.didDocument,
	};
	const filePath = join(credatDir(), "agent.json");
	writeFileSync(filePath, JSON.stringify(data, null, "\t"));
	chmodSync(filePath, 0o600);
}

export function loadAgentFile(): Omit<SerializedAgent, "keyPair"> & {
	keyPair: KeyPair;
} {
	const path = join(credatDir(), "agent.json");
	if (!existsSync(path)) {
		throw new Error(`No agent found. Run ${pc.bold("credat init")} first.`);
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

export function saveOwner(owner: { did: string; keyPair: KeyPair }): void {
	ensureDir();
	const data: SerializedOwner = {
		did: owner.did,
		keyPair: serializeKeyPair(owner.keyPair),
	};
	const filePath = join(credatDir(), "owner.json");
	writeFileSync(filePath, JSON.stringify(data, null, "\t"));
	chmodSync(filePath, 0o600);
}

export function loadOwnerFile(): Omit<SerializedOwner, "keyPair"> & {
	keyPair: KeyPair;
} {
	const path = join(credatDir(), "owner.json");
	if (!existsSync(path)) {
		throw new Error(`No owner found. Run ${pc.bold("credat delegate")} first.`);
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

export function saveDelegation(data: { token: string; claims: unknown }): void {
	ensureDir();
	const filePath = join(credatDir(), "delegation.json");
	writeFileSync(filePath, JSON.stringify(data, null, "\t"));
	chmodSync(filePath, 0o600);
}

// ── Formatting helpers ──

export function truncate(str: string, len = 60): string {
	if (str.length <= len) return str;
	return `${str.slice(0, len)}...`;
}

export function header(text: string): void {
	console.log();
	console.log(pc.bold(pc.cyan(`  ${text}`)));
	console.log(pc.dim(`  ${"─".repeat(text.length + 2)}`));
}

export function label(key: string, value: string): void {
	console.log(`  ${pc.dim(`${key}:`)} ${value}`);
}

export function success(text: string): void {
	console.log(`  ${pc.green("✓")} ${text}`);
}

export function fail(text: string): void {
	console.log(`  ${pc.red("✗")} ${text}`);
}

export function step(num: number, text: string): void {
	console.log();
	console.log(`  ${pc.bold(pc.yellow(`[${num}]`))} ${pc.bold(text)}`);
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
