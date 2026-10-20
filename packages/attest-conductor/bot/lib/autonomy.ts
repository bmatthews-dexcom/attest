/**
 * Autonomy modes — Shape C HITL policy modulation.
 *
 * The policy engine in attest-mcp is authoritative for *whether* a tool call
 * requires approval (`invoke_expert` can return `ApprovalRequired`). The
 * conductor's autonomy mode decides, when the human is in the loop, *how
 * strict* the HITL path is:
 *
 *  - `auto` — default. The chief auto-approves non-destructive
 *    policy-mediated prompts, falls back to the real HITL transport for
 *    destructive capabilities, and fails closed (returns `approved=false`,
 *    `reason="no_hitl_transport"`) if no transport is attached. The Ralph
 *    loop then escalates on denial — never retries blindly.
 *  - `approve-each` — every request_approval ask goes to a human, even for
 *    read-only capabilities. Use when the user said "please double-check me."
 *  - `approve-destructive` — only destructive capabilities (per the
 *    `DESTRUCTIVE_CAPABILITIES` matcher list below) go to a human; everything
 *    else auto-approves. Useful for long overnight runs where source writes,
 *    PR comments, and publishes should still get a human glance, but
 *    everything in-between should fly.
 *
 * The capability names come from the fence inventory in
 * `docs/attest-chief-architecture.md` §4; keep this matcher in sync when a
 * new capability lands in that table.
 */

export const AUTONOMY_MODES = ["auto", "approve-each", "approve-destructive"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const DEFAULT_AUTONOMY_MODE: AutonomyMode = "auto";

export function isAutonomyMode(value: unknown): value is AutonomyMode {
  return typeof value === "string" && (AUTONOMY_MODES as readonly string[]).includes(value);
}

/**
 * Prefix matchers for the capability strings the policy engine stamps on
 * `ApprovalRequired` outcomes. A capability is "destructive" if any of
 * these prefixes match. The intent is read-your-fences-first: dangerous
 * shell, source writes, git writes, PR writes, publishes.
 *
 * Explicit, declarative, and auditable — do not fold this into a regex.
 */
export const DESTRUCTIVE_CAPABILITIES: readonly string[] = [
  "shell:dangerous",
  "shell:destructive",
  "write:fs",
  "write:src",
  "write:credentials",
  "git:write",
  "git:push",
  "pr:",
  "publish:",
  "network:egress-write",
];

export function isDestructiveCapability(capability: string | undefined | null): boolean {
  if (!capability) return false;
  for (const prefix of DESTRUCTIVE_CAPABILITIES) {
    if (capability === prefix || capability.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve whether a given approval ask should go to a human under this
 * autonomy mode. Separate from transport selection — this is "do we
 * bother a human at all?", not "which transport."
 */
export function needsHumanApproval(
  mode: AutonomyMode,
  capability: string | undefined | null,
): boolean {
  switch (mode) {
    case "auto":
      return isDestructiveCapability(capability);
    case "approve-each":
      return true;
    case "approve-destructive":
      return isDestructiveCapability(capability);
  }
}
