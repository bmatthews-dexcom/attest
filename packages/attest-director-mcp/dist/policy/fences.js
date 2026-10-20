const FENCES = [
  // ─── Always granted (§6.1) ──────────────────────────────────────────────
  {
    capability: "read:web",
    tier: "always-granted",
    scopeNote: "arbitrary http(s), subject to BDK egress allowlist",
    rationale: "Phase 2 research + judge model calls"
  },
  {
    capability: "read:tenant-store",
    tier: "always-granted",
    scopeNote: "/cursor/stores/<id>/**",
    rationale: "ledger reads"
  },
  {
    capability: "write:tenant-store:director-namespace",
    tier: "always-granted",
    scopeNote: "/cursor/stores/<id>/director/** + experts-private/**",
    rationale: "ledger writes"
  },
  {
    capability: "write:draft-artifact",
    tier: "always-granted",
    scopeNote: ".../experts-private/<id>/draft/<v>/**",
    rationale: "Phase 3 drafting"
  },
  {
    capability: "shell:safe",
    tier: "always-granted",
    scopeNote: "npm install --dry-run, npm ls, bdk eval, bdk validate, zod/ajv, jq, grep, rg, cat, ls, head, tail (allowlist in director-mcp)",
    rationale: "Phase 2 probes, Phase 4 eval harness"
  },
  {
    capability: "shell:safe:local-install",
    tier: "always-granted",
    scopeNote: "npm install inside the draft dir only (no -g, no --save)",
    rationale: "vendor deps for the draft"
  },
  {
    capability: "read:classification-manifest",
    tier: "always-granted",
    scopeNote: "both private + shared manifests",
    rationale: "Phase 1 proximity check"
  },
  {
    capability: "write:classification-manifest:private",
    tier: "always-granted",
    scopeNote: "experts-private/_manifest.json",
    rationale: "Phase 5 private register"
  },
  {
    capability: "register:attest-mcp:director-namespace",
    tier: "always-granted",
    scopeNote: "hot-register handlers Director created, keyed by director: prefix",
    rationale: "Phase 5 hot-register"
  },
  {
    capability: "request:approval",
    tier: "always-granted",
    scopeNote: "elicit from Bradford through MCP elicitation / GitHub comment-approve",
    rationale: "HITL"
  },
  {
    capability: "invoke:eval-judge",
    tier: "always-granted",
    scopeNote: "LLM judge calls scoped to its own eval fixtures",
    rationale: "Phase 4 scoring"
  },
  // ─── Ask-each (§6.2) ────────────────────────────────────────────────────
  {
    capability: "edit:.cursor/mcp.json",
    tier: "ask-each",
    scopeNote: "user's workspace .cursor/mcp.json",
    rationale: "adds editor-front-door MCP server"
  },
  {
    capability: "write:workspace:cursor-skills",
    tier: "ask-each",
    scopeNote: ".cursor/skills/director-created/<id>/**",
    rationale: "skill form factor user workspace write"
  },
  {
    capability: "cursor-deploy",
    tier: "ask-each",
    scopeNote: "`bdk deploy` to Cursor-managed hosting for sandbox form factor",
    rationale: "hosted side effect"
  },
  {
    capability: "push:personal-gh",
    tier: "ask-each",
    scopeNote: "`git push` to bmatthews-dexcom/attest",
    rationale: "external side effect; triggers CI/webhooks"
  },
  {
    capability: "pr:open:local-attest-repo",
    tier: "ask-each",
    scopeNote: "PR against bmatthews-dexcom/attest for promotion private \u2192 shared",
    rationale: "\xA78 promotion gate"
  },
  {
    capability: "spawn:subagent",
    tier: "ask-each",
    scopeNote: "type \u2208 {generalPurpose, explore} for own research only",
    rationale: "Cursor subagent policy"
  },
  // ─── Never granted (§6.3) ───────────────────────────────────────────────
  {
    capability: "publish:npm",
    tier: "never",
    scopeNote: "any npm registry upload, any registry, public or private",
    rationale: "Bradford's hard distribution constraint \u2014 moved from ask-each to never"
  },
  {
    capability: "write:customer-source",
    tier: "never",
    scopeNote: "any file in the user's repo outside packages/attest-experts/experts/<new-id>/ or experts-private/<new-id>/",
    rationale: "Director creates experts; does not touch Bradford's product source"
  },
  {
    capability: "edit:ceo-namespace",
    tier: "never",
    scopeNote: "any CEO kv namespace",
    rationale: "one-way info flow \u2014 CEO sends briefs, Director sends completions, never cross-writes"
  },
  {
    capability: "edit:chief-namespace",
    tier: "never",
    scopeNote: "any chief/conductor kv namespace",
    rationale: "one-way info flow"
  },
  {
    capability: "edit:deployed-persona-live",
    tier: "never",
    scopeNote: "silent in-place persona edit on a live expert",
    rationale: "Bradford decision 6 \u2014 refinement goes through separate approval, no silent edits"
  },
  {
    capability: "delete:deployed-expert",
    tier: "never",
    scopeNote: "removing a live expert from a manifest as a side effect",
    rationale: "reversible with evidence loss; use `/director retire` instead"
  },
  {
    capability: "read:secrets",
    tier: "never",
    scopeNote: "OS env vars with secret-looking names",
    rationale: "chief doc parity"
  },
  {
    capability: "write:credentials",
    tier: "never",
    scopeNote: ".env, *.key, id_rsa",
    rationale: "chief doc parity"
  },
  {
    capability: "shell:destructive",
    tier: "never",
    scopeNote: "rm -rf, git push --force, DROP TABLE, curl | bash",
    rationale: "Director has no legitimate need"
  },
  {
    capability: "install:npm-package-globally",
    tier: "never",
    scopeNote: "npm install -g",
    rationale: "side effects outside the draft dir"
  },
  {
    capability: "run-arbitrary:spawned-expert",
    tier: "never",
    scopeNote: "invoking a draft expert against production MCPs outside Phase-4 harness",
    rationale: "drafts run only against sandbox MCPs / cached fixtures"
  }
];
const DESTRUCTIVE_CAPABILITY_PREFIXES = [
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
  "cursor-deploy",
  "edit:.cursor/mcp.json",
  "write:workspace:cursor-skills"
];
function isDestructiveCapability(capability) {
  if (!capability) return false;
  for (const prefix of DESTRUCTIVE_CAPABILITY_PREFIXES) {
    if (capability === prefix || capability.startsWith(prefix)) return true;
  }
  return false;
}
function fenceFor(capability) {
  return FENCES.find((f) => f.capability === capability);
}
function fencesByTier(tier) {
  return FENCES.filter((f) => f.tier === tier);
}
export {
  DESTRUCTIVE_CAPABILITY_PREFIXES,
  FENCES,
  fenceFor,
  fencesByTier,
  isDestructiveCapability
};
//# sourceMappingURL=fences.js.map
