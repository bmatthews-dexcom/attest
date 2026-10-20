// elicitation.test.mjs — HITL approval round-trip through a mocked
// elicitation transport.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  requestApprovalViaElicitation,
  elicitationTransport,
} from "../dist/elicitation/approval.js";

const BASE_REQUEST = {
  expertId: "writer",
  capability: { kind: "write:fs", scope: "src/" },
  reason: "edit a file",
  phase: "phase-4",
  autonomyMode: "interactive",
  toolName: "invoke_expert_writer",
};

test("requestApprovalViaElicitation returns null when accepted with confirm", async () => {
  const t = {
    async requestApproval(req) {
      assert.equal(req.expertId, "writer");
      return { outcome: "accepted", confirmedBy: "test" };
    },
  };
  const r = await requestApprovalViaElicitation(t, BASE_REQUEST);
  assert.equal(r, null);
});

test("requestApprovalViaElicitation returns declined error", async () => {
  const t = {
    async requestApproval() {
      return { outcome: "declined", detail: "user said no" };
    },
  };
  const r = await requestApprovalViaElicitation(t, BASE_REQUEST);
  assert.ok(r);
  assert.equal(r.kind, "approval_required");
  assert.equal(r.outcome, "declined");
});

test("requestApprovalViaElicitation returns unavailable error", async () => {
  const t = {
    async requestApproval() {
      return { outcome: "unavailable", detail: "client has no elicitation capability" };
    },
  };
  const r = await requestApprovalViaElicitation(t, BASE_REQUEST);
  assert.ok(r);
  assert.equal(r.outcome, "unavailable");
});

test("requestApprovalViaElicitation returns error on transport throw", async () => {
  const t = {
    async requestApproval() {
      return { outcome: "error", detail: "boom" };
    },
  };
  const r = await requestApprovalViaElicitation(t, BASE_REQUEST);
  assert.ok(r);
  assert.equal(r.outcome, "error");
});

test("elicitationTransport short-circuits when client does not advertise elicitation", async () => {
  // Minimal McpServer-like stub for the capability check.
  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ tools: {} }),
      async elicitInput() {
        throw new Error("should not be called when capability is absent");
      },
    },
  };
  const t = elicitationTransport(fakeServer);
  const outcome = await t.requestApproval(BASE_REQUEST);
  assert.equal(outcome.outcome, "unavailable");
});

test("elicitationTransport returns accepted when confirm === true", async () => {
  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ elicitation: {}, tools: {} }),
      async elicitInput(params) {
        assert.equal(params.mode, "form");
        assert.ok(params.message.includes("writer"));
        assert.ok(params.requestedSchema.properties.confirm);
        return { action: "accept", content: { confirm: true, note: "ok" } };
      },
    },
  };
  const t = elicitationTransport(fakeServer);
  const outcome = await t.requestApproval(BASE_REQUEST);
  assert.equal(outcome.outcome, "accepted");
});

test("elicitationTransport reports declined on cancel", async () => {
  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ elicitation: {} }),
      async elicitInput() {
        return { action: "cancel", content: undefined };
      },
    },
  };
  const t = elicitationTransport(fakeServer);
  const outcome = await t.requestApproval(BASE_REQUEST);
  assert.equal(outcome.outcome, "declined");
});

test("elicitationTransport treats accept-without-confirm as declined", async () => {
  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ elicitation: {} }),
      async elicitInput() {
        return { action: "accept", content: { confirm: false } };
      },
    },
  };
  const t = elicitationTransport(fakeServer);
  const outcome = await t.requestApproval(BASE_REQUEST);
  assert.equal(outcome.outcome, "declined");
});

test("elicitationTransport surfaces thrown errors as error outcome", async () => {
  const fakeServer = {
    server: {
      getClientCapabilities: () => ({ elicitation: {} }),
      async elicitInput() {
        throw new Error("transport broken");
      },
    },
  };
  const t = elicitationTransport(fakeServer);
  const outcome = await t.requestApproval(BASE_REQUEST);
  assert.equal(outcome.outcome, "error");
  assert.ok(outcome.detail.includes("transport broken"));
});
