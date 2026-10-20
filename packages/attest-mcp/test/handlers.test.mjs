// handlers.test.mjs — reference handler smoke tests.
// Each handler is exercised end-to-end against a disposable workspace so
// the test suite proves the capability spectrum is wired correctly.

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { secretsScannerHandler } from "../dist/experts/handlers/secrets-scanner.js";
import { dependencyAuditorHandler } from "../dist/experts/handlers/dependency-auditor.js";
import { semgrepRunnerHandler } from "../dist/experts/handlers/semgrep-runner.js";
import { setLlmBackend } from "../dist/experts/handlers/llm.js";

const DETERMINISTIC_BACKEND = {
  id: "test-stub",
  async complete(req) {
    return {
      text: "stub-llm-response",
      backend: "test-stub",
      transcript: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
        { role: "assistant", content: "stub-llm-response" },
      ],
    };
  },
};

function freshWorkspace(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("secrets-scanner finds a candidate AWS access key", async () => {
  setLlmBackend(DETERMINISTIC_BACKEND);
  const root = freshWorkspace("ssec-");
  writeFileSync(join(root, "config.yaml"), "aws_key: AKIAIOSFODNN7EXAMPLE\n");
  writeFileSync(join(root, "safe.txt"), "no secrets here\n");

  const out = await secretsScannerHandler.invoke({ goal: "scan for leaks", projectRoot: root });
  assert.equal(out.expertId, "secrets-scanner");
  assert.ok(out.findings.some((f) => f.category === "secret:aws-access-key-id"));
  assert.equal(out.data.llmBackend, "test-stub");
  rmSync(root, { recursive: true, force: true });
  setLlmBackend(null);
});

test("secrets-scanner reports clean when nothing matches", async () => {
  setLlmBackend(DETERMINISTIC_BACKEND);
  const root = freshWorkspace("ssec-");
  writeFileSync(join(root, "clean.md"), "This file has no secret patterns.\n");
  const out = await secretsScannerHandler.invoke({ goal: "scan", projectRoot: root });
  assert.equal(out.ok, true);
  assert.equal(out.findings.length, 0);
  rmSync(root, { recursive: true, force: true });
  setLlmBackend(null);
});

test("dependency-auditor flags a non-permissive license", async () => {
  setLlmBackend(DETERMINISTIC_BACKEND);
  const root = freshWorkspace("dep-");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "demo", version: "1.0.0", license: "GPL-3.0-only" }),
  );
  // Point dependency-auditor at a non-existent OSV URL so no real network goes out.
  process.env.ATTEST_VULN_DB_URL = "https://example.invalid/osv/";
  const out = await dependencyAuditorHandler.invoke({ goal: "audit licenses", projectRoot: root });
  assert.ok(
    out.findings.some((f) => f.category === "license:non-permissive"),
    `expected non-permissive finding, got ${JSON.stringify(out.findings)}`,
  );
  rmSync(root, { recursive: true, force: true });
  delete process.env.ATTEST_VULN_DB_URL;
  setLlmBackend(null);
});

test("dependency-auditor is clean for MIT", async () => {
  setLlmBackend(DETERMINISTIC_BACKEND);
  const root = freshWorkspace("dep-");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "demo", version: "1.0.0", license: "MIT" }),
  );
  process.env.ATTEST_VULN_DB_URL = "https://example.invalid/osv/";
  const out = await dependencyAuditorHandler.invoke({ goal: "audit", projectRoot: root });
  assert.equal(out.ok, true);
  rmSync(root, { recursive: true, force: true });
  delete process.env.ATTEST_VULN_DB_URL;
  setLlmBackend(null);
});

test("semgrep-runner mock runner returns a clean report", async () => {
  setLlmBackend(DETERMINISTIC_BACKEND);
  const root = freshWorkspace("sem-");
  const out = await semgrepRunnerHandler.invoke({
    goal: "scan with semgrep",
    projectRoot: root,
    args: { runner: "mock" },
  });
  assert.equal(out.expertId, "semgrep-runner");
  // mock runner emits an empty results array, so there should be no semgrep findings.
  assert.ok(out.findings.every((f) => !f.category.startsWith("semgrep:") || f.category === "semgrep:no-runner"));
  assert.equal(out.data.semgrepFindingCount, 0);
  rmSync(root, { recursive: true, force: true });
  setLlmBackend(null);
});

test("semgrep-runner reports when no runner is available", async () => {
  setLlmBackend(DETERMINISTIC_BACKEND);
  const root = freshWorkspace("sem-");
  // Force no-runner path.
  const savedPath = process.env.PATH;
  const savedCmd = process.env.ATTEST_SEMGREP_COMMAND;
  const savedForceMock = process.env.ATTEST_SEMGREP_FORCE_MOCK;
  process.env.PATH = "";
  delete process.env.ATTEST_SEMGREP_COMMAND;
  delete process.env.ATTEST_SEMGREP_FORCE_MOCK;
  try {
    const out = await semgrepRunnerHandler.invoke({ goal: "scan", projectRoot: root });
    assert.equal(out.ok, false);
    assert.ok(out.findings.some((f) => f.category === "semgrep:no-runner"));
  } finally {
    if (savedPath !== undefined) process.env.PATH = savedPath;
    else delete process.env.PATH;
    if (savedCmd !== undefined) process.env.ATTEST_SEMGREP_COMMAND = savedCmd;
    if (savedForceMock !== undefined) process.env.ATTEST_SEMGREP_FORCE_MOCK = savedForceMock;
    rmSync(root, { recursive: true, force: true });
    setLlmBackend(null);
  }
});
