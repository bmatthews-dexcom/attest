import { test } from "node:test";
import assert from "node:assert/strict";

const {
  approvalMarker,
  extractApprovalId,
  parseApprovalReply,
  renderApprovalCommentBody,
} = await import("../bot/lib/github-approval.ts");

test("approvalMarker + extractApprovalId round-trip", () => {
  const marker = approvalMarker("approval_abc", "task_xyz");
  assert.ok(marker.includes("attest:approval"));
  assert.ok(marker.includes("approval_abc"));
  const extracted = extractApprovalId(`Some comment body\n${marker}\n`);
  assert.equal(extracted.approvalId, "approval_abc");
  assert.equal(extracted.taskId, "task_xyz");
});

test("extractApprovalId handles missing marker gracefully", () => {
  assert.deepEqual(extractApprovalId("no marker here"), {});
  assert.deepEqual(extractApprovalId(""), {});
  assert.deepEqual(extractApprovalId(null), {});
});

test("parseApprovalReply recognizes /approve and /deny on the first non-blank line", () => {
  assert.deepEqual(parseApprovalReply("/approve"), { verb: "approve" });
  assert.deepEqual(parseApprovalReply("/deny"), { verb: "deny" });
  assert.deepEqual(parseApprovalReply("  /approve  "), { verb: "approve" });
});

test("parseApprovalReply captures an explicit approval id", () => {
  assert.deepEqual(
    parseApprovalReply("/approve approval_abc123"),
    { verb: "approve", approvalId: "approval_abc123" },
  );
  assert.deepEqual(
    parseApprovalReply("/deny approval_abc123 looks sketchy"),
    { verb: "deny", approvalId: "approval_abc123", note: "looks sketchy" },
  );
});

test("parseApprovalReply ignores lines after the first", () => {
  const reply = parseApprovalReply("/approve\n\nblah blah");
  assert.deepEqual(reply, { verb: "approve" });
});

test("parseApprovalReply rejects non-slash content", () => {
  assert.equal(parseApprovalReply("approve"), null);
  assert.equal(parseApprovalReply("/autopilot run something"), null);
  assert.equal(parseApprovalReply(""), null);
});

test("renderApprovalCommentBody includes capability, prompt, and the marker", () => {
  const body = renderApprovalCommentBody({
    approvalId: "approval_abc",
    taskId: "task_xyz",
    capability: "write:src",
    prompt: "semgrep-fix wants to edit src/auth.ts",
    destructiveOp: "write:src",
    target: "src/auth.ts",
    requestedByExpertId: "semgrep-fix",
    timeoutHours: 24,
    autonomyMode: "auto",
  });
  assert.ok(body.includes("write:src"));
  assert.ok(body.includes("semgrep-fix wants to edit"));
  assert.ok(body.includes("src/auth.ts"));
  assert.ok(body.includes("/approve"));
  assert.ok(body.includes("/deny"));
  assert.ok(body.includes("auto-denies after"));
  assert.ok(body.includes("approval_abc"));
  assert.ok(body.includes("attest:approval"));
});
