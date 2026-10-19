// TODO Phase 2: full persona port + eval
// Source: agents/changelog-writer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "changelog-writer",
  "source": "agents/changelog-writer.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Changelog and release notes writer — reads git log range, classifies commits by type, produces CHANGELOG.md entries in Keep-a-Changelog format (Added/Changed/Fixed/Removed/Security/Deprecated). Proactive: before any v…"
};

export default defineStubExpert(META);
