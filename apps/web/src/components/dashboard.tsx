"use client";

import {
  EQUIPMENT_LABEL,
  STEP_LABEL,
  formatUsd,
  type ApprovalCommand,
  type RunStatus,
} from "@freight/schema";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import { trpc } from "@/lib/api";
import { SAMPLES } from "@/lib/samples";
import type { AppRouter } from "@/server/router";

type Outputs = inferRouterOutputs<AppRouter>;
type Detail = Outputs["run"]["byId"];
type QueueItem = Outputs["approval"]["queue"][number];
type StepDecision = Detail["decisions"][number];

const STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Queued",
  running: "Running",
  waiting_approval: "Held",
  completed: "Sent",
  failed: "Failed",
  rejected: "Rejected",
};

function statusClass(status: RunStatus): string {
  if (status === "waiting_approval") return "bg-brass-soft text-brass";
  if (status === "completed") return "bg-pine-soft text-pine";
  if (status === "failed" || status === "rejected") return "bg-wine-soft text-wine";
  return "bg-paper text-ink-soft";
}

function laneLabel(run: {
  originCity: string | null;
  originState: string | null;
  destinationCity: string | null;
  destinationState: string | null;
}): string {
  if (!run.originCity || !run.destinationCity) return "Unparsed request";
  return `${run.originCity}, ${run.originState} → ${run.destinationCity}, ${run.destinationState}`;
}

function sentAmount(quote: { allInCents: number; editedAllInCents: number | null }): number {
  return quote.editedAllInCents ?? quote.allInCents;
}

export function Dashboard() {
  const utils = trpc.useUtils();
  const health = trpc.health.useQuery(undefined, { retry: false });
  const list = trpc.run.list.useQuery(undefined, { refetchInterval: 2000 });
  const queue = trpc.approval.queue.useQuery(undefined, { refetchInterval: 2000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState<string>(SAMPLES[0].text);
  const activeId = selectedId ?? list.data?.[0]?.id ?? null;
  const detail = trpc.run.byId.useQuery(
    { id: activeId ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(activeId), refetchInterval: 2000 },
  );

  const refresh = async (id?: string) => {
    if (id) setSelectedId(id);
    await Promise.all([
      utils.run.list.invalidate(),
      utils.approval.queue.invalidate(),
      utils.run.byId.invalidate(),
    ]);
  };

  const submit = trpc.run.submit.useMutation({
    onSuccess: (run) => void refresh(run.id),
  });
  const decide = trpc.approval.decide.useMutation({
    onSuccess: (run) => void refresh(run.id),
  });

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line px-6 py-5">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-ember">
            LANE DESK · BROKER OPERATOR
          </p>
          <h1 className="mt-1 font-serif text-4xl leading-none tracking-tight">
            Quote the lane. Hold the send.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            Paste a rate request. The operator parses it, prices the lane from the
            rate card, checks a carrier, and waits for you before anything is marked sent.
          </p>
        </div>
        <dl className="font-mono text-xs text-ink-soft">
          <div className="flex justify-between gap-6">
            <dt>model</dt>
            <dd className="text-ink">{health.data?.model ?? "…"}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-6">
            <dt>database</dt>
            <dd className={health.data?.ok ? "text-pine" : "text-wine"}>
              {health.isError ? "unreachable" : health.data?.ok ? "connected" : "…"}
            </dd>
          </div>
        </dl>
      </header>

      {health.isError ? (
        <p className="mx-6 mt-4 rounded-md border border-wine/30 bg-wine-soft px-3 py-2 text-sm text-wine">
          Database unreachable. Start Postgres, then run migrations and the seed.
        </p>
      ) : null}

      <main className="grid items-start gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <form
            className="rounded-xl border border-line bg-paper-2 p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              submit.mutate({ rawText: text });
            }}
          >
            <label htmlFor="rate-request" className="text-xs font-medium tracking-wide text-ink-soft">
              Rate request
            </label>
            <textarea
              id="rate-request"
              data-testid="rate-request-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              className="mt-2 w-full resize-none rounded-md border border-line bg-white/70 px-3 py-2 text-sm outline-none ring-ember focus:ring-2"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {SAMPLES.map((sample, index) => (
                <button
                  key={sample.label}
                  type="button"
                  data-testid={`sample-${index}`}
                  onClick={() => setText(sample.text)}
                  className="rounded-full border border-line px-2 py-1 text-xs text-ink-soft hover:border-ember hover:text-ink"
                >
                  {sample.label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              data-testid="submit-request"
              disabled={submit.isPending}
              className="mt-3 w-full rounded-md bg-desk px-3 py-2 text-sm font-medium text-paper-2 disabled:opacity-60"
            >
              {submit.isPending ? "Running the operator…" : "Run operator"}
            </button>
            {submit.error ? (
              <p className="mt-2 text-sm text-wine">{submit.error.message}</p>
            ) : null}
          </form>

          <div data-testid="run-list" className="rounded-xl border border-line bg-paper-2 p-3">
            <h2 className="px-1 text-xs font-medium tracking-wide text-ink-soft">Runs</h2>
            <ul className="mt-2 space-y-1">
              {(list.data ?? []).map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(run.id)}
                    className={`w-full rounded-md px-2 py-2 text-left ${
                      run.id === activeId ? "bg-ember-soft" : "hover:bg-white/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{laneLabel(run)}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${statusClass(run.status)}`}>
                        {STATUS_LABEL[run.status]}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-ink-soft">
                      {run.equipment ? EQUIPMENT_LABEL[run.equipment] : "parsing"}
                      {run.allInCents ? ` · ${formatUsd(run.allInCents)}` : ""}
                    </p>
                  </button>
                </li>
              ))}
              {list.data?.length === 0 ? (
                <li className="px-2 py-6 text-sm text-ink-soft">
                  No runs yet. Paste a request to wake the operator.
                </li>
              ) : null}
            </ul>
          </div>
        </section>

        <section
          data-testid="timeline"
          className="rounded-xl border border-line bg-paper-2 p-5 shadow-sm"
        >
          {detail.data ? (
            <RunTimeline detail={detail.data} />
          ) : (
            <p className="text-sm text-ink-soft">Select a run to see the step timeline.</p>
          )}
        </section>

        <ApprovalQueue
          items={queue.data ?? []}
          pending={decide.isPending}
          error={decide.error?.message}
          onDecide={(command) => decide.mutate(command)}
          onFocus={setSelectedId}
        />
      </main>
    </div>
  );
}

function RunTimeline({ detail }: { detail: Detail }) {
  const decisionsByStep = new Map<string, StepDecision[]>();
  for (const decision of detail.decisions) {
    const list = decisionsByStep.get(decision.stepName) ?? [];
    list.push(decision);
    decisionsByStep.set(decision.stepName, list);
  }
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft">OPERATOR RUN</p>
          <h2 className="font-serif text-3xl leading-tight">{laneLabel(detail)}</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">{detail.rawText}</p>
        </div>
        <p
          data-testid="run-state"
          className={`rounded-full px-3 py-1 text-sm ${statusClass(detail.status)}`}
        >
          {STATUS_LABEL[detail.status]}
        </p>
      </div>
      {detail.lastError && detail.status === "failed" ? (
        <p className="mt-3 rounded-md bg-wine-soft px-3 py-2 text-sm text-wine">{detail.lastError}</p>
      ) : null}
      {detail.quote ? (
        <p className="mt-4 font-serif text-4xl tracking-tight">
          {formatUsd(sentAmount(detail.quote))}
          {detail.quote.editedAllInCents ? (
            <span className="ml-2 font-sans text-base text-ink-soft">
              edited from {formatUsd(detail.quote.allInCents)}
            </span>
          ) : null}
        </p>
      ) : null}
      <ol className="mt-6 space-y-0">
        {detail.steps.map((step, index) => {
          const decisions = decisionsByStep.get(step.name) ?? [];
          const latest = decisions.at(-1);
          return (
            <li key={step.id} className="grid grid-cols-[18px_minmax(0,1fr)] gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1 size-2.5 rounded-full ${
                    step.status === "succeeded"
                      ? "bg-pine"
                      : step.status === "waiting"
                        ? "bg-brass"
                        : step.status === "failed"
                          ? "bg-wine"
                          : "bg-line"
                  }`}
                />
                {index < detail.steps.length - 1 ? <span className="w-px flex-1 bg-line" /> : null}
              </div>
              <div className="pb-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium">{STEP_LABEL[step.name]}</h3>
                  <span className="font-mono text-[11px] text-ink-soft">{step.status}</span>
                </div>
                {latest ? (
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{latest.reasoning}</p>
                ) : (
                  <p className="mt-1 text-sm text-ink-soft/80">Waiting on an earlier step.</p>
                )}
                {decisions.length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-ember">Inputs and outcome</summary>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-desk px-3 py-2 font-mono text-[11px] leading-relaxed text-paper-2">
                      {JSON.stringify(
                        decisions.map((decision) => ({
                          attempt: decision.attempt,
                          inputs: decision.inputs,
                          outcome: decision.outcome,
                        })),
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ApprovalQueue({
  items,
  pending,
  error,
  onDecide,
  onFocus,
}: {
  items: QueueItem[];
  pending: boolean;
  error?: string;
  onDecide: (command: ApprovalCommand) => void;
  onFocus: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [dollars, setDollars] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <section data-testid="approval-queue" className="rounded-xl border border-line bg-paper-2 p-4 shadow-sm">
      <h2 className="text-xs font-medium tracking-wide text-ink-soft">Approval queue</h2>
      <p className="mt-1 text-sm text-ink-soft">Nothing leaves the desk until you say so.</p>
      {error ? <p className="mt-2 text-sm text-wine">{error}</p> : null}
      <ul className="mt-3 space-y-3">
        {items.map((item) => {
          const quote = item.quote;
          return (
            <li
              key={item.id}
              data-testid="approval-card"
              className="rounded-lg border border-line bg-white/70 p-3"
            >
              <button type="button" onClick={() => onFocus(item.id)} className="w-full text-left">
                <p className="text-sm font-medium">{laneLabel(item)}</p>
                <p className="mt-1 font-mono text-[11px] text-ink-soft">
                  {item.carrierName ? `${item.carrierName} · ${item.carrierMcNumber}` : "No carrier"}
                </p>
              </button>
              {quote ? (
                <>
                  <p className="mt-2 font-serif text-3xl">{formatUsd(quote.allInCents)}</p>
                  <p className="font-mono text-[11px] text-ink-soft">
                    linehaul {formatUsd(quote.linehaulCents)} · fuel {formatUsd(quote.fuelSurchargeCents)} · margin{" "}
                    {formatUsd(quote.marginCents)}
                  </p>
                </>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  data-testid="approve"
                  disabled={pending}
                  onClick={() => onDecide({ runId: item.id, action: "approve" })}
                  className="rounded-md bg-pine px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  data-testid="reject"
                  disabled={pending}
                  onClick={() => onDecide({ runId: item.id, action: "reject" })}
                  className="rounded-md border border-wine/40 px-2 py-1 text-xs text-wine disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  data-testid="edit-quote"
                  onClick={() => {
                    setEditing(item.id);
                    setDollars(quote ? (quote.allInCents / 100).toFixed(2) : "");
                    setNote("");
                    setFormError(null);
                    onFocus(item.id);
                  }}
                  className="rounded-md border border-line px-2 py-1 text-xs disabled:opacity-50"
                >
                  Edit
                </button>
              </div>
              {editing === item.id ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const cents = Math.round(Number(dollars) * 100);
                    if (!Number.isFinite(cents) || cents <= 0) {
                      setFormError("Enter a dollar amount greater than zero.");
                      return;
                    }
                    onDecide({
                      runId: item.id,
                      action: "edit",
                      editedAllInCents: cents,
                      ...(note.trim() ? { note: note.trim() } : {}),
                    });
                    setEditing(null);
                  }}
                >
                  <label className="block text-xs text-ink-soft">
                    All-in dollars
                    <input
                      data-testid="edit-amount"
                      value={dollars}
                      onChange={(event) => setDollars(event.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-md border border-line px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="block text-xs text-ink-soft">
                    Note for the example log
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className="mt-1 w-full rounded-md border border-line px-2 py-1 text-sm"
                    />
                  </label>
                  {formError ? <p className="text-xs text-wine">{formError}</p> : null}
                  <button
                    type="submit"
                    data-testid="save-edit"
                    disabled={pending}
                    className="rounded-md bg-desk px-2 py-1 text-xs text-paper-2"
                  >
                    Save correction and send
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-sm text-ink-soft">
            The queue is clear.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
