import { test } from "node:test";
import assert from "node:assert/strict";

const {
  parseInvokeExpertResult,
  parsePreDispatchResult,
  unwrapMcpPayload,
  InvokeExpertParseError,
} = await import("../bot/lib/invoke-expert.ts");

test("unwrapMcpPayload extracts the inner JSON text", () => {
  const payload = { kind: "expert_output", result: {}, summary: "x" };
  const wrapped = {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
  assert.deepEqual(unwrapMcpPayload(wrapped), payload);
  assert.deepEqual(unwrapMcpPayload(payload), payload);
});

test("parseInvokeExpertResult accepts the three Shape-C outcomes", () => {
  const expertOutput = parseInvokeExpertResult(
    { kind: "expert_output", result: { gaps: [] }, summary: "ok" },
    "security-auditor",
  );
  assert.equal(expertOutput.kind, "expert_output");
  assert.equal(expertOutput.summary, "ok");

  const policyDenied = parseInvokeExpertResult(
    { kind: "policy_denied", reason: "not allowed", capability: "write:src", ruleId: "r42" },
    "code-reviewer",
  );
  assert.equal(policyDenied.kind, "policy_denied");
  assert.equal(policyDenied.capability, "write:src");

  const approvalRequired = parseInvokeExpertResult(
    {
      kind: "approval_required",
      capability: "publish:npm",
      approver: "maintainer",
      prompt: "ship v3.10",
    },
    "release-manager",
  );
  assert.equal(approvalRequired.kind, "approval_required");
  assert.equal(approvalRequired.capability, "publish:npm");
});

test("parseInvokeExpertResult tolerates the camelCase shapes", () => {
  const out = parseInvokeExpertResult(
    { kind: "ExpertOutput", result: {}, summary: "x" },
    "guide",
  );
  assert.equal(out.kind, "expert_output");
});

test("parseInvokeExpertResult throws InvokeExpertParseError on unknown kind", () => {
  assert.throws(
    () => parseInvokeExpertResult({ kind: "whatever" }, "x"),
    (err) => err instanceof InvokeExpertParseError,
  );
  assert.throws(
    () => parseInvokeExpertResult("not an object", "x"),
    (err) => err instanceof InvokeExpertParseError,
  );
});

test("parsePreDispatchResult accepts the three decisions", () => {
  for (const decision of ["allow", "deny", "requires-approval"]) {
    const parsed = parsePreDispatchResult({ decision, reason: "r" });
    assert.equal(parsed.decision, decision);
  }
});

test("parsePreDispatchResult rejects unknown decisions", () => {
  assert.throws(
    () => parsePreDispatchResult({ decision: "maybe" }),
    (err) => err instanceof InvokeExpertParseError,
  );
});
