const DIRECTOR_KV_NAMESPACE_PREFIX = "director:";
const directorKv = {
  core() {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}core`;
  },
  roleBrief(id) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}role-briefs:${id}`;
  },
  roleBriefResearch(id) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}role-briefs:${id}:research`;
  },
  roleBriefIntegrations(id) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}role-briefs:${id}:integrations`;
  },
  draft(briefId, version) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}drafts:${briefId}:v${version}`;
  },
  draftEval(briefId, version) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}drafts:${briefId}:v${version}:eval`;
  },
  expert(id) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}experts:${id}`;
  },
  expertTelemetry(id, label) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}telemetry:${id}:${label}`;
  },
  refinement(expertId, refId) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}refinements:${expertId}:${refId}`;
  },
  decision(id) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}decisions:${id}`;
  },
  rejected(fingerprint) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}rejected:${fingerprint}`;
  },
  retired(expertId) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}retired:${expertId}`;
  },
  integrationCatalog() {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}integrations:catalog`;
  },
  fingerprint(hash) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}fingerprint:${hash}`;
  },
  approval(id) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}approval:${id}`;
  },
  approvalIndex(bind) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}approval-index:${bind.owner}/${bind.repo}#${bind.issueNumber}`;
  },
  roleBriefIndex() {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}index:role-briefs`;
  },
  expertIndex() {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}index:experts`;
  },
  refinementIndex(expertId) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}index:refinements:${expertId}`;
  },
  completionResource(briefId) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}resources:briefs:${briefId}:completion`;
  },
  expertSummaryResource(expertId) {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}resources:experts:${expertId}:summary`;
  }
};
const DIRECTOR_TTL_DEFAULTS = {
  telemetryMs: 180 * 24 * 60 * 60 * 1e3,
  fingerprintMs: 180 * 24 * 60 * 60 * 1e3
};
export {
  DIRECTOR_KV_NAMESPACE_PREFIX,
  DIRECTOR_TTL_DEFAULTS,
  directorKv
};
//# sourceMappingURL=namespace.js.map
