import { DiscordWebhook, toDiscordMessage } from "../src/discord";
import { githubEvents } from "../src/render";
import { allExamples } from "./examples";

const RATE_LIMIT_PAUSE_MS = 1200;

const [webhookUrl, ...only] = process.argv.slice(2);
if (!webhookUrl?.startsWith("https://")) {
  console.error("Usage: npm run demo -- <discord webhook url> [event ...]");
  process.exit(1);
}

const webhook = new DiscordWebhook(webhookUrl);
const sent = new Set<string>();

for (const { event, label, payload } of allExamples) {
  if (only.length && !only.includes(event)) continue;
  const card = await githubEvents.render(event, payload);
  if (!card) continue;
  const message = toDiscordMessage(card);
  const key = JSON.stringify(message);
  if (sent.has(key)) continue;
  sent.add(key);
  const res = await webhook.send(message);
  console.log(`${event} ${label}`.padEnd(40), res.status, res.ok ? "" : await res.text());
  await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_PAUSE_MS));
}
