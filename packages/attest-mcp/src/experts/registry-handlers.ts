/**
 * experts/registry-handlers.ts — in-process handler registry.
 *
 * Separate module from `registry.ts` (the attest-source-driven primary
 * agent catalog) because the two serve different consumers:
 *   - `registry.ts` enumerates every primary attest agent and is the
 *     authoritative discovery surface for sibling BDK agents.
 *   - this module registers only the Shape-C in-process handlers the
 *     server actually runs, and exposes them to the Cedar policy engine
 *     and the `invoke_expert[_<id>]` dispatcher.
 *
 * Handlers register via `registerInProcessExpert(handler)`, which the
 * server calls at construction (see `src/server.ts`). The registry is
 * module-scoped and reset by tests via `resetHandlerRegistry()`.
 */

import type { InProcessExpertHandler } from "./types.js";
import { secretsScannerHandler } from "./handlers/secrets-scanner.js";
import { dependencyAuditorHandler } from "./handlers/dependency-auditor.js";
import { semgrepRunnerHandler } from "./handlers/semgrep-runner.js";

const registry: Map<string, InProcessExpertHandler> = new Map();

export function registerInProcessExpert(handler: InProcessExpertHandler): void {
  if (!handler.id || !/^[a-z0-9][a-z0-9-]*$/.test(handler.id)) {
    throw new Error(
      `registerInProcessExpert: invalid id ${JSON.stringify(handler.id)} — must be kebab-case`,
    );
  }
  if (registry.has(handler.id)) {
    throw new Error(`registerInProcessExpert: id already registered: ${handler.id}`);
  }
  registry.set(handler.id, handler);
}

export function listInProcessHandlers(): InProcessExpertHandler[] {
  return Array.from(registry.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function getInProcessHandler(id: string): InProcessExpertHandler | undefined {
  return registry.get(id);
}

export function hasInProcessHandler(id: string): boolean {
  return registry.has(id);
}

export function resetHandlerRegistry(): void {
  registry.clear();
}

/**
 * Convenience: register the three Shape-C reference handlers shipped
 * with this PR. Called from `buildServer()`. Idempotent — a second
 * invocation is a no-op (first-write wins). Tests that want a cleaner
 * state call `resetHandlerRegistry()` first.
 */
export function registerReferenceHandlers(): void {
  if (hasInProcessHandler("secrets-scanner")) return;
  registerInProcessExpert(secretsScannerHandler);
  registerInProcessExpert(dependencyAuditorHandler);
  registerInProcessExpert(semgrepRunnerHandler);
}
