// TODO Phase 2: full persona port + eval
// Source: agents/test-engineer.md
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
