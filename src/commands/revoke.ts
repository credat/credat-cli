import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	createStatusList,
	decodeStatusList,
	encodeStatusList,
	isRevoked,
	type StatusListData,
	setRevocationStatus,
} from "@credat/sdk";
import pc from "picocolors";
import {
	credatDir,
	delegationExists,
	fail,
	header,
	label,
	loadDelegationFile,
	loadOwnerFile,
	ownerExists,
	success,
} from "../utils.js";

interface RevokeOptions {
	token?: string;
	statusList?: string;
	index?: string;
	json?: boolean;
}

interface StatusListFile {
	id: string;
	issuer: string;
	url: string;
	size: number;
	encoded: string;
}

const STATUS_LIST_FILE = "status-list.json";

function statusListPath(): string {
	return join(credatDir(), STATUS_LIST_FILE);
}

function extractStatusEntry(
	token: string,
): { idx: number; uri: string } | null {
	try {
		const jwtPart = token.split("~")[0];
		if (!jwtPart) return null;
		const payloadRaw = jwtPart.split(".")[1];
		if (!payloadRaw) return null;
		const payload = JSON.parse(
			Buffer.from(payloadRaw, "base64url").toString("utf-8"),
		) as Record<string, unknown>;
		const status = payload.status as
			| { status_list?: { idx?: number; uri?: string } }
			| undefined;
		if (
			status?.status_list &&
			typeof status.status_list.idx === "number" &&
			typeof status.status_list.uri === "string"
		) {
			return { idx: status.status_list.idx, uri: status.status_list.uri };
		}
		return null;
	} catch {
		return null;
	}
}

function loadStatusList(filePath: string): {
	data: StatusListData;
	file: StatusListFile;
} {
	if (!existsSync(filePath)) {
		throw new Error(
			`No status list found at ${filePath}. Run a delegation with --status-list first or provide --status-list path.`,
		);
	}
	const file = JSON.parse(readFileSync(filePath, "utf-8")) as StatusListFile;
	const bitstring = decodeStatusList(file.encoded);
	return {
		data: {
			bitstring,
			id: file.id,
			issuer: file.issuer,
			size: file.size,
		},
		file,
	};
}

function saveStatusList(
	filePath: string,
	data: StatusListData,
	url: string,
): void {
	const file: StatusListFile = {
		id: data.id,
		issuer: data.issuer,
		url,
		size: data.size,
		encoded: encodeStatusList(data.bitstring),
	};
	writeFileSync(filePath, JSON.stringify(file, null, "\t"));
}

function createDefaultStatusList(): StatusListData {
	if (!ownerExists()) {
		throw new Error(`No owner found. Run ${pc.bold("credat delegate")} first.`);
	}
	const owner = loadOwnerFile();
	return createStatusList({
		id: "default",
		issuer: owner.did,
		url: `${owner.did}/status/1`,
	});
}

function resolveToken(options: RevokeOptions): string {
	if (options.token) return options.token;

	if (delegationExists()) {
		return loadDelegationFile().token;
	}

	throw new Error(
		`No delegation found. Use ${pc.bold("--token <token>")} or run ${pc.bold("credat delegate")} first.`,
	);
}

export function revokeCommand(options: RevokeOptions = {}): void {
	// 1. Resolve the status list index
	let index: number;
	let statusListFilePath: string;

	if (options.index !== undefined) {
		// Explicit --index provided
		const parsed = Number(options.index);
		if (!Number.isInteger(parsed) || parsed < 0) {
			throw new Error("--index must be a non-negative integer");
		}
		index = parsed;
		statusListFilePath = options.statusList ?? statusListPath();
	} else {
		// Extract from token
		const token = resolveToken(options);
		const entry = extractStatusEntry(token);
		if (!entry) {
			throw new Error(
				"Delegation token has no status list entry. " +
					"Re-issue the delegation with a status list, or use --index to specify manually.",
			);
		}
		index = entry.idx;
		statusListFilePath = options.statusList ?? statusListPath();
	}

	// 2. Load or create the status list
	let listData: StatusListData;
	let listUrl: string;
	if (existsSync(statusListFilePath)) {
		const loaded = loadStatusList(statusListFilePath);
		listData = loaded.data;
		listUrl = loaded.file.url;
	} else {
		listData = createDefaultStatusList();
		listUrl = `${listData.issuer}/status/1`;
	}

	// 3. Check if already revoked
	if (isRevoked(listData, index)) {
		if (options.json) {
			console.log(
				JSON.stringify({
					revoked: true,
					index,
					statusList: statusListFilePath,
					alreadyRevoked: true,
				}),
			);
			return;
		}
		header("Revocation");
		fail(
			`Index ${pc.bold(String(index))} is already revoked in the status list`,
		);
		console.log();
		return;
	}

	// 4. Revoke
	setRevocationStatus(listData, index, true);

	// 5. Save
	saveStatusList(statusListFilePath, listData, listUrl);

	// 6. Output
	if (options.json) {
		console.log(
			JSON.stringify({
				revoked: true,
				index,
				statusList: statusListFilePath,
				alreadyRevoked: false,
			}),
		);
		return;
	}

	header("Revocation");
	success(`Delegation at index ${pc.bold(String(index))} revoked`);
	label("Status List", pc.dim(statusListFilePath));
	label("Index", String(index));
	console.log();
}
