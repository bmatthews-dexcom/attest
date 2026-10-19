// TODO Phase 2: full persona port + eval
// Source: agents/container-ops.md
import { defineStubExpert } from "../../../lib/expert-factory.js";
import type { ExpertMetadata } from "../../../lib/expert-registry.js";

const META: ExpertMetadata = {
  "id": "container-ops",
  "source": "agents/container-ops.md",
  "cluster": "primary",
  "status": "stub",
  "summary": "Container operations expert — detects the local runtime (Docker/Podman/Rancher-nerdctl/Finch/colima) and uses the right CLI + compose flavor instead of guessing; Dockerfiles, compose, networking, rootless debugging, i…"
};

export default defineStubExpert(META);
