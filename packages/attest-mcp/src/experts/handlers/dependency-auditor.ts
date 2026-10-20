/**
 * handlers/dependency-auditor.ts — reference in-process expert.
 *
 * Aligned with the sibling attest-experts classification manifest
 * (packages/attest-experts/lib/classification.generated.json, PR #12):
 *   id:              "dependency-auditor"
 *   cluster:         security
 *   classification:  in-process-eligible
 *   WRITE-SCOPE:     docs/security/
 *
 * The full persona runs syft + grype + `npm/pip audit` and consults the
 * CISA KEV + CVE databases over the network to flag known-exploited
 * dependencies and slopsquatting candidates. This reference handler
 * exercises the lighter path: it reads every `package.json` in the
 * workspace, extracts the dependency set + declared licenses, and
 * optionally fetches the OSV (Open Source Vulnerability) record for a
 * sample of packages. The capability spectrum (`read:fs` + `net:fetch`)
 * matches the manifest's declared capabilities (minus `shell:safe`,
 * which the reference handler doesn't exercise — a Phase-2 port would
 * add it).
 *
 * `ATTEST_VULN_DB_URL` lets tests redirect the network call to a
 * `file://` or stubbed URL so no real HTTP goes out under node:test.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  ExpertFinding,
  ExpertInput,
  ExpertOutput,
  InProcessExpertHandler,
} from "../types.js";
import { getLlmBackend } from "./llm.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "bundled", "coverage"]);

const PERMISSIVE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
]);

interface ManifestInfo {
  readonly path: string;
  readonly name?: string;
  readonly version?: string;
  readonly license?: string;
  readonly dependencies: Record<string, string>;
}

function findManifests(root: string, cap = 500): ManifestInfo[] {
  const out: ManifestInfo[] = [];
  const stack = [root];
  while (stack.length && out.length < cap) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(abs);
      } else if (st.isFile() && name === "package.json") {
        try {
          const text = readFileSync(abs, "utf8");
          const data = JSON.parse(text) as {
            name?: string;
            version?: string;
            license?: string | { type?: string };
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
          const license =
            typeof data.license === "string"
              ? data.license
              : (data.license && typeof data.license === "object" && typeof data.license.type === "string")
                ? data.license.type
                : undefined;
          out.push({
            path: relative(root, abs),
            name: data.name,
            version: data.version,
            license,
            dependencies: { ...(data.dependencies ?? {}), ...(data.devDependencies ?? {}) },
          });
        } catch {
          out.push({ path: relative(root, abs), dependencies: {} });
        }
      }
    }
  }
  return out;
}

interface VulnLookup {
  readonly package: string;
  readonly knownVulns: number;
  readonly ids: string[];
}

async function lookupVulnerabilities(pkg: string): Promise<VulnLookup | null> {
  const base = (process.env.ATTEST_VULN_DB_URL || "https://api.osv.dev/v1/query").replace(/\/?$/, "");
  try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ package: { name: pkg, ecosystem: "npm" } }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { vulns?: Array<{ id?: string }> };
    const vulns = Array.isArray(data.vulns) ? data.vulns : [];
    return {
      package: pkg,
      knownVulns: vulns.length,
      ids: vulns.map((v) => (typeof v.id === "string" ? v.id : "unknown")).slice(0, 10),
    };
  } catch {
    return null;
  }
}

export const dependencyAuditorHandler: InProcessExpertHandler = {
  id: "dependency-auditor",
  cluster: "security",
  persona: async () => {
    try {
      const { loadPersonaFromAttestSource } = await import("./persona.js");
      return await loadPersonaFromAttestSource("security/dependency-auditor");
    } catch {
      return (
        "You are dependency-auditor, an attest security specialist. You " +
        "take a list of package manifests, a per-package vulnerability " +
        "lookup from OSV/CISA KEV, and the declared licenses, and classify " +
        "each as (a) safe, (b) known-exploited, (c) license-non-permissive, " +
        "or (d) slopsquatting candidate. Writes synthesis to docs/security/."
      );
    }
  },
  requiredCapabilities: [{ kind: "read:fs" }, { kind: "net:fetch" }],
  async invoke(input: ExpertInput): Promise<ExpertOutput> {
    const start = Date.now();
    const root = input.projectRoot || process.env.ATTEST_TARGET_ROOT || process.cwd();
    if (!existsSync(root)) {
      throw new Error(`dependency-auditor: projectRoot does not exist: ${root}`);
    }

    const manifests = findManifests(root);
    const uniquePackages = new Set<string>();
    for (const m of manifests) for (const name of Object.keys(m.dependencies)) uniquePackages.add(name);

    const vulnSample = typeof input.args?.vulnSample === "number"
      ? Math.max(0, Math.min(100, input.args.vulnSample as number))
      : 10;
    const vulnLookups: VulnLookup[] = [];
    const packages = Array.from(uniquePackages).slice(0, vulnSample);
    for (const pkg of packages) {
      const r = await lookupVulnerabilities(pkg);
      if (r) vulnLookups.push(r);
    }

    const findings: ExpertFinding[] = [];
    for (const m of manifests) {
      if (!m.license) {
        findings.push({
          category: "license:missing",
          severity: "medium",
          detail: `${m.name ?? m.path} declares no license field`,
          location: m.path,
        });
      } else if (!PERMISSIVE_LICENSES.has(m.license)) {
        findings.push({
          category: "license:non-permissive",
          severity: "high",
          detail: `${m.name ?? m.path} declares license ${m.license}, which is outside the permissive allow-list`,
          location: m.path,
        });
      }
    }
    for (const v of vulnLookups) {
      if (v.knownVulns > 0) {
        findings.push({
          category: "dep:known-vuln",
          severity: "high",
          detail: `${v.package} has ${v.knownVulns} known vulnerability record(s): ${v.ids.join(", ")}`,
        });
      }
    }

    const llm = getLlmBackend();
    const persona =
      typeof dependencyAuditorHandler.persona === "string"
        ? dependencyAuditorHandler.persona
        : await dependencyAuditorHandler.persona();
    const llmResponse = await llm.complete({
      system: persona,
      user:
        `Goal: ${input.goal}\n\n` +
        `Workspace: ${root}\n` +
        `Manifests: ${manifests.length}\n` +
        `Unique dependencies: ${uniquePackages.size}\n` +
        `Vuln sample: ${packages.length}\n` +
        `Vuln lookups: ${JSON.stringify(vulnLookups, null, 2)}\n\n` +
        `Write a short findings report.`,
    });

    return {
      ok: findings.length === 0,
      expertId: "dependency-auditor",
      summary:
        `${manifests.length} manifest(s) scanned; ${uniquePackages.size} unique dep(s); ${findings.length} finding(s)`,
      findings,
      data: {
        manifests,
        uniqueDependencies: Array.from(uniquePackages),
        vulnLookups,
        llmBackend: llmResponse.backend,
      },
      transcript: llmResponse.transcript,
      runtimeMs: Date.now() - start,
    };
  },
};
