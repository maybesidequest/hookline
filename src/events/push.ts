import type { CreateEvent, DeleteEvent, PushEvent } from "@octokit/webhooks-types";
import { CardBuilder, type Card } from "../card";
import { code, defuseFences, esc, firstLine, link, people, plural, shortSha, truncate, who } from "../md";
import type { Renderer } from "./types";

type Commit = PushEvent["commits"][number];

const MAX_LISTED_COMMITS = 10;
const COMMIT_LINE_LENGTH = 72;
const COMMIT_TITLE_LENGTH = 120;
const DIFF_MESSAGE_LENGTH = 50;
const BRANCH_PREFIX = "refs/heads/";

class PushSummary {
  readonly branch: string;
  readonly listed: Commit[];
  readonly hidden: number;

  constructor(readonly payload: PushEvent) {
    this.branch = payload.ref.slice(BRANCH_PREFIX.length);
    this.listed = payload.commits.slice(-MAX_LISTED_COMMITS).reverse();
    this.hidden = payload.commits.length - this.listed.length;
  }

  static authorName(c: Commit): string {
    return c.author.username ?? c.author.name;
  }

  static authorLink(c: Commit): string {
    return c.author.username ? who(c.author.username) : esc(c.author.name);
  }

  get authors(): string {
    return people(this.payload.commits.map(PushSummary.authorLink));
  }

  get filesChanged(): string {
    const files = new Set(this.payload.commits.flatMap((c) => [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]));
    return files.size ? ` · ${plural(files.size, "file")} changed` : "";
  }

  get hiddenNote(): string {
    return this.hidden > 0 ? `and ${plural(this.hidden, "earlier commit")}` : "";
  }

  card(accent: "info" | "warn", verb: string): CardBuilder {
    return new CardBuilder(accent)
      .avatar(this.payload.sender.avatar_url)
      .header(this.payload.repository.full_name, `${who(this.payload.sender.login)} ${verb} ${code(this.branch)}`);
  }
}

function commitLine(c: Commit): string {
  const sha = link(code(shortSha(c.id)), c.url);
  return `${sha} ${esc(truncate(firstLine(c.message), COMMIT_LINE_LENGTH))} · **${esc(PushSummary.authorName(c))}**`;
}

function forcePushDiff(push: PushSummary): string {
  const messages = push.listed.map((c) => defuseFences(truncate(firstLine(c.message), DIFF_MESSAGE_LENGTH)));
  const width = Math.max(...messages.map((m) => m.length));
  const added = push.listed.map(
    (c, i) => `+ ${shortSha(c.id)} ${messages[i].padEnd(width)} (${defuseFences(PushSummary.authorName(c))})`,
  );
  const lines = [`- ${shortSha(push.payload.before)} previous head`, ...added];
  if (push.hiddenNote) lines.push(`+ … ${push.hiddenNote}`);
  return "```diff\n" + lines.join("\n") + "\n```";
}

function forcePushCard(push: PushSummary): Card {
  const p = push.payload;
  return push
    .card("warn", "force-pushed")
    .title("History rewritten")
    .meta(`by ${push.authors} · ${code(shortSha(p.before))} → ${code(shortSha(p.after))} · ${plural(p.commits.length, "new commit")}`)
    .body(forcePushDiff(push))
    .button("Compare", p.compare)
    .build();
}

function singleCommitCard(push: PushSummary): Card {
  const c = push.payload.commits[0];
  return push
    .card("info", "pushed to")
    .title(link(esc(truncate(firstLine(c.message), COMMIT_TITLE_LENGTH)), c.url))
    .meta(`by ${PushSummary.authorLink(c)} · ${link(code(shortSha(c.id)), c.url)}${push.filesChanged}`)
    .button("View commit", c.url)
    .build();
}

function multiCommitCard(push: PushSummary): Card {
  const p = push.payload;
  const range = code(`${shortSha(p.commits[0].id)}…${shortSha(p.after)}`);
  const list = push.listed.map(commitLine).join("\n") + (push.hiddenNote ? `\n-# ${push.hiddenNote}` : "");
  return push
    .card("info", "pushed to")
    .title(link(plural(p.commits.length, "new commit"), p.compare))
    .meta(`by ${push.authors} · ${range}${push.filesChanged}`)
    .body(list)
    .button("Compare changes", p.compare)
    .build();
}

const isBranchPushWithCommits = (p: PushEvent) => !p.deleted && p.ref.startsWith(BRANCH_PREFIX) && p.commits.length > 0;

export const push: Renderer<PushEvent> = (p) => {
  if (!isBranchPushWithCommits(p)) return null;
  const summary = new PushSummary(p);
  if (p.forced) return forcePushCard(summary);
  return p.commits.length === 1 ? singleCommitCard(summary) : multiCommitCard(summary);
};

const REF_PATHS = { tag: "releases/tag", branch: "tree" } as const;

export const create: Renderer<CreateEvent> = (p) => {
  const url = `${p.repository.html_url}/${REF_PATHS[p.ref_type]}/${encodeURIComponent(p.ref)}`;
  return new CardBuilder("ok")
    .avatar(p.sender.avatar_url)
    .header(p.repository.full_name, `new ${p.ref_type}`)
    .title(link(code(p.ref), url))
    .meta(`by ${who(p.sender.login)}`)
    .build();
};

export const del: Renderer<DeleteEvent> = (p) =>
  new CardBuilder("draft")
    .avatar(p.sender.avatar_url)
    .header(p.repository.full_name, `${p.ref_type} deleted`)
    .title(`~~${code(p.ref)}~~`)
    .meta(`by ${who(p.sender.login)}`)
    .build();
