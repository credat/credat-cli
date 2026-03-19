import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	type Algorithm,
	type JsonWebKey,
	jwkToPublicKey,
	publicKeyToJwk,
} from "credat";
import pc from "picocolors";
import {
	credatDir,
	header,
	label,
	loadAgentFile,
	loadOwnerFile,
	ownerExists,
	serializeKeyPair,
	success,
	writeSecureFile,
} from "../utils.js";

interface ExportOptions {
	as: "agent" | "owner";
	json?: boolean;
}

interface ImportOptions {
	as: "agent" | "owner";
	json?: boolean;
}

interface ListOptions {
	json?: boolean;
}

interface JwkKeyPair {
	algorithm: string;
	publicKey: JsonWebKey;
	privateKey: JsonWebKey & { d?: string };
}

export function keysExportCommand(options: ExportOptions): void {
	const identity = options.as === "agent" ? loadAgentFile() : loadOwnerFile();

	const pubJwk = publicKeyToJwk(
		identity.keyPair.publicKey,
		identity.keyPair.algorithm,
	);

	// For private key export, we serialize as base64url (JWK private export
	// requires curve-specific handling — we use a wrapped format)
	const exported: JwkKeyPair = {
		algorithm: identity.keyPair.algorithm,
		publicKey: pubJwk,
		privateKey: {
			...pubJwk,
			d: Buffer.from(identity.keyPair.privateKey).toString("base64url"),
		},
	};

	if (options.json) {
		console.log(
			JSON.stringify({ type: options.as, did: identity.did, keys: exported }),
		);
		return;
	}

	console.log(
		pc.yellow("\n  ⚠ WARNING: This output contains PRIVATE KEY material."),
	);
	console.log(pc.yellow("  Store it securely and never share it.\n"));
	console.log(JSON.stringify(exported, null, 2));
}

export function keysImportCommand(
	jwkData: string,
	options: ImportOptions,
): void {
	let parsed: JwkKeyPair;
	try {
		parsed = JSON.parse(jwkData) as JwkKeyPair;
	} catch {
		throw new Error("Invalid JWK: could not parse JSON");
	}

	if (!parsed.algorithm || !parsed.publicKey || !parsed.privateKey) {
		throw new Error(
			"Invalid JWK: missing required fields (algorithm, publicKey, privateKey)",
		);
	}

	const algorithm = parsed.algorithm as Algorithm;
	if (algorithm !== "ES256" && algorithm !== "EdDSA") {
		throw new Error(`Unsupported algorithm: ${parsed.algorithm}`);
	}

	const publicKey = jwkToPublicKey(parsed.publicKey);
	const dField = (parsed.privateKey as { d?: string }).d;
	if (!dField) {
		throw new Error("Invalid JWK: private key missing 'd' field");
	}
	const privateKey = new Uint8Array(Buffer.from(dField, "base64url"));

	const serialized = serializeKeyPair({ algorithm, publicKey, privateKey });
	const dir = credatDir();

	if (options.as === "agent") {
		const agentPath = join(dir, "agent.json");
		if (existsSync(agentPath)) {
			const existing = loadAgentFile();
			const data = {
				...existing,
				keyPair: serialized,
				algorithm,
			};
			writeSecureFile(agentPath, JSON.stringify(data, null, "\t"));
		} else {
			throw new Error(
				`No agent file found. Run ${pc.bold("credat init")} first, then import keys.`,
			);
		}
	} else {
		const ownerPath = join(dir, "owner.json");
		if (existsSync(ownerPath)) {
			const existing = loadOwnerFile();
			const data = {
				did: existing.did,
				keyPair: serialized,
			};
			writeSecureFile(ownerPath, JSON.stringify(data, null, "\t"));
		} else {
			throw new Error(
				`No owner file found. Run ${pc.bold("credat delegate")} first, then import keys.`,
			);
		}
	}

	if (options.json) {
		console.log(JSON.stringify({ imported: true, as: options.as, algorithm }));
		return;
	}

	success(`${options.as} keys imported`);
	label("Algorithm", algorithm);
	console.log();
}

export function keysListCommand(options: ListOptions): void {
	const agentPath = join(credatDir(), "agent.json");
	const hasAgent = existsSync(agentPath);
	const hasOwner = ownerExists();

	interface KeyInfo {
		type: string;
		did: string;
		algorithm: string;
		publicKeyFingerprint: string;
	}

	const keys: KeyInfo[] = [];

	if (hasAgent) {
		const agent = loadAgentFile();
		const jwk = publicKeyToJwk(
			agent.keyPair.publicKey,
			agent.keyPair.algorithm,
		);
		const fingerprint = Buffer.from(JSON.stringify(jwk))
			.toString("base64url")
			.slice(0, 16);
		keys.push({
			type: "agent",
			did: agent.did,
			algorithm: agent.keyPair.algorithm,
			publicKeyFingerprint: fingerprint,
		});
	}

	if (hasOwner) {
		const owner = loadOwnerFile();
		const jwk = publicKeyToJwk(
			owner.keyPair.publicKey,
			owner.keyPair.algorithm,
		);
		const fingerprint = Buffer.from(JSON.stringify(jwk))
			.toString("base64url")
			.slice(0, 16);
		keys.push({
			type: "owner",
			did: owner.did,
			algorithm: owner.keyPair.algorithm,
			publicKeyFingerprint: fingerprint,
		});
	}

	if (options.json) {
		console.log(JSON.stringify({ keys }));
		return;
	}

	if (keys.length === 0) {
		console.log(
			pc.dim(
				`  No keys found. Run ${pc.bold("credat init")} to create an agent.`,
			),
		);
		return;
	}

	header("Keys");
	for (const k of keys) {
		label("Type", k.type === "agent" ? pc.green(k.type) : pc.cyan(k.type));
		label("DID", k.did);
		label("Algorithm", k.algorithm);
		label("Fingerprint", pc.dim(k.publicKeyFingerprint));
		console.log();
	}
}
