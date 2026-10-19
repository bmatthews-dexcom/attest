// end-to-end smoke — run a real validator against the attest checkout.
//
// We run against the attest repo root (two parents up from the package),
// not against ATTEST_ROOT / the bundled copy, because many validators (e.g.
// validate-no-ascii-art) scan `docs/*.md` and expect that directory to
// exist. The bundled tree intentionally does not ship docs/.

import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runValidator } from "../dist/validators/run.js";
import { listValidators } from "../dist/validators/catalog.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ATTEST_REPO = resolve(HERE, "..", "..", "..");

test("validate-no-ascii-art.sh runs end-to-end against the attest checkout", async () => {
  if (!existsSync(resolve(ATTEST_REPO, "docs"))) {
    // Running under a stripped environment that has no docs/ (e.g. a packed
    // tarball). Skip rather than false-fail.
    return;
  }
  const descriptor = listValidators().find((v) => v.id === "no-ascii-art");
  assert.ok(descriptor, "no-ascii-art validator must be in the catalog");

  const result = await runValidator(descriptor, {
    projectRoot: ATTEST_REPO,
    timeoutMs: 60_000,
  });
  // Exit 2 means the validator itself errored (bash incompat etc).
  assert.notEqual(
    result.exitCode,
    2,
    `validator errored (exit 2) — stderr was:\n${result.stderr}`,
  );
  assert.ok(result.envelope, "expected parsed JSON envelope on stdout");
  assert.equal(result.envelope.validator, "validate-no-ascii-art");
  assert.equal(typeof result.envelope.gaps, "number");
  assert.ok(Array.isArray(result.findings));
});

test("validate-file-size.sh runs end-to-end (fast, universal validator)", async () => {
  const descriptor = listValidators().find((v) => v.id === "file-size");
  assert.ok(descriptor, "file-size validator must be in the catalog");

  const result = await runValidator(descriptor, {
    projectRoot: ATTEST_REPO,
    timeoutMs: 60_000,
  });
  assert.notEqual(
    result.exitCode,
    2,
    `validator errored (exit 2) — stderr was:\n${result.stderr}`,
  );
  assert.ok(result.envelope, "expected parsed JSON envelope on stdout");
  assert.equal(result.envelope.validator, "validate-file-size");
});
