// catalog smoke — covers src/validators/catalog.ts.
// Tests consume dist/ (built by `npm run build`, which test depends on) so
// NodeNext .js imports resolve without needing a TS loader at test time.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  listValidators,
  validatorByToolName,
  categorize,
} from "../dist/validators/catalog.js";
import { attestRoot } from "../dist/sources.js";

const EXCLUDED = new Set([
  "_lib.sh",
  "_lib_sdlc_config.sh",
  "run-coverage-loop.sh",
  "run-handoff-gates.sh",
  "validate-phase-gate.sh",
  "validate-scope.match.test.sh",
  "README.md",
]);

test("catalog finds every validate-*.sh except the documented exclusions", () => {
  const dir = join(attestRoot().root, "scripts", "validators");
  const onDisk = readdirSync(dir).filter(
    (f) =>
      !EXCLUDED.has(f) && f.startsWith("validate-") && f.endsWith(".sh"),
  );
  const catalog = listValidators();
  assert.equal(catalog.length, onDisk.length);
  assert.ok(
    catalog.length >= 70,
    `expected ~77 validators, got ${catalog.length}`,
  );
});

test("validator tool names are reversible", () => {
  const catalog = listValidators();
  for (const v of catalog) {
    assert.ok(/^validate_[a-z0-9_]+$/.test(v.toolName), v.toolName);
    assert.equal(validatorByToolName(v.toolName)?.id, v.id);
  }
});

test("categories are assigned deterministically", () => {
  assert.equal(categorize("owasp"), "security");
  assert.equal(categorize("architecture"), "architecture");
  assert.equal(categorize("tests"), "testing");
  assert.equal(categorize("api-coverage"), "api");
  assert.equal(categorize("release-readiness"), "release");
});
