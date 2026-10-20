// Shape C — sandbox-required BDK agent (stub pending full persona port + eval)
// Attest source: agents/container-ops.md
// Classification rationale: Execution step 4 explicitly says 'write/update Dockerfiles, compose, scripts' — write:fs to repo source.
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
