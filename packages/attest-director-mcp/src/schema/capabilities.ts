/**
 * Capability vocabulary — the fence vectors the chief's registry reasons
 * about. See `docs/attest-director-architecture.md` §4.3 (`capabilities.ts`
 * emitted as part of every draft) and `docs/attest-chief-architecture.md`
 * §Fences inventory.
 *
 * Keep in step with the Shape-C `attest-experts` classification manifest —
 * a shape mismatch here means a Director-created expert cannot be
 * hot-registered against `attest-mcp`'s handler framework.
 */
import { z } from "zod";

export const CAPABILITY_KINDS = [
  "read:fs",
  "write:fs",
  "shell:safe",
  "shell:destructive",
  "net:fetch",
  "git:read",
  "git:write",
  "pr:open",
  "pr:merge",
  "publish:npm",
  "env:write",
] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

export const capabilityKindSchema = z.enum(CAPABILITY_KINDS);

export const CapabilitySchema = z.object({
  kind: capabilityKindSchema,
  scope: z
    .string()
    .min(1)
    .describe(
      "Concrete scope the capability is granted at — e.g. glob pattern, " +
        "allowed command list, host allowlist.",
    ),
});
export type Capability = z.infer<typeof CapabilitySchema>;

/**
 * Director-side capability map: the vector the chief's registry needs.
 * Mirrors `packages/attest-experts/lib/schema.ts` so chief, mcp, and
 * generated expert agree on the keys.
 */
export const CapabilityMapSchema = z
  .object({
    reads: z.array(z.string().min(1)).default([]),
    writes: z.array(z.string().min(1)).default([]),
    shell_patterns: z.array(z.string().min(1)).default([]),
    network: z.array(z.string().min(1)).default([]),
    mcp_tools: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type CapabilityMap = z.infer<typeof CapabilityMapSchema>;

/**
 * Capability kinds that FORCE `sandbox-required` form factor per the
 * classification rubric in `docs/attest-director-architecture.md` §5.1 and
 * the sync-script invariant in `packages/attest-experts/lib/classification.ts`.
 */
export const SANDBOX_FORCING_KINDS: readonly CapabilityKind[] = [
  "write:fs",
  "shell:destructive",
  "git:write",
  "pr:open",
  "pr:merge",
  "publish:npm",
  "env:write",
];

export function isSandboxForcing(kind: CapabilityKind): boolean {
  return SANDBOX_FORCING_KINDS.includes(kind);
}

/**
 * Decide if a capability map requires sandbox form factor based on its
 * declared writes/shell/network vectors. The classifier walks every
 * `writes` entry: a glob that targets `src/` or non-`docs/` paths
 * triggers sandbox-forcing (§5.1 rule 1).
 */
export function mapForcesSandbox(map: CapabilityMap): boolean {
  if (map.shell_patterns.some((p) => isDestructiveShell(p))) return true;
  if (map.writes.length === 0) return false;
  for (const w of map.writes) {
    if (w === "docs/**" || w.startsWith("docs/")) continue;
    return true; // any non-docs write forces sandbox
  }
  return false;
}

/**
 * Heuristic for `shell:destructive`. Kept intentionally short: the policy
 * engine (`src/policy/cedar.ts`) has the authoritative list; this is used
 * only for the drafter's form-factor hint.
 */
const DESTRUCTIVE_SHELL_PATTERNS = [
  "rm -rf",
  "rm -r",
  "git push",
  "git push --force",
  "DROP TABLE",
  "curl | bash",
  "npm publish",
  "npm install -g",
] as const;

export function isDestructiveShell(pattern: string): boolean {
  const lower = pattern.toLowerCase();
  return DESTRUCTIVE_SHELL_PATTERNS.some((d) => lower.includes(d.toLowerCase()));
}
