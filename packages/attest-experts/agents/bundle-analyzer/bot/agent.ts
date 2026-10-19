// TODO Phase 2: full persona port + eval
// Source: agents/performance/bundle-analyzer.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "bundle-analyzer",
  "source": "agents/performance/bundle-analyzer.md",
  "cluster": "performance",
  "status": "stub",
  "summary": "Frontend bundle performance specialist — bundle size, code splitting, lazy loading, tree shaking, image optimization, Core Web Vitals impact. Skip automatically for backend-only projects. Runs webpack-bundle-analyzer,…"
};

export default defineStubExpert(META);
