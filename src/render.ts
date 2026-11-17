import type { Card } from "./card";
import { deploymentStatus, workflowRun } from "./events/ci";
import { discussion, fork, gollum, member, publicized, watch } from "./events/community";
import { issueComment, issues } from "./events/issues";
import { pullRequest, pullRequestReview, pullRequestReviewComment } from "./events/pulls";
import { create, del, push } from "./events/push";
import { release } from "./events/releases";
import type { RenderContext, Renderer } from "./events/types";

export class EventRouter {
  constructor(private readonly renderers: Readonly<Record<string, Renderer<never>>>) {}

  get events(): string[] {
    return Object.keys(this.renderers);
  }

  supports(event: string): boolean {
    return Object.hasOwn(this.renderers, event);
  }

  async render(event: string, payload: unknown, ctx: RenderContext = {}): Promise<Card | null> {
    if (!this.supports(event)) return null;
    const renderer = this.renderers[event] as Renderer<unknown>;
    return renderer(payload, ctx);
  }
}

export const githubEvents = new EventRouter({
  push,
  create,
  delete: del,
  pull_request: pullRequest,
  pull_request_review: pullRequestReview,
  pull_request_review_comment: pullRequestReviewComment,
  issues,
  issue_comment: issueComment,
  release,
  workflow_run: workflowRun,
  deployment_status: deploymentStatus,
  watch,
  fork,
  discussion,
  gollum,
  member,
  public: publicized,
});
