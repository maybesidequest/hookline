import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import worker from "../src/index";

const secret = "s3cret";
async function sign(body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

(crypto.subtle as any).timingSafeEqual ??= (a: Uint8Array, b: Uint8Array) => a.every((x, i) => x === b[i]);

const env = { GITHUB_WEBHOOK_SECRET: secret, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/a", DISCORD_WEBHOOK_RELEASES: "https://discord.com/api/webhooks/2/b" };
const star = JSON.stringify({ action: "started", repository: { full_name: "o/r", stargazers_count: 5 }, sender: { login: "kai", avatar_url: "https://x/y.png" } });
const req = async (path: string, body: string, event: string, sig?: string) =>
  new Request("https://hook.example" + path, { method: "POST", body, headers: { "x-github-event": event, "x-hub-signature-256": sig ?? (await sign(body)) } });

afterEach(() => mock.restore());

describe("worker", () => {
  it("rejects bad signatures", async () => {
    const res = await worker.fetch(await req("/", star, "watch", "sha256=00"), env as any);
    expect(res.status).toBe(401);
  });

  it("posts to the channel's webhook with components enabled", async () => {
    const f = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const res = await worker.fetch(await req("/releases", star, "watch"), env as any);
    expect(res.status).toBe(200);
    const [url, init] = f.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://discord.com/api/webhooks/2/b?with_components=true");
    const msg = JSON.parse(init.body as string);
    expect(msg.flags).toBe(32768);
    expect(msg.allowed_mentions).toEqual({ parse: [] });
  });

  it("answers ping and skips unknown events without calling Discord", async () => {
    const f = spyOn(globalThis, "fetch");
    expect((await worker.fetch(await req("/", "{}", "ping"), env as any)).status).toBe(200);
    expect((await worker.fetch(await req("/", "{}", "label"), env as any)).status).toBe(202);
    expect(f).not.toHaveBeenCalled();
  });

  it("404s an unconfigured channel", async () => {
    expect((await worker.fetch(await req("/nope", star, "watch"), env as any)).status).toBe(404);
  });
});
