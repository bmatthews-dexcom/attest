import { z } from "zod";
const CAPABILITY_KINDS = [
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
  "env:write"
];
const capabilityKindSchema = z.enum(CAPABILITY_KINDS);
const CapabilitySchema = z.object({
  kind: capabilityKindSchema,
  scope: z.string().min(1).describe(
    "Concrete scope the capability is granted at \u2014 e.g. glob pattern, allowed command list, host allowlist."
  )
});
const CapabilityMapSchema = z.object({
  reads: z.array(z.string().min(1)).default([]),
  writes: z.array(z.string().min(1)).default([]),
  shell_patterns: z.array(z.string().min(1)).default([]),
  network: z.array(z.string().min(1)).default([]),
  mcp_tools: z.array(z.string().min(1)).default([])
}).strict();
const SANDBOX_FORCING_KINDS = [
  "write:fs",
  "shell:destructive",
  "git:write",
  "pr:open",
  "pr:merge",
  "publish:npm",
  "env:write"
];
function isSandboxForcing(kind) {
  return SANDBOX_FORCING_KINDS.includes(kind);
}
function mapForcesSandbox(map) {
  if (map.shell_patterns.some((p) => isDestructiveShell(p))) return true;
  if (map.writes.length === 0) return false;
  for (const w of map.writes) {
    if (w === "docs/**" || w.startsWith("docs/")) continue;
    return true;
  }
  return false;
}
const DESTRUCTIVE_SHELL_PATTERNS = [
  "rm -rf",
  "rm -r",
  "git push",
  "git push --force",
  "DROP TABLE",
  "curl | bash",
  "npm publish",
  "npm install -g"
];
function isDestructiveShell(pattern) {
  const lower = pattern.toLowerCase();
  return DESTRUCTIVE_SHELL_PATTERNS.some((d) => lower.includes(d.toLowerCase()));
}
export {
  CAPABILITY_KINDS,
  CapabilityMapSchema,
  CapabilitySchema,
  SANDBOX_FORCING_KINDS,
  capabilityKindSchema,
  isDestructiveShell,
  isSandboxForcing,
  mapForcesSandbox
};
//# sourceMappingURL=capabilities.js.map
