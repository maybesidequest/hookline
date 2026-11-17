import type { PushEvent, WorkflowRunEvent } from "@octokit/webhooks-types";
import type { Card } from "../card";
import type { Env } from "../env";
import { ciRunOf } from "./panel";
import type { PushTracker } from "./tracker";

const PUSH_TRIGGER = "push";

export class LiveCi {
  private constructor(private readonly trackers: DurableObjectNamespace<PushTracker>) {}

  static from(env: Env): LiveCi | null {
    return env.PUSH_TRACKER ? new LiveCi(env.PUSH_TRACKER) : null;
  }

  async track(p: PushEvent, channel: string, messageId: string, card: Card): Promise<void> {
    await this.tracker(p.repository.id, p.after).start({ channel, messageId, sha: p.after, card });
  }

  async update(p: WorkflowRunEvent): Promise<boolean> {
    if (p.workflow_run.event !== PUSH_TRIGGER) return false;
    return this.tracker(p.repository.id, p.workflow_run.head_sha).update(ciRunOf(p.workflow_run));
  }

  private tracker(repoId: number, sha: string): DurableObjectStub<PushTracker> {
    return this.trackers.get(this.trackers.idFromName(`${repoId}:${sha}`));
  }
}
