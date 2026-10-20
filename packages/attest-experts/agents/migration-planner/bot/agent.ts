// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/migration-planner.md
// Classification rationale: Primary mode is docs, but canonical mode emits runnable migrations into db/migrations/** — write:fs to repo source.
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "migration-planner",
  "source": "agents/migration-planner.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Database migration planner — compares two schema states (files or git refs), produces ordered migration steps with rollback plan per step. Proactive: before any schema change that touches existing tables."
};

export default defineStubExpert(META);
