// TODO Phase 2: full persona port + eval
// Source: agents/security/secrets-scanner.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "secrets-scanner",
  "source": "agents/security/secrets-scanner.md",
  "cluster": "security",
  "status": "stub",
  "summary": "Secrets and credentials specialist — finds hardcoded API keys, tokens, passwords, and private keys in source code, configs, and git history. Uses TruffleHog, grep patterns, and git log. Runs in parallel with semgrep-r…"
};

export default defineStubExpert(META);
