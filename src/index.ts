import type { PushEvent, WorkflowRunEvent } from "@octokit/webhooks-types";
import { LiveCi } from "./ci/live";
import { DiscordWebhook, toDiscordMessage } from "./discord";
import { HttpError, webhookFor, type Env } from "./env";
import { githubEvents } from "./render";
import { verifySignature } from "./verify";

const CHANNEL_NAME = /^[a-z0-9_-]+$/i;
const MAX_ERROR_BODY = 500;

const reply = (status: number, message: string) => new Response(message + "\n", { status });

function channelOf(url: URL): string {
  const channel = url.pathname.replace(/^\/+|\/+$/g, "");
  if (channel && !CHANNEL_NAME.test(channel)) throw new HttpError(404, "Unknown channel.");
  return channel;
}

async function authenticate(req: Request, env: Env): Promise<string> {
  if (!env.GITHUB_WEBHOOK_SECRET) throw new HttpError(500, "GITHUB_WEBHOOK_SECRET is not set.");
  const body = await req.text();
  const valid = await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, req.headers.get("x-hub-signature-256"));
  if (!valid) throw new HttpError(401, "Bad signature.");
  return body;
}

function isAllowed(env: Env, event: string): boolean {
  const allowed = (env.EVENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return !allowed.length || allowed.includes(event);
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Body is not JSON. Set the GitHub webhook content type to application/json.");
  }
}

async function handleDelivery(req: Request, env: Env): Promise<Response> {
  const channel = channelOf(new URL(req.url));
  const target = webhookFor(env, channel);
  const body = await authenticate(req, env);
  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return reply(200, "pong");
  if (!isAllowed(env, event)) return reply(202, `Skipped: ${event} is not in EVENTS.`);

  const payload = parseJson(body);
  const live = LiveCi.from(env);
  if (live && event === "workflow_run" && (await live.update(payload as WorkflowRunEvent))) {
    return reply(200, "Updated the CI panel.");
  }

  const card = await githubEvents.render(event, payload, { kv: env.HOOKLINE_STATE });
  if (!card) return reply(202, `Skipped: nothing to post for ${event}.`);

  const res = await new DiscordWebhook(target).send(toDiscordMessage(card));
  if (!res.ok) return reply(502, `Discord returned ${res.status}: ${(await res.text()).slice(0, MAX_ERROR_BODY)}`);
  if (live && event === "push") {
    const { id } = (await res.json()) as { id: string };
    await live.track(payload as PushEvent, channel, id, card);
  }
  return reply(200, "Posted.");
}

export { PushTracker } from "./ci/tracker";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "GET") return reply(200, "Hookline is running.");
    if (req.method !== "POST") return reply(405, "Use POST.");
    try {
      return await handleDelivery(req, env);
    } catch (error) {
      if (error instanceof HttpError) return reply(error.status, error.message);
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
