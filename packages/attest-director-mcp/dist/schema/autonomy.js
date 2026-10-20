import { z } from "zod";
const AUTONOMY_MODES = ["draft-and-approve"];
const DEFAULT_AUTONOMY_MODE = "draft-and-approve";
const autonomyModeSchema = z.enum(AUTONOMY_MODES);
const DirectorAutonomyConfigSchema = z.object({
  mode: autonomyModeSchema.default(DEFAULT_AUTONOMY_MODE),
  /**
   * The design-doc hook. Default false. Flipping to true requires explicit
   * MCP elicitation; the shim refuses to persist a `true` without an
   * approval token recorded in `director:decisions:*`.
   */
  "auto-for-repeat-role": z.boolean().default(false)
});
const DEFAULT_AUTONOMY_CONFIG = {
  mode: DEFAULT_AUTONOMY_MODE,
  "auto-for-repeat-role": false
};
function isAutonomyMode(value) {
  return typeof value === "string" && AUTONOMY_MODES.includes(value);
}
export {
  AUTONOMY_MODES,
  DEFAULT_AUTONOMY_CONFIG,
  DEFAULT_AUTONOMY_MODE,
  DirectorAutonomyConfigSchema,
  autonomyModeSchema,
  isAutonomyMode
};
//# sourceMappingURL=autonomy.js.map
