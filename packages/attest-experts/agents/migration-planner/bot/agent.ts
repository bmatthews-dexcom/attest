// TODO Phase 2: full persona port + eval
// Source: agents/migration-planner.md
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
