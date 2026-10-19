// TODO Phase 2: full persona port + eval
// Source: agents/a11y-compliance.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "a11y-compliance",
  "source": "agents/a11y-compliance.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Accessibility & compliance auditor — WCAG 2.2 AA/AAA conformance, ATAG, EN 301 549 / European Accessibility Act, Section 508; axe-core/Lighthouse/pa11y tooling; remediation with file:line. Use after UX design (audit t…"
};

export default defineStubExpert(META);
