# Baalda for Raycast

Connect [Baalda](https://baalda.com) — your file-based, collaborative second brain — to Raycast.

Capture thoughts in seconds, search your vaults, and let Raycast AI read and write your notes through Baalda's built-in MCP (Model Context Protocol) endpoint.

## Features

### Commands

- **Quick Capture** — type a title (and optional markdown body), hit ↵, and it's a note in your vault. Saves as `YYYY-MM-DD-<slug>.md` in your capture folder. Never fails on a duplicate name — it falls back to a timestamped file.
- **Search Notes** — semantic + keyword search across all your vaults (or one), with a full reader view and one-key append.
- **Browse Vault** — explore vaults, folders and notes; copy a vault ID to set as your default.

### AI tools (Raycast AI)

Ask Raycast AI things like *"what did I note about the Q4 budget?"* or *"add this to my ideas note"* — the extension exposes Baalda tools the AI can call:

| Tool | What it does |
| --- | --- |
| `baalda-list-vaults` | List accessible vaults (gives vaultIds for the others) |
| `baalda-search-notes` | Semantic + keyword search, ranked docIds |
| `baalda-read-note` | Full markdown of a note, with its revision |
| `baalda-list-notes` | List notes in a vault/folder |
| `baalda-create-note` | Create a note at a vault-relative path |
| `baalda-append-to-note` | Append markdown to an existing note |

Writes (`create-note`, `append-to-note`) ask for confirmation before running.

## Setup

1. **Get an MCP token.** In the Baalda desktop app: **Vault Settings → MCP → Create token**. It starts with `mcp_`. The token is bound by the exact same folder permissions as your account.
2. **Configure the extension** (Raycast asks on first run, or: Extensions → Baalda → ⚙):
   - **Baalda Server URL** — `https://api.baalda.com` for the managed service, `http://localhost:3010` for a local server, or your self-hosted URL.
   - **MCP Token** — the token from step 1.
   - **Default Vault ID** *(optional)* — copy it from the Browse Vault command to skip vault selection everywhere.
   - **Capture Folder** *(optional)* — e.g. `Inbox`; Quick Capture notes go here. The folder must already exist in the vault.

That's it. Because it talks to Baalda's MCP endpoint, it works against the managed service, a self-hosted server, or a local dev server — your choice.

## How it works

Baalda exposes a Streamable-HTTP MCP endpoint at `<server>/api/mcp`, authenticated with a Bearer token. This extension is a minimal JSON-RPC client for it: `initialize` once, then `tools/call`. Every read and write flows through Baalda's sync engine — create a note here and it appears in the desktop app (and on your teammates' machines) live. Writes are conflict-guarded by Baalda's revision tokens.

- Baalda repo: https://github.com/naveedharri/baalda
- Extension repo: https://github.com/owendavidprice/Baalda-extension-for-Raycast

## Development

```bash
npm install
npm run dev      # ray develop — loads the extension into Raycast
npm run build    # ray build
npm run lint     # ray lint
```

## License

MIT
