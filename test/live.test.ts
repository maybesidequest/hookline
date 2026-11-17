import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { ciPanel, type CiEmoji, type CiRun } from "../src/ci/panel";
import { PushTracker } from "../src/ci/tracker";
import { CardBuilder } from "../src/card";
import { DiscordWebhook, toDiscordMessage } from "../src/discord";

const emoji: CiEmoji = { pass: "<:hl_pass:1>", fail: "<:hl_fail:2>", running: "<a:hl_running:3>", skip: "<:hl_skip:4>" };
const sha = "4b7aa31c0ffee";
const run = (id: number, name: string, status: string, conclusion: string | null = null): CiRun => ({
  id,
  name,
  url: `https://github.com/o/r/actions/runs/${id}`,
  status,
  conclusion,
  startedAt: "2026-11-17T10:00:00Z",
  updatedAt: status === "completed" ? "2026-11-17T10:01:12Z" : "2026-11-17T10:00:05Z",
});

describe("ci panel", () => {
  it("shows running checks with no emoji in the heading", () => {
    const card = ciPanel([run(1, "Build", "in_progress"), run(2, "Lint", "completed", "success")], sha, emoji);
    expect(card.accent).toBe("warn");
    expect(card.head[0]).toBe("### **Running 1 check**");
    expect(card.body[0]).toContain("<a:hl_running:3> [Build](https://github.com/o/r/actions/runs/1) `running`");
    expect(card.body[0]).toContain("<:hl_pass:1> [Lint](https://github.com/o/r/actions/runs/2) `1m 12s`");
    expect(card.body[0]).toContain("-# `4b7aa31` · started <t:");
    expect(card.buttons).toEqual([]);
  });

  it("turns red with a logs button when a check fails", () => {
    const card = ciPanel([run(1, "Build", "completed", "failure"), run(2, "Lint", "in_progress")], sha, emoji);
    expect(card.accent).toBe("bad");
    expect(card.head[0]).toBe("### <:hl_fail:2> **Build failed**");
    expect(card.buttons[0].url).toBe("https://github.com/o/r/actions/runs/1");
  });

  it("goes green when everything passes and skips cancelled runs", () => {
    const card = ciPanel([run(1, "Build", "completed", "success"), run(2, "Docs", "completed", "cancelled")], sha, emoji);
    expect(card.accent).toBe("ok");
    expect(card.head[0]).toBe("### <:hl_pass:1> **All checks passed**");
    expect(card.body[0]).toContain("<:hl_skip:4> [Docs]");
    expect(card.body[0]).toContain("finished in 1m 12s");
  });
});

describe("discord webhook", () => {
  afterEach(() => mock.restore());

  it("puts each card in its own container", () => {
    const msg = toDiscordMessage(new CardBuilder("info").title("push").build(), new CardBuilder("ok").title("ci").build());
    expect(msg.components.map((c) => ("accent_color" in c ? c.accent_color : null))).toEqual([0x58a6ff, 0x3fb950]);
  });

  it("edits its own message", async () => {
    const f = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await new DiscordWebhook("https://discord.com/api/webhooks/1/a").edit("99", toDiscordMessage(new CardBuilder("ok").build()));
    const [url, init] = f.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://discord.com/api/webhooks/1/a/messages/99?with_components=true");
    expect(init.method).toBe("PATCH");
  });
});

class MemoryStorage {
  readonly data = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
  }
  async setAlarm(at: number) {
    this.alarm = at;
  }
  async deleteAll() {
    this.data.clear();
  }
}

describe("push tracker", () => {
  afterEach(() => mock.restore());
  const env = { DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/a" };
  const tracker = (storage: MemoryStorage) => new PushTracker({ storage } as any, env as any);
  const push = { channel: "", messageId: "42", sha, card: new CardBuilder("info").title("3 new commits").build() };

  it("keeps runs that arrive before the push and edits once it is tracked", async () => {
    const f = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const storage = new MemoryStorage();
    expect(await tracker(storage).update(run(1, "Build", "in_progress"))).toBe(false);
    expect(f).not.toHaveBeenCalled();
    await tracker(storage).start(push);
    const msg = JSON.parse((f.mock.calls[0] as [URL, RequestInit])[1].body as string);
    expect(msg.components).toHaveLength(2);
    expect(storage.alarm).not.toBeNull();
  });

  it("ignores stale updates and stops tracking a deleted message", async () => {
    const f = spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const storage = new MemoryStorage();
    await tracker(storage).start(push);
    await tracker(storage).update(run(1, "Build", "completed", "success"));
    await tracker(storage).update(run(1, "Build", "in_progress"));
    const last = JSON.parse((f.mock.calls.at(-1) as [URL, RequestInit])[1].body as string);
    expect(JSON.stringify(last)).toContain("All checks passed");
    f.mockResolvedValue(new Response("{}", { status: 404 }));
    await tracker(storage).update(run(2, "Lint", "in_progress"));
    expect(storage.data.size).toBe(0);
  });
});
