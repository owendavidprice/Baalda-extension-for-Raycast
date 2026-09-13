import { getPreferenceValues } from "@raycast/api";

/**
 * Thin client for Baalda's MCP endpoint (Streamable HTTP, single JSON reply).
 *
 * Baalda exposes a Model Context Protocol endpoint at `<server>/api/mcp`,
 * authenticated with a token minted in the desktop app (Vault Settings → MCP).
 * The protocol is JSON-RPC 2.0: initialize once (stateless — the server keeps
 * no session), then call tools via `tools/call`.
 *
 * Verified against the live managed service (api.baalda.com). Payload shapes:
 *  - list tools (list_vaults / list_folders / list_notes / search_notes) wrap
 *    their array in `{ results: [...] }` in structuredContent.
 *  - read_note / create_note return a flat object.
 *  - notes carry `relPath` (not `path`); folders carry `path` and `name`.
 */

export interface Preferences {
  serverUrl: string;
  mcpToken: string;
  defaultVaultId?: string;
  captureFolder?: string;
}

export function prefs(): Preferences {
  return getPreferenceValues<Preferences>();
}

export class BaaldaError extends Error {}

/* ── Types mirroring the server's MCP tool payloads ─────────────────────── */

export interface Vault {
  vaultId: string;
  name: string;
  role?: string;
}

export interface Folder {
  folderId: string;
  parentId?: string | null;
  name: string;
  path: string;
}

export interface NoteSummary {
  docId: string;
  folderId?: string | null;
  title: string;
  relPath: string;
  permission?: string;
  updatedAt?: string;
}

export interface NoteContent {
  docId: string;
  vaultId?: string;
  folderId?: string | null;
  title?: string;
  relPath?: string;
  permission?: string;
  content: string;
  revision?: string;
}

export interface SearchResult {
  docId: string;
  title?: string;
  relPath?: string;
  score?: number;
}

export interface CreateNoteResult {
  docId: string;
  vaultId?: string;
  title?: string;
  relPath?: string;
}

/* ── JSON-RPC plumbing ──────────────────────────────────────────────────── */

let rpcId = 0;
let initialized = false;

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

async function rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
  const { serverUrl, mcpToken } = prefs();
  if (!serverUrl || !mcpToken) {
    throw new BaaldaError(
      "Set your Baalda Server URL and MCP Token in the extension preferences (get a token in Baalda → Vault Settings → MCP).",
    );
  }

  const base = serverUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${mcpToken.trim()}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    });
  } catch {
    throw new BaaldaError(
      `Couldn't reach the Baalda server at ${base}. Check the Server URL in extension preferences.`,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new BaaldaError(
      "Baalda rejected the MCP token (401). Check the token in extension preferences, or mint a new one in Baalda → Vault Settings → MCP.",
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new BaaldaError(`Baalda server error ${res.status} at ${base}/api/mcp. ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as JsonRpcResponse;
  if (body.error) {
    throw new BaaldaError(`MCP error ${body.error.code}: ${body.error.message}`);
  }
  return body.result;
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "raycast-baalda", version: "1.0.0" },
  });
  initialized = true;
}

interface ToolResult {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Call an MCP tool and unwrap its payload.
 * Preference order: structuredContent → parsed text content.
 * List tools wrap their array in `{ results: [...] }`, which we unwrap.
 */
async function callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  await ensureInitialized();
  const result = (await rpc("tools/call", { name, arguments: args })) as ToolResult;

  if (result?.isError) {
    const msg =
      result?.content
        ?.map((c) => c.text ?? "")
        .join("\n")
        .trim() || "Unknown tool error";
    throw new BaaldaError(msg);
  }

  let payload: unknown = result?.structuredContent;
  if (payload === undefined) {
    const text = result?.content?.find((c) => c.type === "text")?.text;
    if (typeof text === "string") {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
  }
  if (payload === undefined) payload = result;

  // Unwrap the `{ results: [...] }` envelope used by the list tools.
  if (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Array.isArray((payload as { results?: unknown }).results)
  ) {
    return (payload as { results: unknown }).results as T;
  }
  return payload as T;
}

/* ── Typed wrappers over Baalda's tool catalog ──────────────────────────── */

export const listVaults = () => callTool<Vault[]>("list_vaults", {});

export const listFolders = (vaultId: string) => callTool<Folder[]>("list_folders", { vaultId });

export const listNotes = (vaultId: string, folderId?: string) =>
  callTool<NoteSummary[]>("list_notes", folderId ? { vaultId, folderId } : { vaultId });

export const readNote = (docId: string) => callTool<NoteContent>("read_note", { docId });

export const searchNotes = (vaultId: string, query: string, k = 10) =>
  callTool<SearchResult[]>("search_notes", { vaultId, query, k });

export interface CreateNoteInput {
  vaultId: string;
  relPath: string;
  title?: string;
  content?: string;
}

export const createNote = (input: CreateNoteInput) => callTool<CreateNoteResult>("create_note", { ...input });

export const appendNote = (docId: string, text: string, idempotencyKey?: string) =>
  callTool<{ docId: string; appended: number; duplicate: boolean; revision: string }>(
    "append_note",
    idempotencyKey ? { docId, text, idempotencyKey } : { docId, text },
  );

/** Resolve the vault to act on: the preference override, else the first accessible vault. */
export async function resolveVaultId(preferred?: string): Promise<Vault> {
  const vaults = await listVaults();
  if (!Array.isArray(vaults) || vaults.length === 0) {
    throw new BaaldaError("No Baalda vaults are accessible with this MCP token.");
  }
  const wanted = (preferred ?? prefs().defaultVaultId)?.trim();
  if (wanted) {
    const match = vaults.find((v) => v.vaultId === wanted || v.name.toLowerCase() === wanted.toLowerCase());
    if (match) return match;
    throw new BaaldaError(`Default vault "${wanted}" not found. Accessible: ${vaults.map((v) => v.name).join(", ")}`);
  }
  return vaults[0];
}

/** Slugify a title into a safe filename base. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "note";
}

/** Build the vault-relative path for a quick-capture note, honouring the captureFolder preference. */
export function capturePath(title: string, date = new Date()): { relPath: string; folder: string } {
  const folder = (prefs().captureFolder ?? "").trim().replace(/^\/+|\/+$/g, "");
  const stamp = date.toISOString().slice(0, 10);
  const relPath = `${folder ? `${folder}/` : ""}${stamp}-${slugify(title)}.md`;
  return { relPath, folder };
}
