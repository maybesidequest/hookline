import { DurableObject } from "cloudflare:workers";
import type { Card } from "../card";
import { DiscordWebhook, toDiscordMessage } from "../discord";
import { webhookFor, type Env } from "../env";
import { ciPanel, emojiFrom, type CiRun } from "./panel";

const TRACK_FOR_MS = 24 * 60 * 60 * 1000;
const HTTP_NOT_FOUND = 404;

export interface TrackedPush {
  channel: string;
  messageId: string;
  sha: string;
  card: Card;
}

type Runs = Record<string, CiRun>;

export class PushTracker extends DurableObject<Env> {
  async start(push: TrackedPush): Promise<void> {
    await this.ctx.storage.put("push", push);
    await this.ctx.storage.setAlarm(Date.now() + TRACK_FOR_MS);
    const runs = await this.runs();
    if (Object.keys(runs).length) await this.render(push, runs);
  }

  async update(run: CiRun): Promise<boolean> {
    const runs = await this.runs();
    const known = runs[run.id];
    if (!known || known.updatedAt <= run.updatedAt) {
      runs[run.id] = run;
      await this.ctx.storage.put("runs", runs);
    }
    const push = await this.ctx.storage.get<TrackedPush>("push");
    if (!push) {
      await this.ctx.storage.setAlarm(Date.now() + TRACK_FOR_MS);
      return false;
    }
    await this.render(push, runs);
    return true;
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  private async runs(): Promise<Runs> {
    return (await this.ctx.storage.get<Runs>("runs")) ?? {};
  }

  private async render(push: TrackedPush, runs: Runs): Promise<void> {
    const panel = ciPanel(Object.values(runs), push.sha, emojiFrom(this.env));
    const webhook = new DiscordWebhook(webhookFor(this.env, push.channel));
    const res = await webhook.edit(push.messageId, toDiscordMessage(push.card, panel));
    if (res.status === HTTP_NOT_FOUND) await this.ctx.storage.deleteAll();
  }
}
