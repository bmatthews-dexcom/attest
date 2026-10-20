import { defineSchedule } from "@cursor/bdk/schedules";

/**
 * Phase-6 cron sweep (§4.6).
 *
 * Weekly judgment pass over every deployed expert: re-run stored fixtures,
 * check edit-distance signals, surface refinement proposals when primary
 * or secondary metrics breach bar. Does NOT apply any refinement
 * automatically — every refinement still goes through the dedicated
 * approval card (§9.4).
 *
 * The schedule is defined in markdown-task form so the Director's chat
 * channel picks it up and routes through `director_sweep` without a
 * special runner — same shape as the CEO's digest cron tick.
 */
export default defineSchedule({
  // Mondays 09:00 UTC
  cron: "0 9 * * 1",
  markdown:
    "Run `/director sweep` across every deployed expert. If `director.sweep` surfaces refinement proposals, surface them as pending approvals (do NOT auto-apply any refinement).",
});
