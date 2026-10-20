/**
 * Shape C — per-expert classification manifest (authoritative source).
 *
 * For every expert in attest's `agents/` directory we declare:
 *
 *   - the **classification** that decides whether the expert runs in-process
 *     as an MCP tool handler in `@bpmforge/attest-mcp` or stays sandboxed
 *     as a per-VM BDK agent in this package;
 *   - the **capability vector** (fences the chief architecture reasons
 *     about: `read:fs`, `write:fs`, `shell:safe`, `shell:destructive`,
 *     `net:fetch`, `git:read`, `git:write`, `pr:open`, `pr:merge`,
 *     `publish:npm`, `env:write`) with the per-capability write/exec scope;
 *   - a short **rationale** so a human reviewer can audit the call;
 *   - the attest **source file** this classification was read against.
 *
 * The rubric (per `docs/attest-chief-architecture.md` §Fences inventory and
 * §Trade-offs matrix, Shape C):
 *
 *   - `sandbox-required` → needs any of `write:fs` to repo source,
 *     `shell:destructive`, `git:write`, `pr:open`, `pr:merge`,
 *     `publish:npm`, `env:write`. Keeps its per-VM BDK agent in this pack.
 *   - `in-process-eligible` → only needs `read:fs`, `shell:safe`
 *     (deterministic, read-only), `net:fetch`, `git:read`. Collapses into
 *     an in-process MCP tool handler in `attest-mcp`.
 *   - `stub` → scaffold-only (no persona, placeholder); keep refusing.
 *
 * Scope note: writes to `docs/` (reports, findings, scratchpads) are NOT
 * `write:fs` to repo source — they are the always-on report channel every
 * expert gets. `write:fs` here means source files the chief ratchets off
 * at phase advance (`src/`, `tests/`, `db/migrations/`, `.github/workflows/`,
 * `Dockerfile`, `CHANGELOG.md`, source dirs named per-HANDOFF, etc.).
 *
 * Keep this file aligned with `packages/attest-experts/agents/` (sandbox set)
 * and with the sibling `@bpmforge/attest-mcp` in-process handler registry.
 * Regenerate the JSON mirror and prune the agents/ tree with
 * `npm --workspace @bpmforge/attest-experts run sync-classification`.
 */

import type { ExpertCluster } from "./expert-registry.js";

export type ExpertClassification =
  | "sandbox-required"
  | "in-process-eligible"
  | "stub";

export type CapabilityKind =
  | "read:fs"
  | "write:fs"
  | "shell:safe"
  | "shell:destructive"
  | "net:fetch"
  | "git:read"
  | "git:write"
  | "pr:open"
  | "pr:merge"
  | "publish:npm"
  | "env:write";

export interface Capability {
  readonly kind: CapabilityKind;
  readonly scope: string;
}

export interface ExpertClassificationEntry {
  readonly cluster: ExpertCluster;
  readonly classification: ExpertClassification;
  readonly requiredCapabilities: readonly Capability[];
  readonly rationale: string;
  readonly sourceFile: string;
}

/**
 * Capabilities every expert gets implicitly (always-on in both in-process
 * and sandbox transports). Call-sites should not re-declare these — the
 * classification manifest only lists the capabilities a given expert
 * additionally requires.
 */
export const BASELINE_CAPABILITIES: readonly Capability[] = [
  { kind: "read:fs", scope: "workspace + attest/agents/* + docs/**" },
  { kind: "write:fs", scope: "docs/** (report channel only)" },
];

/**
 * Which capability kinds force `sandbox-required`. Any entry whose
 * `requiredCapabilities` contains one of these must be classified
 * `sandbox-required`; the sync script asserts this invariant.
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

/**
 * The classification manifest. Keyed by attest expert id (kebab-case of
 * the source filename, matching the `attest-experts` package naming).
 *
 * The scope string for `write:fs` names concretely which paths are in
 * scope — this is what the policy engine will key the expert's `writes`
 * fence off.
 */
export const CLASSIFICATION: Readonly<
  Record<string, ExpertClassificationEntry>
> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Sandbox-required (writes to repo source, pushes git, publishes, etc.)
  // ─────────────────────────────────────────────────────────────────────────

  "coding-agent": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      { kind: "write:fs", scope: "HANDOFF-assigned src/** per phase 4" },
      { kind: "shell:safe", scope: "project build + test commands" },
    ],
    rationale:
      "Implementation specialist — writes application code from spec into src/; sandbox-required for write:fs to repo source.",
    sourceFile: "agents/coding-agent.md",
  },

  "test-engineer": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "tests/**, __tests__/**, e2e/**, and HANDOFF-assigned module tests",
      },
      { kind: "shell:safe", scope: "test runners (vitest/jest/playwright)" },
    ],
    rationale:
      "Senior test engineer — generates and runs real test files into tests/** and e2e/**; write:fs to repo source.",
    sourceFile: "agents/test-engineer.md",
  },

  "design-iterator": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "HANDOFF-assigned source dirs the render→critique→fix loop iterates on",
      },
      { kind: "shell:safe", scope: "playwright screenshot capture + build" },
      { kind: "net:fetch", scope: "model APIs for visual critique" },
    ],
    rationale:
      "Closed render→screenshot→critique→fix loop; HANDOFF WRITE-SCOPE must name source dirs it mutates — write:fs to repo source.",
    sourceFile: "agents/design-iterator.md",
  },

  "migration-planner": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "docs/migrations/** + db/migrations/** when asked to emit runnable DDL",
      },
      { kind: "shell:safe", scope: "DDL validation against dialect" },
    ],
    rationale:
      "Primary mode is docs, but canonical mode emits runnable migrations into db/migrations/** — write:fs to repo source.",
    sourceFile: "agents/migration-planner.md",
  },

  "reliability-engineer": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "docs/** + tests/load/** (k6/Locust/vegeta scripts)",
      },
      { kind: "shell:safe", scope: "load-test runners" },
    ],
    rationale:
      "`--loadtest` mode writes runnable scripts into tests/load/** — write:fs to repo source.",
    sourceFile: "agents/reliability-engineer.md",
  },

  "qa-vnv-engineer": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "docs/testing/vnv/** + e2e/** (durable V&V suite + playwright specs)",
      },
      { kind: "shell:safe", scope: "playwright + axe-core + visual regression" },
      { kind: "net:fetch", scope: "runs against local dev server" },
    ],
    rationale:
      "WRITE-SCOPE explicitly includes e2e/** durable suite — write:fs to repo source.",
    sourceFile: "agents/qa-vnv-engineer.md",
  },

  "changelog-writer": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      { kind: "write:fs", scope: "CHANGELOG.md (top-level repo file)" },
      { kind: "git:read", scope: "git log <last-tag>..HEAD for commit range" },
    ],
    rationale:
      "Writes CHANGELOG.md directly at repo root (not under docs/) in Keep-a-Changelog format — write:fs to a checked-in source file.",
    sourceFile: "agents/changelog-writer.md",
  },

  "release-manager": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "docs/work/release/** (checklist) + version-bump files (package.json, etc.)",
      },
      { kind: "shell:destructive", scope: "npm publish, git push, gh pr merge during phase 5 only" },
      { kind: "git:write", scope: "tag + push during release cut" },
      { kind: "publish:npm", scope: "npm publish during release cut" },
    ],
    rationale:
      "Chief-architecture doc Section 4 names release-manager as the sole holder of shell:destructive at phase 5 — version bump touches package.json even if it delegates publish steps.",
    sourceFile: "agents/release-manager.md",
  },

  "git-expert": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      { kind: "git:read", scope: "reflog, blame, pickaxe, bisect" },
      { kind: "git:write", scope: "commit, branch, tag, merge, rebase" },
      { kind: "pr:open", scope: "draft PR via gh / tea during --feature mode" },
      { kind: "shell:destructive", scope: "git push, tag push (never --force absent explicit confirm)" },
    ],
    rationale:
      "Six modes include --init bootstrap, --feature push+PR, --release tag+push, --sync multi-remote mirror — core git:write + pr:open.",
    sourceFile: "agents/git-expert.md",
  },

  "container-ops": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      { kind: "write:fs", scope: "Dockerfile, docker-compose.yml, .dockerignore, build scripts" },
      { kind: "shell:safe", scope: "docker/podman/nerdctl build + run" },
    ],
    rationale:
      "Execution step 4 explicitly says 'write/update Dockerfiles, compose, scripts' — write:fs to repo source.",
    sourceFile: "agents/container-ops.md",
  },

  "sre-engineer": {
    cluster: "primary",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: ".github/workflows/**, deploy manifests, runbooks under docs/sre/**",
      },
      { kind: "shell:safe", scope: "pipeline linters, deploy dry-runs" },
    ],
    rationale:
      "Writes CI/CD pipelines (.github/workflows/*.yml) and deploy strategies — write:fs to repo source.",
    sourceFile: "agents/sre-engineer.md",
  },

  "gameplay-engineer": {
    cluster: "game",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "HANDOFF-named engine source dirs + docs/design/game/TECH_NOTES.md",
      },
      { kind: "shell:safe", scope: "engine build + unit tests" },
    ],
    rationale:
      "WRITE-SCOPE = 'the source dirs named in the HANDOFF + docs/design/game/TECH_NOTES.md' — write:fs to repo source.",
    sourceFile: "agents/game/gameplay-engineer.md",
  },

  "game-audio-designer": {
    cluster: "game",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "docs/design/game/AUDIO.md + HANDOFF-named audio asset/event source dirs",
      },
      { kind: "net:fetch", scope: "ElevenLabs / audio-gen APIs for placeholders" },
    ],
    rationale:
      "WRITE-SCOPE extends into HANDOFF-named audio asset/event dirs (engine source) — write:fs to repo source.",
    sourceFile: "agents/game/game-audio-designer.md",
  },

  "narrative-designer": {
    cluster: "game",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "docs/design/game/NARRATIVE.md + HANDOFF-named dialogue/quest data source dirs",
      },
    ],
    rationale:
      "WRITE-SCOPE extends into HANDOFF-named dialogue/quest data dirs (engine source) — write:fs to repo source.",
    sourceFile: "agents/game/narrative-designer.md",
  },

  "level-designer": {
    cluster: "game",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "docs/design/game/levels/** + HANDOFF-named level/map data source dirs",
      },
    ],
    rationale:
      "WRITE-SCOPE extends into HANDOFF-named level/map data dirs (engine source) — write:fs to repo source.",
    sourceFile: "agents/game/level-designer.md",
  },

  "game-balance-designer": {
    cluster: "game",
    classification: "sandbox-required",
    requiredCapabilities: [
      {
        kind: "write:fs",
        scope: "docs/design/game/balance/** + the game's tunable config files",
      },
      { kind: "shell:safe", scope: "simulate 1000 player-sessions as a script" },
    ],
    rationale:
      "WRITE-SCOPE explicitly includes 'the game's tunable config files' alongside docs/design/game/balance/ — write:fs to repo source.",
    sourceFile: "agents/game/game-balance-designer.md",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // In-process-eligible — report-only / docs-only / read-plus-synthesize.
  // Also includes the three Phase-1 concrete experts, which the rubric says
  // to flag and leave in place; the attest-mcp Shape-C worker's reference
  // handlers can override to collapse them in-process.
  // ─────────────────────────────────────────────────────────────────────────

  "security-auditor": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "attest validators via attest-mcp (semgrep, trufflehog, etc.)" },
    ],
    rationale:
      "Coordinator — dispatches 8 security specialists and writes synthesis to docs/security/. Delegates coding-agent for fixes; no direct write:fs to repo source.",
    sourceFile: "agents/security-auditor.md",
  },

  "code-reviewer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "lizard/jscpd/knip/ts-prune read-only linters" },
    ],
    rationale:
      "Coordinator — dispatches 7 code-health specialists and writes synthesis to docs/reviews/. Report-only.",
    sourceFile: "agents/code-reviewer.md",
  },

  "landscape-mapper": {
    cluster: "onboarding",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "git:read", scope: "git log hotspot analysis" },
    ],
    rationale:
      "Reads README, package manifests, source tree, git hotspots; writes LANDSCAPE.md to docs/. Report-only.",
    sourceFile: "agents/sdlc/onboard/landscape-mapper.md",
  },

  // Primary coordinators / mode files — all delegate, no direct writes to src.
  "sdlc-lead": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Program manager — delegates all work, owns tracker, writes synthesis docs. No direct code writes.",
    sourceFile: "agents/sdlc-lead.md",
  },
  "sdlc-feature-mode": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Feature-mode coordinator — writes HANDOFFs to docs/work/, delegates implementation.",
    sourceFile: "agents/sdlc-feature-mode.md",
  },
  "sdlc-improve-mode": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Improve-mode coordinator — fan-out of audit specialists, synthesis to docs/.",
    sourceFile: "agents/sdlc-improve-mode.md",
  },
  "sdlc-init-mode": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Init-mode coordinator — dispatches phase files, no direct code writes.",
    sourceFile: "agents/sdlc-init-mode.md",
  },
  "sdlc-onboard-mode": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Onboard-mode coordinator — dispatches landscape-mapper / entry-point-tracer / component-mapper / health-coordinator.",
    sourceFile: "agents/sdlc-onboard-mode.md",
  },
  "sdlc-init-phases-0-2": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Phase 0-2 mode file (ideation/planning/requirements) — writes DESIGN_CONTEXT.md and requirements docs.",
    sourceFile: "agents/sdlc-init-phases-0-2.md",
  },
  "sdlc-init-phase-3": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Phase 3+3.5 mode file (design) — writes design docs and MODULE_DESIGN.md; dispatches design specialists.",
    sourceFile: "agents/sdlc-init-phase-3.md",
  },
  "sdlc-init-phase-4": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Phase 4-5 mode file (implementation+release) — dispatches coding-agent waves; does not write src itself.",
    sourceFile: "agents/sdlc-init-phase-4.md",
  },
  "sdlc-init-phase-5": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Phase 5 mode file (review+release) — synthesizes gate status, dispatches release-manager for cut.",
    sourceFile: "agents/sdlc-init-phase-5.md",
  },

  // Primary docs-only / analysis experts.
  "a11y-compliance": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "axe-core / lighthouse / pa11y read-only" },
      { kind: "net:fetch", scope: "runs against local dev server" },
    ],
    rationale: "WCAG audit — writes to docs/reviews/, no source writes.",
    sourceFile: "agents/a11y-compliance.md",
  },
  "analytics-architect": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Telemetry/observability design doc under docs/ — OBSERVABILITY.md.",
    sourceFile: "agents/analytics-architect.md",
  },
  "api-designer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "API contract design doc — REST/GraphQL design, no implementation writes.",
    sourceFile: "agents/api-designer.md",
  },
  "app-cartographer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "playwright navigate for state inventory" },
      { kind: "net:fetch", scope: "runs against local dev server" },
    ],
    rationale: "WRITE-SCOPE = docs/guide/APP_MAP.md + docs/guide/STORIES.md (exclusive); read-only navigation.",
    sourceFile: "agents/app-cartographer.md",
  },
  "architecture-designer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Produces MODULE_DESIGN.md + INFRASTRUCTURE.md — docs only.",
    sourceFile: "agents/architecture-designer.md",
  },
  "challenger": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "net:fetch", scope: "citation verification against public sources" },
    ],
    rationale: "Adversarial fact-check with CONFIRMED/CONTRADICTED/UNVERIFIABLE verdicts — produces a report.",
    sourceFile: "agents/challenger.md",
  },
  "content-designer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/design/ (exclusive); UI copy spec, no implementation.",
    sourceFile: "agents/content-designer.md",
  },
  "cost-engineer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "net:fetch", scope: "cloud pricing APIs when invited" },
    ],
    rationale: "WRITE-SCOPE = docs/reviews/ (exclusive); cost analysis report.",
    sourceFile: "agents/cost-engineer.md",
  },
  "data-steward": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/ (exclusive); PII classification + governance report.",
    sourceFile: "agents/data-steward.md",
  },
  "db-architect": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Schema design docs — delegates runnable migrations to migration-planner.",
    sourceFile: "agents/db-architect.md",
  },
  "design-system-lead": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/design/ (exclusive); tokens.json + components.md spec, delegates implementation to frontend-design.",
    sourceFile: "agents/design-system-lead.md",
  },
  "documentation-gap-finder": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Scans source exports, reports gaps — explicitly does NOT write the missing docs.",
    sourceFile: "agents/documentation-gap-finder.md",
  },
  "end-user-simulator": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "playwright-mcp browser navigation" },
      { kind: "net:fetch", scope: "runs against local dev server" },
    ],
    rationale: "WRITE-SCOPE = docs/testing/uat/ (exclusive); UAT friction logs, read-only navigation.",
    sourceFile: "agents/end-user-simulator.md",
  },
  "frontend-design": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Produces a review report into docs/reviews/; coding-agent handles remediation.",
    sourceFile: "agents/frontend-design.md",
  },
  "gauntlet-lead": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Gauntlet-loop orchestrator — splits goals, dispatches builders+critics via HANDOFF; writes synthesis to docs/work/.",
    sourceFile: "agents/gauntlet-lead.md",
  },
  "guide": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Routing concierge — maps goals to experts, writes nothing except the one-liner route.",
    sourceFile: "agents/guide.md",
  },
  "guide-scribe": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "playwright screenshot capture" },
      { kind: "net:fetch", scope: "runs against local dev server" },
    ],
    rationale: "WRITE-SCOPE = docs/guide/specs/, docs/guide/screenshots/, docs/guide/BUG_LOG.md — docs only.",
    sourceFile: "agents/guide-scribe.md",
  },
  "llm-integration-engineer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/design/llm/ (exclusive); LLM design doc, no implementation.",
    sourceFile: "agents/llm-integration-engineer.md",
  },
  "manual-writer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/guide/USER_GUIDE.md + docs/guide/chapters/ — docs only.",
    sourceFile: "agents/manual-writer.md",
  },
  "performance-engineer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Performance coordinator — dispatches 5 perf specialists, writes synthesis to docs/performance/.",
    sourceFile: "agents/performance-engineer.md",
  },
  "researcher": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "net:fetch", scope: "playwright-search MCP" },
    ],
    rationale: "Four research modes writing reports — explicit scope boundary refuses implementation asks.",
    sourceFile: "agents/researcher.md",
  },
  "task-decomposer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/work/plan/ (exclusive); produces plan.json + plan.md DAG.",
    sourceFile: "agents/task-decomposer.md",
  },
  "ui-verifier": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "playwright-mcp navigate + screenshot" },
      { kind: "net:fetch", scope: "runs against local dev server" },
    ],
    rationale: "Live-browser verification — navigates and screenshots a running app; writes verification report to docs/.",
    sourceFile: "agents/ui-verifier.md",
  },
  "ux-engineer": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "UX design, review, audit modes — produces STYLE_GUIDE.md / UX_SPEC.md etc. under docs/design/.",
    sourceFile: "agents/ux-engineer.md",
  },
  "ux-researcher": {
    cluster: "primary",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/design/ (exclusive); user-flow diagrams + screen inventory doc.",
    sourceFile: "agents/ux-researcher.md",
  },

  // Security specialists — all docs/security/ (exclusive).
  "attack-chainer": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Reads specialist findings, chains exploits; WRITE-SCOPE = docs/security/.",
    sourceFile: "agents/security/attack-chainer.md",
  },
  "cloud-security-checker": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "aws/gcp CLI read-only inspections" },
    ],
    rationale: "AWS/GCP security anti-patterns in source; WRITE-SCOPE = docs/security/.",
    sourceFile: "agents/security/cloud-security-checker.md",
  },
  "dependency-auditor": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "syft + grype + npm/pip audit read-only" },
      { kind: "net:fetch", scope: "CISA KEV + CVE databases" },
    ],
    rationale: "SBOM/SCA + slopsquatting detection; WRITE-SCOPE = docs/security/.",
    sourceFile: "agents/security/dependency-auditor.md",
  },
  "iac-security-checker": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "checkov + kics + trivy config scan (read-only)" },
    ],
    rationale: "Terraform/CDK/Pulumi/CloudFormation scans; WRITE-SCOPE = docs/security/.",
    sourceFile: "agents/security/iac-security-checker.md",
  },
  "owasp-llm-checker": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "OWASP LLM Top 10 (2025) per-category checks; WRITE-SCOPE = docs/security/.",
    sourceFile: "agents/security/owasp-llm-checker.md",
  },
  "owasp-web-checker": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "OWASP Web Top 10 (2021) per-category checks; WRITE-SCOPE = docs/security/.",
    sourceFile: "agents/security/owasp-web-checker.md",
  },
  "secrets-scanner": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "trufflehog + grep patterns" },
      { kind: "git:read", scope: "git log + git show for history scans" },
    ],
    rationale: "Finds hardcoded secrets; WRITE-SCOPE = docs/security/.",
    sourceFile: "agents/security/secrets-scanner.md",
  },
  "semgrep-runner": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "semgrep scan (no --fix)" },
    ],
    rationale: "SAST scan + triage; WRITE-SCOPE = docs/security/. Shape-C reference-handler candidate.",
    sourceFile: "agents/security/semgrep-runner.md",
  },
  "threat-modeler": {
    cluster: "security",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "STRIDE per component + DFD; WRITE-SCOPE = docs/security/.",
    sourceFile: "agents/security/threat-modeler.md",
  },

  // Code-review specialists — all docs/reviews/.
  "anti-slop-auditor": {
    cluster: "code-review",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "AI slop detection — 31 ANTI_SLOP_RULES; WRITE-SCOPE = docs/reviews/.",
    sourceFile: "agents/code-review/anti-slop-auditor.md",
  },
  "code-health-synthesizer": {
    cluster: "code-review",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Reads 6 specialist outputs, synthesizes CODE_REVIEW with FIX_BACKLOG; WRITE-SCOPE = docs/reviews/.",
    sourceFile: "agents/code-review/code-health-synthesizer.md",
  },
  "complexity-analyzer": {
    cluster: "code-review",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "lizard/radon/complexity read-only" },
    ],
    rationale: "Cyclomatic/cognitive complexity; WRITE-SCOPE = docs/reviews/.",
    sourceFile: "agents/code-review/complexity-analyzer.md",
  },
  "dead-code-detector": {
    cluster: "code-review",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "knip/ts-prune/vulture/unimport read-only" },
    ],
    rationale: "Dead/unused code detection; WRITE-SCOPE = docs/reviews/.",
    sourceFile: "agents/code-review/dead-code-detector.md",
  },
  "duplication-detector": {
    cluster: "code-review",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "jscpd/fdupes/PMD-CPD read-only" },
    ],
    rationale: "Copy-paste + DRY detection; WRITE-SCOPE = docs/reviews/.",
    sourceFile: "agents/code-review/duplication-detector.md",
  },
  "error-handling-auditor": {
    cluster: "code-review",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Empty catches, swallowed errors, serial awaits; WRITE-SCOPE = docs/reviews/.",
    sourceFile: "agents/code-review/error-handling-auditor.md",
  },
  "pattern-consistency-checker": {
    cluster: "code-review",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Pattern + naming + comment-accuracy audit; WRITE-SCOPE = docs/reviews/.",
    sourceFile: "agents/code-review/pattern-consistency-checker.md",
  },
  "type-safety-checker": {
    cluster: "code-review",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "tsc / mypy / pyright read-only type checks" },
    ],
    rationale: "any-escapes, null coercion, runtime type violations; WRITE-SCOPE = docs/reviews/.",
    sourceFile: "agents/code-review/type-safety-checker.md",
  },

  // Performance specialists — all docs/performance/.
  "bundle-analyzer": {
    cluster: "performance",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "webpack-bundle-analyzer / rollup-plugin-visualizer read-only" },
    ],
    rationale: "Bundle size + code splitting + Core Web Vitals; WRITE-SCOPE = docs/performance/.",
    sourceFile: "agents/performance/bundle-analyzer.md",
  },
  "concurrency-checker": {
    cluster: "performance",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Blocking ops in async paths, race conditions; WRITE-SCOPE = docs/performance/.",
    sourceFile: "agents/performance/concurrency-checker.md",
  },
  "db-query-analyzer": {
    cluster: "performance",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "N+1, missing indexes, slow query patterns; WRITE-SCOPE = docs/performance/.",
    sourceFile: "agents/performance/db-query-analyzer.md",
  },
  "perf-synthesizer": {
    cluster: "performance",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Reads all perf specialist findings, synthesizes PERFORMANCE_REPORT; WRITE-SCOPE = docs/performance/.",
    sourceFile: "agents/performance/perf-synthesizer.md",
  },
  "profiler-agent": {
    cluster: "performance",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "node --prof, py-spy, perf (read-only)" },
    ],
    rationale: "Runtime profiling against existing data or a running process; WRITE-SCOPE = docs/performance/.",
    sourceFile: "agents/performance/profiler-agent.md",
  },
  "static-perf-analyzer": {
    cluster: "performance",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Static scans for O(n²), N+1, blocking I/O; WRITE-SCOPE = docs/performance/.",
    sourceFile: "agents/performance/static-perf-analyzer.md",
  },

  // Onboarding specialists — all docs/.
  "component-mapper": {
    cluster: "onboarding",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Produces c2-containers.md + c3-components.md — docs only.",
    sourceFile: "agents/sdlc/onboard/component-mapper.md",
  },
  "entry-point-tracer": {
    cluster: "onboarding",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Produces entry-points.md + sequences/ directory under docs/ — docs only.",
    sourceFile: "agents/sdlc/onboard/entry-point-tracer.md",
  },
  "health-coordinator": {
    cluster: "onboarding",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "Orchestrates health reviews, synthesizes HEALTH_ASSESSMENT.md — docs only.",
    sourceFile: "agents/sdlc/onboard/health-coordinator.md",
  },

  // Game-cluster report-only / design-doc experts.
  "game-asset-pipeline": {
    cluster: "game",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "sprite packing + lattice/pixel-snapper post-process" },
      { kind: "net:fetch", scope: "image-gen model APIs" },
    ],
    rationale: "WRITE-SCOPE = docs/design/game/assets/<batch>/ + docs/design/game/ASSET_MANIFEST.md — all under docs/. Flagged: binary asset generation runs model calls; promote to sandbox if the pipeline later writes into engine source dirs.",
    sourceFile: "agents/game/game-asset-pipeline.md",
  },
  "game-designer": {
    cluster: "game",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/design/game/ (exclusive); GDD / core loop / mechanics docs.",
    sourceFile: "agents/game/game-designer.md",
  },
  "game-producer": {
    cluster: "game",
    classification: "in-process-eligible",
    requiredCapabilities: [],
    rationale: "WRITE-SCOPE = docs/design/game/PRODUCTION.md (exclusive); milestone / scope docs.",
    sourceFile: "agents/game/game-producer.md",
  },
  "playtest-evaluator": {
    cluster: "game",
    classification: "in-process-eligible",
    requiredCapabilities: [
      { kind: "shell:safe", scope: "browser automation + input injection against vertical slice" },
      { kind: "net:fetch", scope: "runs against local game server" },
    ],
    rationale: "WRITE-SCOPE = docs/testing/playtest/ (exclusive); plays via automation, reports.",
    sourceFile: "agents/game/playtest-evaluator.md",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Stubs — scaffold-only, no live persona or explicitly superseded.
  // ─────────────────────────────────────────────────────────────────────────

  "sdlc-init-phases-3-4": {
    cluster: "primary",
    classification: "stub",
    requiredCapabilities: [],
    rationale: "SUPERSEDED (per the persona itself) — split into sdlc-init-phase-3.md and sdlc-init-phase-4.md. Retained in attest source for doc references only; keep refusing until a real port happens (which it will not).",
    sourceFile: "agents/sdlc-init-phases-3-4.md",
  },
};

/**
 * Set of ids that must have a sandbox BDK agent dir in this package.
 * Includes every sandbox-required classification plus the three Phase-1
 * concrete experts (which the rubric says to leave in place even though
 * they are in-process-eligible — the attest-mcp Shape-C reference
 * handlers can promote them to in-process in a follow-up).
 */
export function sandboxExpertIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [id, entry] of Object.entries(CLASSIFICATION)) {
    if (entry.classification === "sandbox-required") ids.add(id);
  }
  // Phase-1 three — kept as sandbox BDK agents even though in-process-eligible.
  ids.add("security-auditor");
  ids.add("code-reviewer");
  ids.add("landscape-mapper");
  return ids;
}

/**
 * The three Phase-1 concrete experts that the classification rubric would
 * mark as `in-process-eligible` but which stay as sandbox BDK agents in
 * this package. Flagged to the Shape-C attest-mcp worker for its reference
 * handler decisions.
 */
export const IN_PROCESS_ELIGIBLE_BUT_KEPT: readonly string[] = [
  "security-auditor",
  "code-reviewer",
  "landscape-mapper",
];
