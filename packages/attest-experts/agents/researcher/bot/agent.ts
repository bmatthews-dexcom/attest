// TODO Phase 2: full persona port + eval
// Source: agents/researcher.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "researcher",
  "source": "agents/researcher.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Professional research analyst — four modes: QUICK LOOKUP (1-3 sources, single Q), COMPARISON (A vs B weighted table), DEEP DIVE (full iterative loop, multi-Q), FACT CHECK (verify a claim). Uses playwright-search MCP.…"
};

export default defineStubExpert(META);
