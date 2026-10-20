import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractIntents,
  fingerprint,
} from "../dist/intent.js";

test("extractIntents classifies a bug + a feature in one paragraph pass", () => {
  const text = [
    "Anya noticed that the login page is broken when the password field is empty.",
    "",
    "We should also add support for passkeys next quarter.",
  ].join("\n");
  const result = extractIntents({ text, sourceEpisodeId: "ep-1" });
  assert.ok(result.intents.length >= 2, "expected at least two intents");
  const kinds = result.intents.map((i) => i.kind);
  assert.ok(kinds.includes("bug"), `kinds=${kinds.join(",")}`);
  assert.ok(kinds.includes("new-feature"), `kinds=${kinds.join(",")}`);
  for (const i of result.intents) {
    assert.ok(i.confidence >= 0 && i.confidence <= 1);
    assert.ok(i.fingerprint.length === 32);
    assert.ok(i.sourceEpisode === "ep-1");
  }
});

test("fingerprint is stable for semantically-close strings", () => {
  const a = fingerprint("ship /ceo nudge me command");
  const b = fingerprint("Ship /ceo nudge me command.");
  const c = fingerprint("Add passkey support");
  assert.equal(a, b, "normalized spacing + case + punctuation collapse");
  assert.notEqual(a, c);
});

test("extractIntents skips short paragraphs and empty input", () => {
  assert.equal(extractIntents({ text: "" }).intents.length, 0);
  assert.equal(extractIntents({ text: "ok." }).intents.length, 0);
});
