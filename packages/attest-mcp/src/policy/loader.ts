/**
 * policy/loader.ts — read the Cedar schema and seed policies from disk.
 *
 * At runtime the files live next to the compiled source tree:
 *   dist/policy/schema.cedarschema
 *   dist/policy/policies/*.cedar
 *
 * The TypeScript compiler does not copy non-`.ts` files; `scripts/copy-policy-sources.mjs`
 * (invoked from `npm run build`) mirrors `src/policy/` into `dist/policy/`
 * so the resolver below finds the Cedar sources whether we're running from
 * `dist/` (production) or `src/` (dev tests through tsx — not used today).
 *
 * The `ATTEST_POLICY_BUNDLE_DIR` env var overrides the default path, which
 * is how a sibling worker or operator can hot-reload a custom bundle
 * (per Shape-C design doc §Open questions on bundle hot-reload).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `dist/policy/` at runtime; `src/policy/` from a `tsx` dev shell. */
const DEFAULT_BUNDLE_DIR = HERE;

export interface PolicyBundle {
  readonly schemaPath: string;
  readonly schemaText: string;
  readonly policies: ReadonlyArray<{ readonly id: string; readonly path: string; readonly text: string }>;
}

let cached: PolicyBundle | null = null;

export function resetPolicyBundleCache(): void {
  cached = null;
}

export function loadPolicyBundle(): PolicyBundle {
  if (cached) return cached;
  const dir = resolveBundleDir();
  const schemaPath = join(dir, "schema.cedarschema");
  if (!existsSync(schemaPath)) {
    throw new Error(
      `attest-mcp policy bundle: schema.cedarschema not found at ${schemaPath}. ` +
        `Did \`npm run build\` fail to copy src/policy/ into dist/policy/?`,
    );
  }
  const schemaText = readFileSync(schemaPath, "utf8");

  const policiesDir = join(dir, "policies");
  if (!existsSync(policiesDir) || !statSync(policiesDir).isDirectory()) {
    throw new Error(
      `attest-mcp policy bundle: policies/ directory not found at ${policiesDir}`,
    );
  }
  const files = readdirSync(policiesDir)
    .filter((f) => f.endsWith(".cedar"))
    .sort();
  const policies = files.map((f) => {
    const path = join(policiesDir, f);
    return {
      id: basename(f, ".cedar"),
      path,
      text: readFileSync(path, "utf8"),
    };
  });

  cached = { schemaPath, schemaText, policies };
  return cached;
}

function resolveBundleDir(): string {
  const override = process.env.ATTEST_POLICY_BUNDLE_DIR;
  if (override && override.trim()) {
    const abs = resolve(override);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      throw new Error(
        `ATTEST_POLICY_BUNDLE_DIR=${override} is not an existing directory`,
      );
    }
    return abs;
  }
  return DEFAULT_BUNDLE_DIR;
}
