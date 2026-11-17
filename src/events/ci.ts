import type { DeploymentStatusEvent, WorkflowRunEvent } from "@octokit/webhooks-types";
import { CardBuilder, type Card } from "../card";
import { code, duration, esc, firstLine, link, shortSha, truncate, who } from "../md";
import { byAction, type Renderer } from "./types";

type WorkflowRun = WorkflowRunEvent["workflow_run"];

const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);
const SUCCESS = "success";
const COMMIT_MESSAGE_LENGTH = 90;
const DESCRIPTION_LENGTH = 140;

const isFailure = (conclusion: string | null | undefined) => FAILED_CONCLUSIONS.has(conclusion ?? "");

class CiHistory {
  constructor(private readonly kv: KVNamespace | undefined) {}

  async record(p: WorkflowRunEvent, conclusion: string): Promise<string | null> {
    if (!this.kv) return null;
    const key = `ci:${p.repository.id}:${p.workflow_run.workflow_id}:${p.workflow_run.head_branch}`;
    const previous = await this.kv.get(key);
    await this.kv.put(key, conclusion);
    return previous;
  }
}

function runCard(p: WorkflowRunEvent, accent: "bad" | "ok", what: string): CardBuilder {
  const run = p.workflow_run;
  return new CardBuilder(accent)
    .avatar(run.actor?.avatar_url ?? p.sender.avatar_url)
    .header(p.repository.full_name, what)
    .title(link(esc(run.name ?? "Workflow"), run.html_url));
}

const tookText = (run: WorkflowRun) => (run.run_started_at ? ` · ${duration(run.run_started_at, run.updated_at)}` : "");
const commitUrl = (p: WorkflowRunEvent) => `${p.repository.html_url}/commit/${p.workflow_run.head_sha}`;

function failedCard(p: WorkflowRunEvent): Card {
  const run = p.workflow_run;
  const actor = who(run.actor?.login ?? p.sender.login);
  const commit = run.head_commit
    ? `${link(code(shortSha(run.head_sha)), commitUrl(p))} ${esc(truncate(firstLine(run.head_commit.message), COMMIT_MESSAGE_LENGTH))}`
    : "";
  return runCard(p, "bad", `CI failed on ${code(run.head_branch ?? "?")}`)
    .meta(`run #${run.run_number} · ${run.event} by ${actor}${tookText(run)}`)
    .body(commit)
    .button("View logs", run.html_url)
    .build();
}

function recoveredCard(p: WorkflowRunEvent): Card {
  const run = p.workflow_run;
  return runCard(p, "ok", `CI passing on ${code(run.head_branch ?? "?")} again`)
    .meta(`run #${run.run_number} · fixed by ${link(code(shortSha(run.head_sha)), commitUrl(p))}${tookText(run)}`)
    .build();
}

export const workflowRun: Renderer<WorkflowRunEvent> = byAction<WorkflowRunEvent>({
  completed: async (p, ctx) => {
    const conclusion = p.workflow_run.conclusion ?? "";
    if (!isFailure(conclusion) && conclusion !== SUCCESS) return null;
    const previous = await new CiHistory(ctx.kv).record(p, conclusion);
    if (isFailure(conclusion)) return failedCard(p);
    return isFailure(previous) ? recoveredCard(p) : null;
  },
});

type DeploymentState = DeploymentStatusEvent["deployment_status"]["state"];

function deployCard(p: DeploymentStatusEvent, accent: "ok" | "bad", what: string): CardBuilder {
  const s = p.deployment_status;
  return new CardBuilder(accent)
    .avatar(s.creator?.avatar_url ?? p.sender.avatar_url)
    .header(p.repository.full_name, what);
}

const environment = (p: DeploymentStatusEvent) => esc(p.deployment_status.environment ?? p.deployment.environment);
const deployedSha = (p: DeploymentStatusEvent) => code(shortSha(p.deployment.sha));

function deploySucceeded(p: DeploymentStatusEvent): Card {
  const s = p.deployment_status;
  const site = s.environment_url || "";
  const siteLink = site ? ` · ${link(esc(new URL(site).host), site)}` : "";
  return deployCard(p, "ok", `deployed to **${environment(p)}**`)
    .title(`${deployedSha(p)} is live`)
    .meta(`by ${who(s.creator?.login ?? p.sender.login)}${siteLink}`)
    .button("Open site", site)
    .build();
}

function deployFailed(p: DeploymentStatusEvent): Card {
  const s = p.deployment_status;
  return deployCard(p, "bad", `deploy to **${environment(p)}** failed`)
    .title(`${deployedSha(p)} did not deploy`)
    .meta(s.description ? esc(truncate(s.description, DESCRIPTION_LENGTH)) : "")
    .button("View logs", s.log_url || s.target_url)
    .build();
}

const DEPLOY_STATES: Partial<Record<DeploymentState, (p: DeploymentStatusEvent) => Card>> = {
  success: deploySucceeded,
  failure: deployFailed,
  error: deployFailed,
};

export const deploymentStatus: Renderer<DeploymentStatusEvent> = (p) =>
  DEPLOY_STATES[p.deployment_status.state]?.(p) ?? null;
