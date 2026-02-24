import { createAgent, createDidWeb } from "credat";
import pc from "picocolors";
import { header, label, saveAgent, success } from "../utils.js";

interface InitOptions {
	domain: string;
	path?: string;
	algorithm?: "ES256" | "EdDSA" | "ES256K";
}

export async function initCommand(options: InitOptions): Promise<void> {
	const { domain, path, algorithm = "ES256" } = options;

	const agent = await createAgent({ domain, path, algorithm });

	saveAgent(agent);

	header("Agent Created");
	label("DID", pc.green(agent.did));
	label("Algorithm", algorithm);
	label("Saved to", pc.dim(".credat/agent.json"));

	console.log();
	console.log(
		pc.bold("  Host this DID Document at:"),
	);

	const did = createDidWeb(domain, path);
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
