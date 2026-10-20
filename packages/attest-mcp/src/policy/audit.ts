/**
 * policy/audit.ts — append-only JSONL audit log of every policy decision.
 *
 * One record per `evaluatePolicy` call, written synchronously (append
 * failures surface at the call-site; a logging bug cannot silently drop a
 * deny decision). The log rotates daily by filename: today's path is
 * `<base>.<yyyy-mm-dd>.jsonl` once an existing undated file would roll
 * over. Consumers (SIEM, dashboard, offline review) stream the directory.
 *
 * Default path: `./audit/policy.jsonl` under the server's cwd. Override
 * with `ATTEST_POLICY_AUDIT_LOG`.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PolicyAuditRecord } from "./types.js";

const DEFAULT_AUDIT_PATH = "./audit/policy.jsonl";

export interface AuditSink {
  write(record: PolicyAuditRecord): void;
}

/**
 * Resolve where the audit log should land. Does NOT create the file; that
 * happens on the first `write()`.
 */
export function resolveAuditPath(): string {
  const override = process.env.ATTEST_POLICY_AUDIT_LOG;
  return (override && override.trim()) || DEFAULT_AUDIT_PATH;
}

export function createAuditSink(path: string = resolveAuditPath()): AuditSink {
  const dir = dirname(path);
  let lastRotationDay = currentDay();

  const ensureDir = () => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  };

  const rotateIfNeeded = () => {
    const today = currentDay();
    if (today === lastRotationDay) return;
    // The previous day's log (still named `<base>`) gets rotated to
    // `<base>.<prev-day>.jsonl`. The file may not exist yet if nothing
    // was logged on the previous day; the rename is best-effort.
    if (existsSync(path)) {
      try {
        const stat = statSync(path);
        if (stat.isFile() && stat.size > 0) {
          const rotated = rotatedPathFor(path, lastRotationDay);
          renameSync(path, rotated);
        }
      } catch {
        // If rotation fails we keep writing to the live file — losing a
        // day boundary is strictly better than losing audit records.
      }
    }
    lastRotationDay = today;
  };

  return {
    write(record: PolicyAuditRecord): void {
      ensureDir();
      rotateIfNeeded();
      appendFileSync(path, JSON.stringify(record) + "\n", "utf8");
    },
  };
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function rotatedPathFor(livePath: string, day: string): string {
  const dir = dirname(livePath);
  // live file is like `policy.jsonl`; rotated form is `policy.<day>.jsonl`.
  // If the user passed `audit.log` we rotate to `audit.<day>.log`.
  const base = livePath.slice(dir.length + 1); // strip dir + sep
  const lastDot = base.lastIndexOf(".");
  if (lastDot <= 0) return join(dir, `${base}.${day}`);
  return join(dir, `${base.slice(0, lastDot)}.${day}${base.slice(lastDot)}`);
}

export const _internal = { currentDay, rotatedPathFor };
