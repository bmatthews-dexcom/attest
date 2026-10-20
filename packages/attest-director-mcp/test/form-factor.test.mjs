// Form-factor decision tree. See docs §5.1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickFormFactor } from "../src/form-factor/pick.ts";

const baseCaps = {
  reads: [],
  writes: [],
  network: [],
  mcp_tools: [],
  shell_patterns: [],
};

test("preference 'skill' is honoured verbatim", () => {
  const res = pickFormFactor({ capabilities: baseCaps, preference: "skill" });
  assert.equal(res.decision.pick, "skill");
  assert.equal(res.decision.ruleFired, "preference");
});

test("Rule 1 — writes:src forces sandbox-bdk-agent", () => {
  const res = pickFormFactor({
    capabilities: { ...baseCaps, writes: ["src/handlers/x.ts"] },
  });
  assert.equal(res.decision.pick, "sandbox-bdk-agent");
  assert.equal(res.decision.ruleFired, "rule-1");
});

test("Rule 1 — destructive shell forces sandbox-bdk-agent", () => {
  const res = pickFormFactor({
    capabilities: { ...baseCaps, shell_patterns: ["rm -rf dist"] },
  });
  assert.equal(res.decision.pick, "sandbox-bdk-agent");
  assert.equal(res.decision.ruleFired, "rule-1");
});

test("Rule 1 — git push forces sandbox-bdk-agent", () => {
  const res = pickFormFactor({
    capabilities: { ...baseCaps, shell_patterns: ["git push origin main"] },
  });
  assert.equal(res.decision.pick, "sandbox-bdk-agent");
  assert.equal(res.decision.ruleFired, "rule-1");
});

test("Rule 1 — npm publish forces sandbox-bdk-agent", () => {
  const res = pickFormFactor({
    capabilities: { ...baseCaps, shell_patterns: ["npm publish --access public"] },
  });
  assert.equal(res.decision.pick, "sandbox-bdk-agent");
  assert.equal(res.decision.ruleFired, "rule-1");
});

test("Rule 2 — docs-only + mcp tools + safe shell → in-process-handler", () => {
  const res = pickFormFactor({
    capabilities: {
      ...baseCaps,
      writes: ["docs/release-notes/**"],
      mcp_tools: ["github:list_commits"],
    },
  });
  assert.equal(res.decision.pick, "in-process-handler");
  assert.equal(res.decision.ruleFired, "rule-2");
});

test("Rule 3 — read-only + advisory + editor-only → skill", () => {
  const res = pickFormFactor({
    capabilities: {
      ...baseCaps,
      reads: ["workspace://**"],
      network: ["https://docs.example.com/**"],
    },
    advisoryEditorOnly: true,
  });
  assert.equal(res.decision.pick, "skill");
  assert.equal(res.decision.ruleFired, "rule-3");
});

test("Rule 4 — long-running analysis without source writes → in-process-handler", () => {
  const res = pickFormFactor({
    capabilities: baseCaps,
    longRunningStreaming: true,
  });
  assert.equal(res.decision.pick, "in-process-handler");
  assert.equal(res.decision.ruleFired, "rule-4");
});

test("Default — no sandbox-forcing capability → in-process-handler", () => {
  const res = pickFormFactor({ capabilities: baseCaps });
  assert.equal(res.decision.pick, "in-process-handler");
  assert.equal(res.decision.ruleFired, "default");
});

test("every decision ships a non-empty rationale + two alternatives when rule-fired", () => {
  const res = pickFormFactor({
    capabilities: { ...baseCaps, writes: ["src/x.ts"] },
  });
  assert.ok(res.decision.rationale.length > 0);
  assert.ok(res.decision.alternatives.length >= 2);
});
