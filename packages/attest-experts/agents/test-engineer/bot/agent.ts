// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/test-engineer.md
// Classification rationale: Senior test engineer — generates and runs real test files into tests/** and e2e/**; write:fs to repo source.
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "test-engineer",
  "source": "agents/test-engineer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Senior test engineer — Playwright e2e, vitest/jest unit tests, integration tests, test strategy, coverage analysis. Use when writing tests or designing test strategy. Proactive: after implementing any feature, or when…"
};

export default defineStubExpert(META);
