/**
 * phase-gate/state-machine.ts — the SDLC phase-gate as structured data.
 *
 * The authoritative source is scripts/validators/validate-phase-gate.sh (see
 * populate_phase_artifacts and prereq_for_phase); the structure here mirrors
 * that script exactly. When attest adds a validator to a phase's gate, update
 * BOTH the shell script and the arrays below (there's a smoke check in
 * test/phase-gate.test.ts that compares the per-phase validator set this file
 * declares against the names that appear in the shell script).
 *
 * We mirror rather than parse the .sh file for two reasons:
 *   1. The script's case statement contains conditional branches
 *      (`if [[ -f UX_SPEC.md ]] ...`) and systemic additions (challenger
 *      appended to every phase that chains validators) that are easier to
 *      model as code than to shell-parse at runtime.
 *   2. We want the data available even when ATTEST_ROOT is unset / bundled
 *      sources missing — this is pure in-process metadata.
 */

export type PhaseId =
  | "phase-0"
  | "phase-1"
  | "phase-2"
  | "phase-3"
  | "phase-3.5"
  | "phase-4"
  | "phase-5"
  | "onboard-deep"
  | "security-deep"
  | "feature"
  | "improve";

export interface PhaseDefinition {
  readonly id: PhaseId;
  readonly label: string;
  readonly summary: string;
  /** Required doc artifacts the gate checks for existence. */
  readonly requiredFiles: readonly string[];
  /**
   * Validators chained by the gate. Challenger-gate is appended systemically
   * to every phase whose list is non-empty — model that here, not by
   * repeating the string.
   */
  readonly validators: readonly string[];
  /**
   * Which prior phase's receipt (`docs/work/gates/<prior>-receipt.json`)
   * must exist and verify before this phase can pass. `null` for standalone
   * modes and phase-0.
   */
  readonly prerequisite: PhaseId | null;
}

export const PHASES: readonly PhaseDefinition[] = [
  {
    id: "phase-0",
    label: "Ideation",
    summary: "VISION, COMPETITIVE_ANALYSIS",
    requiredFiles: ["docs/VISION.md", "docs/COMPETITIVE_ANALYSIS.md"],
    validators: [],
    prerequisite: null,
  },
  {
    id: "phase-1",
    label: "Planning",
    summary: "SCOPE, RISKS, CONSTRAINTS, USER_PERSONAS",
    requiredFiles: [
      "docs/SCOPE.md",
      "docs/RISKS.md",
      "docs/CONSTRAINTS.md",
      "docs/USER_PERSONAS.md",
    ],
    validators: [],
    prerequisite: "phase-0",
  },
  {
    id: "phase-2",
    label: "Requirements",
    summary: "SRS, USER_STORIES, USE_CASES",
    requiredFiles: [
      "docs/SRS.md",
      "docs/USER_STORIES.md",
      "docs/USE_CASES.md|docs/testing/USE_CASES.md",
    ],
    validators: [
      "validate-use-cases.sh",
      "validate-user-stories.sh",
      "validate-requirements-matrix.sh",
    ],
    prerequisite: "phase-1",
  },
  {
    id: "phase-3",
    label: "Design",
    summary: "ARCHITECTURE, API, DATABASE, THREAT_MODEL",
    requiredFiles: [
      "docs/MODULE_DESIGN.md",
      "docs/ARCHITECTURE.md",
      "docs/API_DESIGN.md",
      "docs/api/openapi.yaml",
      "docs/TECH_STACK.md",
      "docs/THREAT_MODEL.md",
      "docs/SECURITY_CONTROLS.md",
      "docs/INFRASTRUCTURE.md",
    ],
    validators: [
      "validate-module-design.sh",
      "validate-flows.sh",
      "validate-design-tokens.sh",
      "validate-circular-deps.sh",
      "validate-module-boundaries-transitive.sh",
      "validate-infrastructure.sh",
      "validate-observability.sh",
      "validate-data-governance.sh",
      "validate-resilience-patterns.sh",
      "validate-architecture.sh",
      "validate-api-coverage.sh",
      "validate-sequence-coverage.sh",
      "validate-erd-coverage.sh",
      "validate-no-ascii-art.sh",
      "validate-mermaid.sh",
      "validate-doc-render-health.sh",
      "validate-c3-coverage.sh",
      "validate-entry-points.sh",
      "validate-tech-stack.sh",
      "validate-adrs.sh",
      "validate-security-controls.sh",
      "validate-tracker-integrity.sh",
      "validate-ux-spec.sh",
      "validate-spec-traceability.sh",
    ],
    prerequisite: "phase-2",
  },
  {
    id: "phase-3.5",
    label: "Test design",
    summary: "Coverage-loop test design (non-blocking escalation)",
    requiredFiles: [],
    validators: ["validate-test-design.sh"],
    prerequisite: "phase-3",
  },
  {
    id: "phase-4",
    label: "Implementation",
    summary:
      "build + lint + tests + test mapping + migrations + IaC + module boundary enforcement",
    requiredFiles: [],
    validators: [
      "validate-build.sh",
      "validate-lint.sh",
      "validate-tests.sh",
      "validate-tests-mapping.sh",
      "validate-e2e-setup.sh",
      "validate-migrations.sh",
      "validate-iac.sh",
      "validate-module-boundaries.sh",
      "validate-api-consistency.sh",
      "validate-code-health.sh",
      "validate-dead-code.sh",
      "validate-file-size.sh",
      "validate-tickets.sh",
      "validate-seams.sh",
      "validate-ticket-hygiene.sh",
      "validate-rules.sh",
      "validate-tracker-integrity.sh",
    ],
    prerequisite: "phase-3.5",
  },
  {
    id: "phase-5",
    label: "Release",
    summary:
      "FIX_BACKLOG closed, all reviews READY, release-readiness, requirement closure",
    requiredFiles: [],
    validators: [
      "validate-build.sh",
      "validate-lint.sh",
      "validate-tests.sh",
      "validate-deps.sh",
      "validate-smoke.sh",
      "validate-fix-backlog-closed.sh",
      "validate-model-pins.sh",
      "validate-code-health.sh",
      "validate-dead-code.sh",
      "validate-module-boundaries.sh",
      "validate-api-consistency.sh",
      "validate-contract-conformance.sh",
      "validate-release-readiness.sh",
      "validate-qa-evidence.sh",
      "validate-requirement-closure.sh",
    ],
    prerequisite: "phase-4",
  },
  {
    id: "onboard-deep",
    label: "Deep onboarding",
    summary: "INVENTORY + ARCHITECTURE + ERD",
    requiredFiles: ["docs/onboard/INVENTORY.md", "docs/ARCHITECTURE.md"],
    validators: [
      "validate-inventory.sh",
      "validate-architecture.sh",
      "validate-erd-coverage.sh",
      "validate-sequence-coverage.sh",
      "validate-no-ascii-art.sh",
      "validate-mermaid.sh",
      "validate-doc-render-health.sh",
    ],
    prerequisite: null,
  },
  {
    id: "security-deep",
    label: "Deep security review",
    summary: "OWASP all 10 ≥ 7 + attack chains + deps",
    requiredFiles: [],
    validators: ["validate-owasp.sh", "validate-deps.sh"],
    prerequisite: null,
  },
  {
    id: "feature",
    label: "Feature mode",
    summary:
      "Scoped: changed files on branch all covered by reviews/tests/docs",
    requiredFiles: [],
    validators: ["validate-feature-coverage.sh"],
    prerequisite: null,
  },
  {
    id: "improve",
    label: "Improve mode",
    summary:
      "Scoped: every audit synthesized into IMPROVEMENT_BACKLOG with a verdict",
    requiredFiles: [],
    validators: ["validate-improve-coverage.sh"],
    prerequisite: null,
  },
];

/**
 * Validator chained systemically into every phase whose list is non-empty.
 * See validate-phase-gate.sh's "Challenger is SYSTEMIC, not per-phase" block.
 */
export const SYSTEMIC_VALIDATOR = "validate-challenger-gate.sh";

export function phaseById(id: string): PhaseDefinition | undefined {
  return PHASES.find((p) => p.id === id);
}

/**
 * The complete validator set a phase runs, including the systemic challenger
 * gate appended when the base list is non-empty.
 */
export function effectiveValidators(phase: PhaseDefinition): string[] {
  const base = [...phase.validators];
  if (base.length > 0 && !base.includes(SYSTEMIC_VALIDATOR)) {
    base.push(SYSTEMIC_VALIDATOR);
  }
  return base;
}

/**
 * Return the state machine as JSON-safe data for the
 * `attest://phase-gate/state-machine` MCP resource.
 */
export function stateMachineJSON(): object {
  return {
    source:
      "mirrors scripts/validators/validate-phase-gate.sh (attest canonical)",
    note:
      "challenger-gate is appended systemically to every phase whose base validator list is non-empty",
    systemicValidator: SYSTEMIC_VALIDATOR,
    phases: PHASES.map((p) => ({
      id: p.id,
      label: p.label,
      summary: p.summary,
      prerequisite: p.prerequisite,
      requiredFiles: p.requiredFiles,
      baseValidators: p.validators,
      effectiveValidators: effectiveValidators(p),
    })),
    allowedTransitions: PHASES.filter((p) => p.prerequisite !== null).map(
      (p) => ({ from: p.prerequisite, to: p.id }),
    ),
  };
}
