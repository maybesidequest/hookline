import type { WorkflowRunEvent } from "@octokit/webhooks-types";
import { CardBuilder, type AccentName, type Card } from "../card";
import type { Env } from "../env";
import { code, duration, esc, link, plural, shortSha } from "../md";

export interface CiRun {
  id: number;
  name: string;
  url: string;
  status: string;
  conclusion: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface CiEmoji {
  pass: string;
  fail: string;
  running: string;
  skip: string;
}

type RunState = keyof CiEmoji;

const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);
export const isFailure = (conclusion: string | null | undefined) => FAILED_CONCLUSIONS.has(conclusion ?? "");

const COMPLETED = "completed";
const QUEUED_STATUSES = new Set(["queued", "requested", "waiting", "pending"]);

export function emojiFrom(env: Env): CiEmoji {
  return {
    pass: env.EMOJI_PASS || "🟢",
    fail: env.EMOJI_FAIL || "🔴",
    running: env.EMOJI_RUNNING || "🟡",
    skip: env.EMOJI_SKIP || "⚪",
  };
}

export function ciRunOf(run: WorkflowRunEvent["workflow_run"]): CiRun {
  return {
    id: run.id,
    name: run.name ?? "Workflow",
    url: run.html_url,
    status: run.status ?? COMPLETED,
    conclusion: run.conclusion,
    startedAt: run.run_started_at ?? run.created_at,
    updatedAt: run.updated_at,
  };
}

function stateOf(run: CiRun): RunState {
  if (run.status !== COMPLETED) return "running";
  if (run.conclusion === "success") return "pass";
  return isFailure(run.conclusion) ? "fail" : "skip";
}

function detailOf(run: CiRun): string {
  if (run.status !== COMPLETED) return QUEUED_STATUSES.has(run.status) ? "queued" : "running";
  const took = duration(run.startedAt, run.updatedAt);
  return stateOf(run) === "skip" ? run.conclusion ?? "skipped" : took;
}

const unixOf = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

class CiSummary {
  readonly runs: CiRun[];
  private readonly byState: Record<RunState, CiRun[]>;

  constructor(
    runs: CiRun[],
    private readonly sha: string,
    private readonly emoji: CiEmoji,
  ) {
    this.runs = [...runs].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    this.byState = { pass: [], fail: [], running: [], skip: [] };
    for (const run of this.runs) this.byState[stateOf(run)].push(run);
  }

  get accent(): AccentName {
    if (this.byState.fail.length) return "bad";
    if (this.byState.running.length) return "warn";
    return this.byState.pass.length ? "ok" : "draft";
  }

  get heading(): string {
    const { fail, running, pass } = this.byState;
    if (fail.length === 1) return `${this.emoji.fail} **${esc(fail[0].name)} failed**`;
    if (fail.length) return `${this.emoji.fail} **${fail.length} checks failed**`;
    if (running.length) return `**Running ${plural(running.length, "check")}**`;
    return pass.length ? `${this.emoji.pass} **All checks passed**` : `${this.emoji.skip} **Checks skipped**`;
  }

  get lines(): string {
    return this.runs.map((run) => `${this.emoji[stateOf(run)]} ${link(esc(run.name), run.url)} ${code(detailOf(run))}`).join("\n");
  }

  get footer(): string {
    const started = this.runs.map((r) => r.startedAt).sort()[0];
    const sha = code(shortSha(this.sha));
    if (this.byState.running.length) return `-# ${sha} · started <t:${unixOf(started)}:R>`;
    const finished = this.runs.map((r) => r.updatedAt).sort().at(-1) ?? started;
    return `-# ${sha} · finished in ${duration(started, finished)}`;
  }

  get logsUrl(): string | undefined {
    return this.byState.fail[0]?.url;
  }
}

export function ciPanel(runs: CiRun[], sha: string, emoji: CiEmoji): Card {
  const summary = new CiSummary(runs, sha, emoji);
  return new CardBuilder(summary.accent)
    .title(summary.heading)
    .body(`${summary.lines}\n${summary.footer}`)
    .button("View logs", summary.logsUrl)
    .build();
}
