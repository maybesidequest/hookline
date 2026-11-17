import type { PushTracker } from "./ci/tracker";

export interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  DISCORD_WEBHOOK_URL: string;
  EVENTS?: string;
  HOOKLINE_STATE?: KVNamespace;
  PUSH_TRACKER?: DurableObjectNamespace<PushTracker>;
  EMOJI_PASS?: string;
  EMOJI_FAIL?: string;
  EMOJI_RUNNING?: string;
  EMOJI_SKIP?: string;
  [key: string]: unknown;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function webhookFor(env: Env, channel: string): string {
  const key = channel ? `DISCORD_WEBHOOK_${channel.toUpperCase().replace(/-/g, "_")}` : "DISCORD_WEBHOOK_URL";
  const target = env[key];
  if (typeof target !== "string" || !target) {
    throw new HttpError(404, `No Discord webhook configured for "${channel || "default"}".`);
  }
  return target;
}
