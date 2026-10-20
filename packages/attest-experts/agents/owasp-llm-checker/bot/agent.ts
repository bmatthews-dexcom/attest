// TODO Phase 2: full persona port + eval
// Source: agents/security/owasp-llm-checker.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "owasp-llm-checker",
  "source": "agents/security/owasp-llm-checker.md",
  "cluster": "security",
  "status": "stub",
  "summary": "OWASP LLM Top 10 specialist (2025) — checks LLM01–LLM10 for projects using AI/LLM APIs. Only runs when LLM code is detected. Covers prompt injection, output handling, excessive agency, supply chain, unbounded consumpt…"
};

export default defineStubExpert(META);
