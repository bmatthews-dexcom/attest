/**
 * Director autonomy modes.
 *
 * Phase 1 lands with a single default (`draft-and-approve`) — every expert
 * surfaces an explicit Phase-5 approval card before deploy. The design doc
 * §12 #3 names one hook that is designed-in and defaults to false:
 *
 *   - `auto-for-repeat-role` — when the same role brief has previously been
 *     approved under this mode, auto-approve subsequent create-expert runs
 *     for the same `role` fingerprint. Flip requires explicit MCP elicitation
 *     against the Director's own fence inventory (never silent).
 *
 * The hook is modeled here, but every runtime path except `draft-and-approve`
 * must either be rejected at the policy gate (phase 1) or routed through an
 * explicit `request_approval` surface. See `src/policy/cedar.ts`.
 */
import { z } from "zod";

export const AUTONOMY_MODES = ["draft-and-approve"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const DEFAULT_AUTONOMY_MODE: AutonomyMode = "draft-and-approve";

export const autonomyModeSchema = z.enum(AUTONOMY_MODES);

export const DirectorAutonomyConfigSchema = z.object({
  mode: autonomyModeSchema.default(DEFAULT_AUTONOMY_MODE),
  /**
   * The design-doc hook. Default false. Flipping to true requires explicit
   * MCP elicitation; the shim refuses to persist a `true` without an
   * approval token recorded in `director:decisions:*`.
   */
  "auto-for-repeat-role": z.boolean().default(false),
});
export type DirectorAutonomyConfig = z.infer<typeof DirectorAutonomyConfigSchema>;

export const DEFAULT_AUTONOMY_CONFIG: DirectorAutonomyConfig = {
  mode: DEFAULT_AUTONOMY_MODE,
  "auto-for-repeat-role": false,
};

export function isAutonomyMode(value: unknown): value is AutonomyMode {
  return typeof value === "string" && (AUTONOMY_MODES as readonly string[]).includes(value);
}
