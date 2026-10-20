// policy-audit.test.mjs — audit sink file layout + daily rotation.

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAuditSink, _internal } from "../dist/policy/audit.js";

test("audit sink writes JSONL and creates parent directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "attest-audit-"));
  const path = join(dir, "nested", "policy.jsonl");
  const sink = createAuditSink(path);
  sink.write({
    ts: "2026-10-20T12:00:00.000Z",
    mode: "ENFORCE",
    decision: "allow",
    effective: "allow",
    expertId: "secrets-scanner",
    cluster: "security",
    capability: { kind: "read:fs" },
    phase: "phase-4",
    autonomyMode: "interactive",
    toolName: "invoke_expert_secrets_scanner",
    reason: "permitted by 10-read-fs-always-allowed",
    determiningPolicies: ["10-read-fs-always-allowed"],
    erroringPolicies: [],
  });
  assert.ok(existsSync(path));
  const text = readFileSync(path, "utf8").trim();
  const lines = text.split("\n");
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.expertId, "secrets-scanner");
  assert.equal(parsed.decision, "allow");
});

test("rotation path convention preserves the file extension", () => {
  const live = "/tmp/audit/policy.jsonl";
  assert.equal(
    _internal.rotatedPathFor(live, "2026-10-19"),
    "/tmp/audit/policy.2026-10-19.jsonl",
  );
  const live2 = "/var/log/attest/audit.log";
  assert.equal(
    _internal.rotatedPathFor(live2, "2026-10-19"),
    "/var/log/attest/audit.2026-10-19.log",
  );
});

test("currentDay returns ISO yyyy-mm-dd", () => {
  const day = _internal.currentDay();
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
});
