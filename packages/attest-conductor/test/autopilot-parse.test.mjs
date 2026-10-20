import { test } from "node:test";
import assert from "node:assert/strict";

const { parseAutopilotCommand } = await import("../bot/lib/autopilot-parse.ts");

test("plain /autopilot <goal> parses with no autonomy override", () => {
  const parsed = parseAutopilotCommand("/autopilot harden the login flow");
  assert.deepEqual(parsed, { goal: "harden the login flow" });
});

test("--autonomy flag parses on either side of the goal", () => {
  assert.deepEqual(
    parseAutopilotCommand("/autopilot --autonomy approve-each harden the login flow"),
    { goal: "harden the login flow", autonomyMode: "approve-each" },
  );
  assert.deepEqual(
    parseAutopilotCommand("/autopilot harden the login flow --autonomy approve-destructive"),
    { goal: "harden the login flow", autonomyMode: "approve-destructive" },
  );
  assert.deepEqual(
    parseAutopilotCommand("/autopilot --autonomy=approve-each run"),
    { goal: "run", autonomyMode: "approve-each" },
  );
});

test("[autonomy: …] bracket shape parses on either side", () => {
  assert.deepEqual(
    parseAutopilotCommand("/autopilot harden the login flow [autonomy: approve-each]"),
    { goal: "harden the login flow", autonomyMode: "approve-each" },
  );
  assert.deepEqual(
    parseAutopilotCommand("/autopilot [autonomy: approve-destructive] harden the login flow"),
    { goal: "harden the login flow", autonomyMode: "approve-destructive" },
  );
});

test("unknown autonomy value is dropped (fail soft, run as auto)", () => {
  const parsed = parseAutopilotCommand("/autopilot --autonomy yolo harden the login flow");
  assert.deepEqual(parsed, { goal: "harden the login flow" });
});

test("multi-line GitHub issue body still parses the slash command and body text", () => {
  const parsed = parseAutopilotCommand(
    [
      "/autopilot [autonomy: approve-each]",
      "",
      "harden the login flow",
      "",
      "Specifically the refresh token path.",
    ].join("\n"),
  );
  assert.ok(parsed);
  assert.equal(parsed.autonomyMode, "approve-each");
  assert.ok(parsed.goal.includes("harden the login flow"));
});

test("not-an-autopilot comment returns null", () => {
  assert.equal(parseAutopilotCommand("/approve"), null);
  assert.equal(parseAutopilotCommand("just a chat"), null);
  assert.equal(parseAutopilotCommand(""), null);
  assert.equal(parseAutopilotCommand(null), null);
});

test("/autopilot with no goal returns null", () => {
  assert.equal(parseAutopilotCommand("/autopilot"), null);
  assert.equal(parseAutopilotCommand("/autopilot   "), null);
});
