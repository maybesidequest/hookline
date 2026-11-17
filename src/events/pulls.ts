import type { PullRequestEvent, PullRequestReviewCommentEvent, PullRequestReviewEvent } from "@octokit/webhooks-types";
import { CardBuilder, type AccentName, type Card } from "../card";
import { code, defuseFences, duration, esc, excerpt, link, numberedTitle, plural, quote, truncate, who } from "../md";
import { byAction, type Renderer } from "./types";

type PullRequest = PullRequestEvent["pull_request"];
type Reviewer = PullRequest["requested_reviewers"][number];

const EXCERPT_LENGTH = 300;
const LINKED_TITLE_LENGTH = 100;
const DIFF_HUNK_TAIL_LINES = 4;

const branches = (pr: PullRequest) => `${code(pr.base.ref)} ← ${code(pr.head.ref)}`;
const stats = (pr: PullRequest) => `+${pr.additions} −${pr.deletions} · ${plural(pr.changed_files, "file")}`;
const reviewerName = (r: Reviewer) => who("login" in r ? r.login : r.name);

function prCard(p: PullRequestEvent, accent: AccentName, what: string): CardBuilder {
  return new CardBuilder(accent)
    .avatar(p.sender.avatar_url)
    .header(p.repository.full_name, what)
    .title(numberedTitle(p.pull_request));
}

function openedExtras(pr: PullRequest): string {
  const extras = [
    pr.requested_reviewers?.length ? `Reviewers: ${pr.requested_reviewers.map(reviewerName).join(", ")}` : "",
    pr.labels?.length ? `Labels: ${pr.labels.map((l) => code(l.name)).join(" ")}` : "",
  ].filter(Boolean);
  return extras.length ? `-# ${extras.join(" · ")}` : "";
}

function draftOpened(p: PullRequestEvent): Card {
  const pr = p.pull_request;
  return prCard(p, "draft", `draft pull request by ${who(p.sender.login)}`)
    .meta(`${branches(pr)} · ${stats(pr)} · not ready for review`)
    .button("View draft", pr.html_url)
    .build();
}

function dependencyOpened(p: PullRequestEvent): Card {
  const pr = p.pull_request;
  return prCard(p, "draft", `dependency update by ${who(p.sender.login)}`)
    .meta(`${branches(pr)} · ${stats(pr)}`)
    .button("Review", pr.html_url)
    .build();
}

function regularOpened(p: PullRequestEvent): Card {
  const pr = p.pull_request;
  return prCard(p, "ok", `pull request opened by ${who(p.sender.login)}`)
    .meta(`${branches(pr)} · ${stats(pr)}`)
    .body(excerpt(pr.body, EXCERPT_LENGTH))
    .body(openedExtras(pr))
    .button("Review", pr.html_url)
    .button("Files changed", `${pr.html_url}/files`)
    .build();
}

function opened(p: PullRequestEvent): Card {
  if (p.pull_request.draft) return draftOpened(p);
  return p.sender.type === "Bot" ? dependencyOpened(p) : regularOpened(p);
}

function merged(p: PullRequestEvent): Card {
  const pr = p.pull_request;
  const mergedBy = pr.merged_by ? who(pr.merged_by.login) : who(p.sender.login);
  const openFor = duration(pr.created_at, pr.merged_at ?? Date.now());
  return prCard(p, "merged", "pull request merged")
    .avatar(pr.merged_by?.avatar_url ?? p.sender.avatar_url)
    .meta(`into ${code(pr.base.ref)} by ${mergedBy} · ${plural(pr.commits, "commit")} · open for ${openFor}`)
    .button("View PR", pr.html_url)
    .build();
}

function closedUnmerged(p: PullRequestEvent): Card {
  const pr = p.pull_request;
  return prCard(p, "bad", `pull request closed by ${who(p.sender.login)}`)
    .meta(`not merged · ${plural(pr.comments + pr.review_comments, "comment")}`)
    .build();
}

export const pullRequest = byAction<PullRequestEvent>({
  opened,
  ready_for_review: (p) =>
    prCard(p, "ok", `ready for review · ${who(p.sender.login)}`)
      .meta(`${branches(p.pull_request)} · ${stats(p.pull_request)}`)
      .button("Review", p.pull_request.html_url)
      .build(),
  reopened: (p) =>
    prCard(p, "ok", `pull request reopened by ${who(p.sender.login)}`).meta(branches(p.pull_request)).build(),
  closed: (p) => (p.pull_request.merged ? merged(p) : closedUnmerged(p)),
});

const REVIEW_STATES: Record<string, { accent: AccentName; label: string; needsBody: boolean }> = {
  approved: { accent: "ok", label: "Approved", needsBody: false },
  changes_requested: { accent: "warn", label: "Changes requested", needsBody: false },
  commented: { accent: "info", label: "Reviewed", needsBody: true },
};

const linkedPr = (pr: { number: number; title: string; html_url: string }) =>
  link(`#${pr.number} ${esc(truncate(pr.title, LINKED_TITLE_LENGTH))}`, pr.html_url);

export const pullRequestReview = byAction<PullRequestReviewEvent>({
  submitted: (p) => {
    const review = p.review;
    const state = REVIEW_STATES[review.state.toLowerCase()];
    if (!state || (state.needsBody && !review.body?.trim())) return null;
    return new CardBuilder(state.accent)
      .avatar(review.user.avatar_url)
      .header(p.repository.full_name, `review on #${p.pull_request.number} by ${who(review.user.login)}`)
      .title(state.label)
      .meta(linkedPr(p.pull_request))
      .body(review.body && quote(excerpt(review.body, EXCERPT_LENGTH)))
      .button("View review", review.html_url)
      .build();
  },
});

export const pullRequestReviewComment = byAction<PullRequestReviewCommentEvent>({
  created: (p) => {
    const comment = p.comment;
    if (!comment.in_reply_to_id) return null;
    const hunk = comment.diff_hunk.split("\n").slice(-DIFF_HUNK_TAIL_LINES).join("\n");
    return new CardBuilder("info")
      .avatar(comment.user.avatar_url)
      .header(p.repository.full_name, `reply on #${p.pull_request.number} by ${who(comment.user.login)}`)
      .title(`${code(comment.path)}${comment.line ? ` line ${comment.line}` : ""}`)
      .meta(linkedPr(p.pull_request))
      .body("```diff\n" + defuseFences(hunk) + "\n```")
      .body(excerpt(comment.body, EXCERPT_LENGTH))
      .button("Reply", comment.html_url)
      .build();
  },
});
