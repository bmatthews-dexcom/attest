#!/usr/bin/env node
/**
 * copy-policy-sources.mjs — mirror non-TypeScript assets that the Shape-C
 * runtime loads at startup into `dist/`:
 *
 *   - `src/policy/schema.cedarschema` + `src/policy/policies/*.cedar`
 *     → `dist/policy/` (loaded by `src/policy/loader.ts`).
 *   - `src/experts/classification.generated.json`
 *     → `dist/experts/` (loaded by `src/experts/classification.ts`).
 *
 * The TypeScript compiler ignores non-`.ts` files, so without this step
 * the classification manifest + policy bundle would exist only in `src/`
 * and the shipped `dist/`-only package would fail at construction with
 * a bundle-missing error.
 *
 * Run from `npm run build` (post-tsc) and from `npm run bundle` so a
 * `--bundle`-only invocation also materialises these trees.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(SCRIPT_DIR, "..");
const SRC_POLICY = join(PKG_ROOT, "src", "policy");
const DIST_POLICY = join(PKG_ROOT, "dist", "policy");
const SRC_EXPERTS = join(PKG_ROOT, "src", "experts");
const DIST_EXPERTS = join(PKG_ROOT, "dist", "experts");

function copyPolicyTree() {
  if (!existsSync(SRC_POLICY)) {
    console.warn(`[copy-policy-sources] src/policy missing, skipping`);
    return 0;
  }

  mkdirSync(DIST_POLICY, { recursive: true });
  // Fresh copy for every build so a deleted .cedar file doesn't linger in dist/.
  const policiesDest = join(DIST_POLICY, "policies");
  if (existsSync(policiesDest)) rmSync(policiesDest, { recursive: true, force: true });
  mkdirSync(policiesDest, { recursive: true });

  let count = 0;

  const schemaSrc = join(SRC_POLICY, "schema.cedarschema");
  const schemaDest = join(DIST_POLICY, "schema.cedarschema");
  if (existsSync(schemaSrc)) {
    copyFileSync(schemaSrc, schemaDest);
    count += 1;
  }

  const srcPolicies = join(SRC_POLICY, "policies");
  if (existsSync(srcPolicies) && statSync(srcPolicies).isDirectory()) {
    for (const name of readdirSync(srcPolicies)) {
      if (!name.endsWith(".cedar")) continue;
      copyFileSync(join(srcPolicies, name), join(policiesDest, name));
      count += 1;
    }
  }

  return count;
}

function copyClassificationManifest() {
  const src = join(SRC_EXPERTS, "classification.generated.json");
  if (!existsSync(src)) {
    console.warn(`[copy-policy-sources] ${src} missing, skipping classification`);
    return 0;
  }
  mkdirSync(DIST_EXPERTS, { recursive: true });
  copyFileSync(src, join(DIST_EXPERTS, "classification.generated.json"));
  return 1;
}

function main() {
  const policyCount = copyPolicyTree();
  const classificationCount = copyClassificationManifest();
  console.log(
    `[copy-policy-sources] copied ${policyCount} Cedar file(s) into ${DIST_POLICY} ` +
      `and ${classificationCount} classification manifest(s) into ${DIST_EXPERTS}`,
  );
}

main();
