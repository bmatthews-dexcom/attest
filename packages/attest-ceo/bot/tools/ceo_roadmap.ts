import { defineTool } from "@cursor/bdk/tools";
import * as z from "zod/v4";
import { readLedger, type Kv } from "../lib/ceo-state.js";

export default defineTool({
  description:
    "/ceo roadmap — ordered initiative list with linked commitments.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const ledger = await readLedger(ctx.host.kv as Kv);
    const order = { p0: 0, p1: 1, p2: 2, p3: 3 } as const;
    const roadmap = [...ledger.roadmap].sort(
      (a, b) => order[a.priorityBand] - order[b.priorityBand],
    );
    const commitmentsById = new Map(ledger.commitments.map((c) => [c.id, c]));
    return {
      updatedAt: ledger.updatedAt,
      initiatives: roadmap.map((i) => ({
        id: i.id,
        title: i.title,
        state: i.state,
        priorityBand: i.priorityBand,
        commitmentCount: i.commitmentIds.length,
        commitments: i.commitmentIds
          .map((cid) => commitmentsById.get(cid))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => ({ id: c.id, state: c.state, text: c.text.slice(0, 160) })),
      })),
    };
  },
});
