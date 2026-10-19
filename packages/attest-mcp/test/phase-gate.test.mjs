// phase-gate smoke — covers src/phase-gate/state-machine.ts + check.ts.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { phaseGateCheck } from "../dist/phase-gate/check.js";
import {
  PHASES,
  phaseById,
  effectiveValidators,
} from "../dist/phase-gate/state-machine.js";
import { attestRoot } from "../dist/sources.js";

test("PHASES covers every id declared in the shell case block", () => {
  const script = readFileSync(
    join(attestRoot().root, "scripts", "validators", "validate-phase-gate.sh"),
    "utf8",
  );
  const found = new Set();
  const caseStart = script.indexOf('case "$phase" in');
  const body = caseStart >= 0 ? script.slice(caseStart) : script;
  for (const line of body.split("\n")) {
    const m = line.match(/^\s{4}([a-zA-Z0-9.-]+)\)\s*$/);
    if (m) found.add(m[1]);
  }
  found.delete("*");

  const ourIds = new Set(PHASES.map((p) => p.id));
  for (const id of found) {
    assert.ok(ourIds.has(id), `shell declares phase "${id}" but PHASES does not`);
  }
  for (const id of ourIds) {
    assert.ok(found.has(id), `PHASES declares "${id}" but shell does not`);
  }
});

test("every validator our mirror lists for a phase appears in the shell", () => {
  const script = readFileSync(
    join(attestRoot().root, "scripts", "validators", "validate-phase-gate.sh"),
    "utf8",
  );
  for (const phase of PHASES) {
    for (const v of phase.validators) {
      assert.ok(
        script.includes(`"${v}"`),
        `${phase.id} lists ${v}, but it is not referenced in validate-phase-gate.sh`,
      );
    }
  }
});

test("effectiveValidators appends the systemic challenger gate when base is non-empty", () => {
  const phase3 = phaseById("phase-3");
  const eff = effectiveValidators(phase3);
  assert.ok(eff.includes("validate-challenger-gate.sh"));
  const phase0 = phaseById("phase-0");
  assert.deepEqual(effectiveValidators(phase0), []);
});

test("phaseGateCheck returns a sensible result for a trivial transition", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "attest-mcp-phase-"));
  try {
    const result = await phaseGateCheck({
      currentPhase: "phase-0",
      nextPhase: "phase-1",
      projectRoot: tmp,
      runValidators: false,
    });
    assert.equal(result.transition.from, "phase-0");
    assert.equal(result.transition.to, "phase-1");
    assert.equal(result.transition.allowed, true);
    assert.equal(result.ok, false);
    assert.ok(
      result.blockers.some((b) => b.kind === "missing-prereq-receipt"),
      "fresh repo should block on missing phase-0 receipt",
    );
    assert.ok(
      result.blockers.some((b) => b.kind === "missing-required-file"),
      "fresh repo should block on missing phase-1 files",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("phaseGateCheck rejects an unknown next phase", async () => {
  const result = await phaseGateCheck({
    currentPhase: "phase-0",
    nextPhase: "phase-nonsense",
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.kind === "unknown-phase"));
});
