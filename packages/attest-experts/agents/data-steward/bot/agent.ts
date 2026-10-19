// TODO Phase 2: full persona port + eval
// Source: agents/data-steward.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "data-steward",
  "source": "agents/data-steward.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Data steward — data governance specialist: PII classification, GDPR/CCPA/PIPEDA obligations, retention schedules, encryption-at-rest/in-transit mapping, data-subject rights (access/erasure/portability), access-control…"
};

export default defineStubExpert(META);
