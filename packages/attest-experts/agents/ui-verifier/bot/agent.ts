// TODO Phase 2: full persona port + eval
// Source: agents/ui-verifier.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "ui-verifier",
  "source": "agents/ui-verifier.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Live browser verification specialist — navigates a running app with playwright-mcp, takes screenshots, checks accessibility snapshots, and verifies flows against use cases or UX specs. Works with any LLM (no vision re…"
};

export default defineStubExpert(META);
