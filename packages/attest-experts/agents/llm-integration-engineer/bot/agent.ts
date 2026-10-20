// TODO Phase 2: full persona port + eval
// Source: agents/llm-integration-engineer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "llm-integration-engineer",
  "source": "agents/llm-integration-engineer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "LLM integration engineer — design-side expert for building LLM features: prompt architecture, eval harnesses, model routing and fallback chains, token budgeting, structured-output contracts, RAG shape. Use when a proj…"
};

export default defineStubExpert(META);
