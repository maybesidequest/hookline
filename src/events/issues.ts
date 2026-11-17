import type { IssueCommentEvent, IssuesEvent } from "@octokit/webhooks-types";
import { CardBuilder, type AccentName } from "../card";
import { code, esc, excerpt, link, numberedTitle, truncate, who } from "../md";
import { byAction } from "./types";

type Issue = IssuesEvent["issue"];

const BODY_EXCERPT_LENGTH = 300;
const COMMENT_EXCERPT_LENGTH = 400;
const TITLE_LENGTH = 120;
const DEFAULT_CLOSE_REASON = "completed";

const CLOSE_ACCENTS: Record<string, AccentName> = { completed: "merged" };

function issueCard(p: IssuesEvent, accent: AccentName, what: string): CardBuilder {
  return new CardBuilder(accent)
    .avatar(p.sender.avatar_url)
    .header(p.repository.full_name, `${what} by ${who(p.sender.login)}`)
    .title(numberedTitle(p.issue));
}

function openedMeta(issue: Issue): string {
  return [
    issue.labels?.length ? `Labels: ${issue.labels.map((l) => code(l.name)).join(" ")}` : "",
    issue.assignees?.length ? `Assigned to ${issue.assignees.map((a) => who(a.login)).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const closeReason = (issue: Issue) => (issue as { state_reason?: string | null }).state_reason ?? DEFAULT_CLOSE_REASON;

export const issues = byAction<IssuesEvent>({
  opened: (p) =>
    issueCard(p, "ok", "issue opened")
      .meta(openedMeta(p.issue))
      .body(excerpt(p.issue.body, BODY_EXCERPT_LENGTH))
      .button("View issue", p.issue.html_url)
      .build(),
  closed: (p) => {
    const reason = closeReason(p.issue);
    return issueCard(p, CLOSE_ACCENTS[reason] ?? "draft", "issue closed")
      .meta(reason.replace(/_/g, " "))
      .build();
  },
  reopened: (p) => issueCard(p, "warn", "issue reopened").build(),
});

export const issueComment = byAction<IssueCommentEvent>({
  created: (p) => {
    const { issue, comment } = p;
    return new CardBuilder("info")
      .avatar(comment.user.avatar_url)
      .header(p.repository.full_name, `comment on #${issue.number} by ${who(comment.user.login)}`)
      .title(link(esc(truncate(issue.title, TITLE_LENGTH)), comment.html_url))
      .meta(`${issue.pull_request ? "pull request" : "issue"} #${issue.number}`)
      .body(excerpt(comment.body, COMMENT_EXCERPT_LENGTH))
      .button("Reply", comment.html_url)
      .build();
  },
});
