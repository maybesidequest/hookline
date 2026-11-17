# Hookline

GitHub notifications for Discord that look good.

Hookline is a Cloudflare Worker that receives GitHub webhooks and posts them to a Discord channel as clean, consistent cards built with Discord's Components V2. It runs on a plain Discord webhook, so there's no bot to host.

Every card has the same shape: the repo and what happened, a title, a quiet line of details, and the avatar of whoever acted. The colored bar shows the outcome at a glance.

| Color | Meaning |
| --- | --- |
| Green | opened, approved, passing, deployed |
| Purple | merged, released, completed |
| Red | closed, failed |
| Amber | changes requested, force push, pre-release, reopened issue |
| Blue | pushes, comments, discussions |
| Grey | drafts, dependency bumps, deleted branches |
| Gold | stars, forks, going public |

## Setup

You need a Cloudflare account and [Bun](https://bun.sh).

```bash
git clone https://github.com/maybesidequest/hookline
cd hookline
bun install
bunx wrangler secret put GITHUB_WEBHOOK_SECRET
bunx wrangler secret put DISCORD_WEBHOOK_URL
bun run deploy
```

- `GITHUB_WEBHOOK_SECRET`: any long random string, for example from `openssl rand -hex 32`.
- `DISCORD_WEBHOOK_URL`: in Discord, open the channel's settings, then **Integrations → Webhooks → New Webhook → Copy Webhook URL**.

Then in your GitHub repository or organization, go to **Settings → Webhooks → Add webhook**:

- **Payload URL:** your Worker's URL, for example `https://hookline.<your-subdomain>.workers.dev/`
- **Content type:** `application/json`
- **Secret:** the same value as `GITHUB_WEBHOOK_SECRET`
- **Events:** "Send me everything" works. Hookline skips events it doesn't render.

GitHub sends a ping when you save. A green check under **Recent Deliveries** means it's working.

## Configuration

### Several channels

Send different events to different channels by adding a path to the Payload URL. A webhook pointing at `/releases` posts to the Discord webhook stored in `DISCORD_WEBHOOK_RELEASES`:

```bash
bunx wrangler secret put DISCORD_WEBHOOK_RELEASES
```

Channel names may contain letters, numbers, `-` and `_`. Dashes become underscores in the secret name.

### Only some events

Set `EVENTS` in `wrangler.jsonc` to a comma-separated list, such as `"push,pull_request,release"`. Leave it empty to forward every supported event.

### "CI passing again" messages

CI failures are always posted. To also post the first successful run after a failure, Hookline needs to remember the previous result. Create a KV namespace:

```bash
bunx wrangler kv namespace create HOOKLINE_STATE
```

Then add the binding it prints to `wrangler.jsonc`:

```jsonc
"kv_namespaces": [{ "binding": "HOOKLINE_STATE", "id": "<id>" }]
```

## Supported events

| GitHub event | Posted for |
| --- | --- |
| `push` | new commits on a branch, with each commit's author; force pushes as a diff from the previous head |
| `create`, `delete` | branches and tags |
| `pull_request` | opened, draft, dependency updates, ready for review, merged, closed, reopened |
| `pull_request_review` | approved, changes requested, and comment reviews with a summary |
| `pull_request_review_comment` | replies in a review thread |
| `issues` | opened, closed (completed, not planned, duplicate), reopened |
| `issue_comment` | new comments on issues and pull requests |
| `release` | published releases and pre-releases, with images from the release notes |
| `workflow_run` | failures, and the first success after a failure |
| `deployment_status` | successful and failed deployments |
| `watch`, `fork` | new stars and forks |
| `discussion` | new and answered discussions |
| `gollum`, `member`, `public` | wiki edits, new collaborators, a repository going public |

New line comments in a review aren't posted on their own, because GitHub sends them together with the review, which already gets a card.

Hookline's replies show up in GitHub's **Recent Deliveries**: `200 Posted.`, `202 Skipped: …` for events it ignores, or `502` with Discord's error message.

## Security

- Every request is checked against GitHub's `X-Hub-Signature-256` signature. Requests that don't match are rejected.
- Mentions are disabled on every message, so text like `@everyone` in an issue can't ping your server.
- Hookline makes no calls to the GitHub API and needs no GitHub token.

## Development

```bash
bun test                 # render every GitHub example payload and check the output
bun run typecheck
bun run preview          # print the text of every rendered example
bun run dev              # run locally; copy .dev.vars.example to .dev.vars first
```

To see every card in a real channel, send the examples to a test webhook:

```bash
bun run demo -- https://discord.com/api/webhooks/ID/TOKEN
bun run demo -- https://discord.com/api/webhooks/ID/TOKEN push release
```

### Project layout

| Path | What it does |
| --- | --- |
| `src/index.ts` | Worker entry: routing, signature check, filtering |
| `src/render.ts` | `EventRouter`, which maps GitHub events to renderers |
| `src/events/` | one renderer per event family |
| `src/card.ts` | `CardBuilder`, the fluent builder every renderer uses |
| `src/discord.ts` | turns a card into a Components V2 message and sends it |
| `src/md.ts` | Discord markdown helpers |
| `src/verify.ts` | GitHub signature verification |

## License

[MIT](LICENSE)
