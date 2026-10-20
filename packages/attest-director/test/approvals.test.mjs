// Agent-side approval reply + marker parsers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPROVAL_MARKER_RE,
  extractApprovalId,
  parseApprovalReply,
} from "../bot/lib/approvals.ts";

test("parseApprovalReply picks up bare /approve", () => {
  assert.deepEqual(parseApprovalReply("/approve"), { verb: "approve" });
});

test("parseApprovalReply picks up /approve <id> <note>", () => {
  assert.deepEqual(parseApprovalReply("/approve approval_abc lgtm, go"), {
    verb: "approve",
    approvalId: "approval_abc",
    note: "lgtm, go",
  });
});

test("parseApprovalReply picks up /deny", () => {
  assert.deepEqual(parseApprovalReply("/deny approval_x not now"), {
    verb: "deny",
    approvalId: "approval_x",
    note: "not now",
  });
});

test("parseApprovalReply ignores non-matching bodies", () => {
  for (const body of ["", null, undefined, "thumbs up", "Approve please"]) {
    assert.equal(parseApprovalReply(body), null);
  }
});

test("extractApprovalId pulls id + task from the hidden marker", () => {
  const body =
    'ignore me <!-- attest-director:approval id="approval_x" task="task_1" --> ok';
  assert.deepEqual(extractApprovalId(body), {
    approvalId: "approval_x",
    taskId: "task_1",
  });
});

test("extractApprovalId returns {} on missing marker", () => {
  assert.deepEqual(extractApprovalId("no marker here"), {});
  assert.deepEqual(extractApprovalId(""), {});
  assert.deepEqual(extractApprovalId(null), {});
});

test("APPROVAL_MARKER_RE is case-insensitive and tolerates extra whitespace", () => {
  const body = '<!--  attest-director:approval  id="approval_X"  -->';
  const match = APPROVAL_MARKER_RE.exec(body);
  assert.ok(match);
});
