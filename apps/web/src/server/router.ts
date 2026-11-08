import { pool } from "@freight/db";
import {
  advanceRun,
  decideApproval,
  getRunDetail,
  listApprovalQueue,
  listRuns,
  startRun,
  activeProvider,
} from "@freight/operator";
import { ApprovalCommand, SubmitRateRequest } from "@freight/schema";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(async () => {
    await pool.query("select 1");
    const provider = activeProvider();
    return {
      ok: true as const,
      provider,
      model:
        provider === "openai"
          ? (process.env.OPENAI_MODEL ?? "gpt-4o-mini")
          : "deterministic-mock",
    };
  }),
  run: router({
    list: publicProcedure.query(() => listRuns()),
    byId: publicProcedure
      .input(z.object({ id: z.uuid() }))
      .query(async ({ input }) => {
        const detail = await getRunDetail(input.id);
        if (!detail) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Run not found." });
        }
        return detail;
      }),
    submit: publicProcedure
      .input(SubmitRateRequest)
      .mutation(async ({ input }) => {
        const started = await startRun(input.rawText);
        return advanceRun(started.id, "api");
      }),
  }),
  approval: router({
    queue: publicProcedure.query(() => listApprovalQueue()),
    decide: publicProcedure
      .input(ApprovalCommand)
      .mutation(({ input }) => decideApproval(input, "desk")),
  }),
});

export type AppRouter = typeof appRouter;
