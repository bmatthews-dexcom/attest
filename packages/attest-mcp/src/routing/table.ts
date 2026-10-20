/**
 * routing/table.ts — the /guide concierge's routing table as structured data,
 * mirrored from agents/guide.md's "Routing table — intent → expert" section
 * (attest canonical). When attest's guide gains a row, update both.
 *
 * Shape: ordered list of {patterns, agent, command, rationale}. Order matters
 * — more specific entries first so broad fallbacks like "/sdlc improve" don't
 * swallow a security match.
 *
 * Patterns are case-insensitive substring tests, grouped by meaning. The
 * matcher scores a goal by counting matched tokens per entry; the top-scoring
 * entry wins. Ties break on earlier-is-better (preserves the author's
 * priority order from guide.md).
 */

export interface RoutingEntry {
  readonly agent: string;
  readonly command: string;
  readonly rationale: string;
  readonly patterns: readonly string[];
}

export const ROUTING_TABLE: readonly RoutingEntry[] = [
  // --- Security (highest-priority specific match) ---------------------------
  {
    agent: "security-auditor",
    command: "/security --fix",
    rationale:
      "find AND fix security issues — triage, FIX_BACKLOG, remediate, re-scan to confirm.",
    patterns: [
      "security fix",
      "fix security",
      "remediate",
      "patch vuln",
      "fix vulnerab",
      "close the finding",
    ],
  },
  {
    agent: "security-auditor",
    command: "/security --deep",
    rationale:
      "deep OWASP review with attack-chain ranking; use pre-launch or on sensitive code.",
    patterns: [
      "deep security",
      "pre-launch",
      "pre-release security",
      "owasp",
      "threat model",
      "attack chain",
      "pentest",
    ],
  },
  {
    agent: "security-auditor",
    command: "/security",
    rationale: "quick security scan over the repo.",
    patterns: [
      "security scan",
      "security check",
      "check for vuln",
      "find vulnerab",
      "secret scan",
      "sast",
      "check all my source for issues",
      "securely check",
      "security review",
      "security audit",
    ],
  },

  // --- SDLC entry points ---------------------------------------------------
  {
    agent: "sdlc-lead",
    command: '/sdlc init <name> "<desc>"',
    rationale: "brand-new greenfield project.",
    patterns: [
      "new project",
      "start a project",
      "brand new",
      "greenfield",
      "bootstrap a project",
      "create a project",
      "init project",
    ],
  },
  {
    agent: "sdlc-lead",
    command: "/sdlc onboard [--deep]",
    rationale: "understand an existing or unfamiliar codebase.",
    patterns: [
      "onboard",
      "unfamiliar code",
      "understand this code",
      "understand the codebase",
      "learn the codebase",
      "what is this project",
      "new to this repo",
      "inherited this",
    ],
  },
  {
    agent: "sdlc-lead",
    command: '/sdlc feature "<desc>"',
    rationale:
      "add a feature to an existing project; runs discovery + impact + design + implement + verify.",
    patterns: [
      "add a feature",
      "new feature",
      "build a feature",
      "implement a feature",
      "ship a feature",
    ],
  },
  {
    agent: "sdlc-lead",
    command: "/sdlc improve",
    rationale:
      "audit and improve a whole system across all dimensions (security, code health, perf, UX).",
    patterns: [
      "improve",
      "audit and improve",
      "harden",
      "clean up the code",
      "whats wrong with this",
      "what's wrong with this",
      "polish the project",
      "quality pass",
    ],
  },
  {
    agent: "sdlc-lead",
    command: "/sdlc resume",
    rationale:
      "continue after a /clear or a long context; rehydrates from docs/work/STATE.md.",
    patterns: ["resume", "continue after clear", "pick up where", "resume state"],
  },

  // --- Code quality ---------------------------------------------------------
  {
    agent: "code-reviewer",
    command: "/review-code",
    rationale:
      "nine-dimension code review including dead code, duplication, complexity, test coverage.",
    patterns: [
      "code review",
      "review the code",
      "code quality",
      "code health",
      "dead code",
      "unused code",
      "duplication",
      "complexity",
      "find stubs",
    ],
  },

  // --- Performance ---------------------------------------------------------
  {
    agent: "performance-engineer",
    command: "/perf",
    rationale: "profile and fix slowness; benchmarks + hot path analysis.",
    patterns: [
      "performance",
      "slow",
      "profiling",
      "profile",
      "benchmark",
      "latency",
      "throughput",
      "perf regression",
    ],
  },

  // --- Data / DB ----------------------------------------------------------
  {
    agent: "db-architect",
    command: "/dba",
    rationale: "design or fix a database schema; indexes, normalization, ERD.",
    patterns: [
      "database schema",
      "db schema",
      "schema design",
      "redesign the database",
      "normalize",
      "add an index",
      "erd",
    ],
  },
  {
    agent: "migration-planner",
    command: "HANDOFF: migration-planner",
    rationale:
      "plan a schema migration with ordered steps and reversibility checks.",
    patterns: [
      "schema migration",
      "migration plan",
      "migrate the schema",
      "rollback plan",
    ],
  },

  // --- UX / Frontend ------------------------------------------------------
  {
    agent: "ux-engineer",
    command: "/ux",
    rationale: "design a UI, check UX flows, accessibility.",
    patterns: [
      "ux",
      "user experience",
      "design the ui",
      "ui design",
      "wireframe",
      "user flow",
    ],
  },
  {
    agent: "frontend-design",
    command: "/frontend",
    rationale:
      "make existing UI look intentional — visual polish, design tokens, consistency.",
    patterns: [
      "visual polish",
      "frontend polish",
      "make the ui look",
      "design tokens",
      "visual design",
    ],
  },
  {
    agent: "a11y-compliance",
    command: "/a11y",
    rationale: "WCAG / accessibility / EAA-508 compliance audit.",
    patterns: ["accessibility", "a11y", "wcag", "508", "screen reader"],
  },

  // --- Testing / QA -------------------------------------------------------
  {
    agent: "test-engineer",
    command: "/test-expert",
    rationale: "write or review tests; add coverage, design test cases.",
    patterns: [
      "write tests",
      "add tests",
      "test coverage",
      "unit test",
      "integration test",
      "e2e test",
      "review the tests",
    ],
  },
  {
    agent: "end-user-simulator",
    command: "/end-user-simulator",
    rationale: "test the app as a real first-time user would, no instructions.",
    patterns: [
      "test as a user",
      "first-time user",
      "end user test",
      "manual test",
      "walkthrough as a user",
    ],
  },
  {
    agent: "qa-vnv-engineer",
    command: "HANDOFF: qa-vnv-engineer",
    rationale: "end-user validation report (release-gate evidence).",
    patterns: ["validation report", "vnv", "release qa"],
  },

  // --- API / contracts ----------------------------------------------------
  {
    agent: "api-designer",
    command: "/api-design",
    rationale: "design an API, endpoints, contracts.",
    patterns: [
      "design an api",
      "api design",
      "api contract",
      "rest api",
      "graphql schema",
      "openapi",
      "endpoints",
    ],
  },

  // --- Containers / DevOps / Reliability ----------------------------------
  {
    agent: "container-ops",
    command: "/containers",
    rationale: "build or debug containers / Dockerfiles.",
    patterns: ["dockerfile", "docker image", "container build", "containers"],
  },
  {
    agent: "sre-engineer",
    command: "/devops",
    rationale: "CI/CD, deploys, runbooks, incidents.",
    patterns: ["ci cd", "ci/cd", "deploy", "deployment", "runbook", "incident"],
  },
  {
    agent: "reliability-engineer",
    command: "/reliability",
    rationale: "load tests, chaos, resilience under stress.",
    patterns: [
      "load test",
      "chaos",
      "resilience",
      "stress test",
      "what breaks under",
    ],
  },

  // --- Git / Release ------------------------------------------------------
  {
    agent: "git-expert",
    command: "/git-expert",
    rationale: "git branches, releases, recovery, multi-remote.",
    patterns: [
      "git branch",
      "rebase",
      "merge conflict",
      "recover git",
      "lost commit",
      "git recovery",
      "release branch",
    ],
  },
  {
    agent: "release-manager",
    command: "/release",
    rationale: "cut a release; version + changelog + tag + push.",
    patterns: [
      "cut a release",
      "release the project",
      "ship a release",
      "tag a release",
      "bump the version",
    ],
  },

  // --- Research / Decisions / Knowledge -----------------------------------
  {
    agent: "researcher",
    command: "/research",
    rationale: "research a decision, compare options.",
    patterns: [
      "research",
      "compare options",
      "evaluate libraries",
      "which library",
      "trade-offs",
    ],
  },
  {
    agent: "guide",
    command: "/vault",
    rationale:
      "answer a project question from compiled knowledge, or add/lint a vault page.",
    patterns: ["vault", "knowledge base", "compile knowledge"],
  },

  // --- LLM / Cost / Analytics / Governance --------------------------------
  {
    agent: "llm-integration-engineer",
    command: "/llm-integration",
    rationale: "design an LLM feature; prompts, evals, routing.",
    patterns: [
      "llm feature",
      "ai feature",
      "prompt engineering",
      "evals",
      "model router",
      "llm integration",
    ],
  },
  {
    agent: "cost-engineer",
    command: "/cost",
    rationale: "cut cloud / LLM spend, right-size, unit economics.",
    patterns: [
      "cut cost",
      "cloud spend",
      "right-size",
      "unit economics",
      "llm cost",
      "reduce spend",
    ],
  },
  {
    agent: "analytics-architect",
    command: "/analytics",
    rationale: "decide what to measure — metrics, events, dashboards.",
    patterns: ["analytics", "metrics", "events", "dashboard", "what to measure"],
  },
  {
    agent: "data-steward",
    command: "/data-governance",
    rationale: "classify PII, GDPR/CCPA, retention, erasure paths.",
    patterns: ["pii", "gdpr", "ccpa", "retention", "data governance", "privacy"],
  },

  // --- Decomposition / Planning / Resume ----------------------------------
  {
    agent: "task-decomposer",
    command: "HANDOFF: task-decomposer -> scripts/run-plan.mjs",
    rationale: "break a big / vague task into a runnable plan.json.",
    patterns: [
      "break down",
      "decompose",
      "big task",
      "vague task",
      "plan this out",
      "multi-step",
    ],
  },

  // --- Game ---------------------------------------------------------------
  {
    agent: "game cluster (sdlc-lead with --game)",
    command: '/sdlc init <name> "<desc>" --game',
    rationale: "build a game.",
    patterns: ["build a game", "game dev", "game project", "unity", "godot"],
  },

  // --- Guide fallback ------------------------------------------------------
  {
    agent: "guide",
    command: "/guide",
    rationale:
      "ambiguous or multi-dimension goal; describe the goal and the concierge will route.",
    patterns: [
      "not sure",
      "which expert",
      "which command",
      "which skill",
      "help me pick",
    ],
  },
];

export interface RouteMatch {
  readonly entry: RoutingEntry;
  readonly score: number;
  readonly matchedPatterns: string[];
}

export interface RouteGoalResult {
  readonly goal: string;
  readonly match: RouteMatch | null;
  readonly runnerUp: RouteMatch | null;
  readonly rationale: string;
}

function tokenize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreEntry(goal: string, entry: RoutingEntry): RouteMatch {
  const matched: string[] = [];
  let score = 0;
  for (const p of entry.patterns) {
    const needle = tokenize(p);
    if (needle && goal.includes(needle)) {
      matched.push(p);
      // Multi-word patterns are stronger signals than single-word matches.
      const weight = needle.split(" ").length;
      score += weight;
    }
  }
  return { entry, score, matchedPatterns: matched };
}

export function routeGoal(goal: string): RouteGoalResult {
  const normalized = tokenize(goal);
  const scored = ROUTING_TABLE.map((e) => scoreEntry(normalized, e));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: earlier (more specific) entry wins.
    return ROUTING_TABLE.indexOf(a.entry) - ROUTING_TABLE.indexOf(b.entry);
  });

  const top = scored[0];
  if (!top || top.score === 0) {
    const guideEntry = ROUTING_TABLE.find((e) => e.command === "/guide")!;
    return {
      goal,
      match: null,
      runnerUp: null,
      rationale:
        "no routing-table pattern matched; defaulting to /guide for a clarifying question. Try narrowing the goal (e.g. mention 'security', 'performance', 'tests', 'onboard').",
    };
  }

  return {
    goal,
    match: top,
    runnerUp: scored[1]?.score > 0 ? scored[1] : null,
    rationale: top.entry.rationale,
  };
}

export function routingTableJSON(): object {
  return {
    source: "mirrors agents/guide.md routing table (attest canonical)",
    entries: ROUTING_TABLE.map((e) => ({
      agent: e.agent,
      command: e.command,
      rationale: e.rationale,
      patterns: e.patterns,
    })),
  };
}
