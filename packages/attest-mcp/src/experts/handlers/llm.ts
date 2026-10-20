/**
 * experts/handlers/llm.ts — the LLM backend adapter used by in-process
 * handlers.
 *
 * The three Shape-C reference handlers (secrets-scanner, dependency-
 * auditor, semgrep-runner) each do real work (filesystem scan, OSV
 * vulnerability lookup, semgrep static analysis) and then ask an LLM to
 * synthesise findings into `ExpertOutput`. The LLM call is pluggable:
 *
 *   - `ATTEST_LLM_BACKEND=mock` (default) — synchronous mock that echoes
 *      the task shape; used in tests and when the connected MCP client
 *      doesn't support sampling.
 *   - `ATTEST_LLM_BACKEND=mcp-sampling` — route to the connected client
 *      via MCP sampling (CreateMessage request). Requires the client to
 *      advertise sampling capability; falls back to mock on refusal.
 *
 * The sampling adapter is deliberately injected at server construction
 * rather than imported statically — the policy engine and handler
 * framework stay runnable in isolation without an MCP server attached.
 */

export interface LlmBackend {
  readonly id: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export interface LlmRequest {
  readonly system: string;
  readonly user: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface LlmResponse {
  readonly text: string;
  readonly backend: string;
  readonly transcript: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

const MOCK_BACKEND: LlmBackend = {
  id: "mock",
  async complete(request): Promise<LlmResponse> {
    const assistant = `[mock-llm] received prompt (${request.user.length} chars). ` +
      `No live LLM configured — set ATTEST_LLM_BACKEND=mcp-sampling to route via the connected client.`;
    return {
      text: assistant,
      backend: "mock",
      transcript: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
        { role: "assistant", content: assistant },
      ],
    };
  },
};

let override: LlmBackend | null = null;

/**
 * Replace the active LLM backend. Called by the server at construction
 * when it has an MCP connection to use for sampling, and by tests that
 * want deterministic responses.
 */
export function setLlmBackend(backend: LlmBackend | null): void {
  override = backend;
}

export function getLlmBackend(): LlmBackend {
  if (override) return override;
  const env = (process.env.ATTEST_LLM_BACKEND || "").trim().toLowerCase();
  // `mcp-sampling` is wired by the server at construction; if nobody set
  // the override, we honour the env var only when it names a backend we
  // can resolve from here — otherwise fall back to the mock. This keeps
  // the module portable (no server import).
  if (env === "mock" || env === "" || env === "mcp-sampling") return MOCK_BACKEND;
  return MOCK_BACKEND;
}
