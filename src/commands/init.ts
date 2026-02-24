import { existsSync } from "node:fs";
import { join } from "node:path";
import { createAgent } from "credat";
import pc from "picocolors";
import { credatDir, header, label, saveAgent, success } from "../utils.js";

interface InitOptions {
	domain: string;
	path?: string;
	algorithm?: "ES256" | "EdDSA";
	force?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
	const { domain, path, algorithm = "ES256", force } = options;

	const agentPath = join(credatDir(), "agent.json");
	if (existsSync(agentPath) && !force) {
		console.error(
			pc.red("  Agent identity already exists at .credat/agent.json"),
		);
		console.error(pc.dim(`  Use ${pc.bold("--force")} to overwrite.`));
		process.exit(1);
	}

	const agent = await createAgent({ domain, path, algorithm });

	saveAgent(agent);

	header("Agent Created");
	label("DID", pc.green(agent.did));
	label("Algorithm", algorithm);
	label("Saved to", pc.dim(".credat/agent.json"));

	console.log();
	console.log(pc.bold("  Host this DID Document at:"));

	const url = path
		? `https://${domain}/${path}/did.json`
		: `https://${domain}/.well-known/did.json`;

	console.log(`  ${pc.cyan(url)}`);
	console.log();
	console.log(pc.dim("  Document contents:"));
	console.log(
		pc.dim(
			JSON.stringify(agent.didDocument, null, 2)
				.split("\n")
				.map((line) => `  ${line}`)
				.join("\n"),
		),
	);
	console.log();
	success("Agent identity ready");
}
