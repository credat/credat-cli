# @credat/cli

CLI for **Credat** — agent identity and delegation from the terminal.

Create decentralized identities (DIDs), issue delegation credentials, and verify trust chains — all without writing code.

## Install

```bash
npm install -g @credat/cli
```

Requires Node.js >= 22.

## Quick Start

```bash
# 1. Create an agent identity
credat init --domain acme.corp

# 2. Delegate scopes to the agent
credat delegate --scopes payments:read,invoices:create --until 2026-12-31

# 3. Verify the delegation
credat verify
```

## Commands

### `credat init`

Create an agent identity with `did:web`.

```bash
credat init --domain acme.corp
credat init --domain acme.corp --path agents/assistant
credat init --domain acme.corp --algorithm EdDSA
credat init --domain acme.corp --force  # overwrite existing
```

| Option | Description |
|--------|-------------|
| `-d, --domain <domain>` | Domain for did:web (required) |
| `-p, --path <path>` | Optional sub-path |
| `-a, --algorithm <alg>` | `ES256` (default) or `EdDSA` |
| `-f, --force` | Overwrite existing agent identity |

### `credat delegate`

Issue a delegation credential to an agent.

```bash
credat delegate --scopes payments:read,invoices:create
credat delegate --scopes payments:read --max-value 1000 --until 2026-12-31
credat delegate --agent did:web:other.agent --scopes admin:read
```

| Option | Description |
|--------|-------------|
| `-a, --agent <did>` | Agent DID (defaults to `.credat/agent.json`) |
| `-s, --scopes <scopes>` | Comma-separated scopes (required) |
| `-m, --max-value <n>` | Maximum transaction value constraint |
| `-u, --until <date>` | Expiration date (ISO 8601) |

### `credat verify [token]`

Verify a delegation token. If no token is given, reads from `.credat/delegation.json`.

```bash
credat verify
credat verify eyJhbGciOiJFUzI1NiIs...
```

### `credat status`

Show the current `.credat/` state: agent, owner, and delegation info.

```bash
credat status
credat --json status  # structured output
```

### `credat demo`

Run a full interactive trust flow demo — creates identities, delegates, verifies, and completes a challenge-response handshake.

```bash
credat demo
```

## Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output structured JSON (works with `status`, `verify`, `delegate`) |
| `-V, --version` | Show CLI and SDK versions |
| `-h, --help` | Show help |

## How It Works

Credat uses **Verifiable Credentials** and **Decentralized Identifiers** (DIDs) to establish trust between agents and owners — no passwords, no API keys, just cryptographic proof.

1. **Owner** creates an agent identity (`did:web`)
2. **Owner** delegates specific scopes to the agent via a signed credential
3. **Services** verify the delegation and challenge the agent to prove its identity

## Links

- [credat SDK](https://github.com/nicmusic/credat) — core library
- [DID specification](https://www.w3.org/TR/did-core/)
- [Verifiable Credentials](https://www.w3.org/TR/vc-data-model/)

## License

Apache-2.0
