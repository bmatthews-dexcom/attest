import { test } from "node:test";
import assert from "node:assert/strict";
import { stubCreateExpert } from "../dist/director.js";

const sampleInput = {
  role: "fireflies-ingester",
  example_task: "watch the product-weeklies folder and extract action items",
  inputs: ["folder_path"],
  outputs: ["commitments"],
  urgency: "medium",
};

test("stub returns `director not yet deployed` when the flag is off", () => {
  const result = stubCreateExpert(sampleInput, { ATTEST_DIRECTOR_ENABLED: "" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "stubbed");
  assert.match(result.message, /director/i);
  assert.deepEqual(result.request.inputs, ["folder_path"]);
});

test("stub stays stubbed even when the flag is on (Director worker replaces impl)", () => {
  const result = stubCreateExpert(sampleInput, {
    ATTEST_DIRECTOR_ENABLED: "true",
  });
  assert.equal(result.status, "stubbed");
  assert.match(result.message, /Director worker/);
});
