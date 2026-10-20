/**
 * Director kv namespace helpers.
 *
 * Mirrors `docs/attest-director-architecture.md` §11 table verbatim.
 */

export const DIRECTOR_KV_NAMESPACE_PREFIX = "director:";

export const directorKv = {
  core(): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}core`;
  },
  roleBrief(id: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}role-briefs:${id}`;
  },
  roleBriefResearch(id: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}role-briefs:${id}:research`;
  },
  roleBriefIntegrations(id: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}role-briefs:${id}:integrations`;
  },
  draft(briefId: string, version: number): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}drafts:${briefId}:v${version}`;
  },
  draftEval(briefId: string, version: number): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}drafts:${briefId}:v${version}:eval`;
  },
  expert(id: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}experts:${id}`;
  },
  expertTelemetry(id: string, label: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}telemetry:${id}:${label}`;
  },
  refinement(expertId: string, refId: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}refinements:${expertId}:${refId}`;
  },
  decision(id: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}decisions:${id}`;
  },
  rejected(fingerprint: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}rejected:${fingerprint}`;
  },
  retired(expertId: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}retired:${expertId}`;
  },
  integrationCatalog(): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}integrations:catalog`;
  },
  fingerprint(hash: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}fingerprint:${hash}`;
  },
  approval(id: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}approval:${id}`;
  },
  approvalIndex(bind: { owner: string; repo: string; issueNumber: number }): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}approval-index:${bind.owner}/${bind.repo}#${bind.issueNumber}`;
  },
  roleBriefIndex(): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}index:role-briefs`;
  },
  expertIndex(): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}index:experts`;
  },
  refinementIndex(expertId: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}index:refinements:${expertId}`;
  },
  completionResource(briefId: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}resources:briefs:${briefId}:completion`;
  },
  expertSummaryResource(expertId: string): string {
    return `${DIRECTOR_KV_NAMESPACE_PREFIX}resources:experts:${expertId}:summary`;
  },
};

/** TTL defaults (ms) from §11.2 — 180 days. */
export const DIRECTOR_TTL_DEFAULTS = {
  telemetryMs: 180 * 24 * 60 * 60 * 1000,
  fingerprintMs: 180 * 24 * 60 * 60 * 1000,
} as const;
