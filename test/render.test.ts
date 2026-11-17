import examples from "@octokit/webhooks-examples";
import { describe, expect, it } from "bun:test";
import { toDiscordMessage } from "../src/discord";
import { githubEvents } from "../src/render";
import { allExamples } from "../scripts/examples";

type Comp = { type: number; content?: string; components?: Comp[]; accessory?: Comp; url?: string };

function walk(c: Comp, out: Comp[] = []): Comp[] {
  out.push(c);
  c.components?.forEach((child) => walk(child, out));
  if (c.accessory) walk(c.accessory, out);
  return out;
}

const componentsOf = (card: NonNullable<Awaited<ReturnType<typeof githubEvents.render>>>) =>
  walk(toDiscordMessage(card).components[0] as unknown as Comp);

const textOf = (card: Parameters<typeof componentsOf>[0]) =>
  componentsOf(card)
    .map((c) => c.content ?? "")
    .join("\n");

const cases = allExamples
  .filter((e) => githubEvents.supports(e.event))
  .map((e, i) => [`${e.event} ${e.label} #${i}`, e.event, e.payload] as const);

describe("every example payload", () => {
  it("covers every supported event", () => {
    const covered = new Set(cases.map(([, event]) => event));
    expect(githubEvents.events.filter((e) => !covered.has(e))).toEqual([]);
  });

  it.each(cases)("%s", async (_, event, payload) => {
    const card = await githubEvents.render(event, payload);
    if (!card) return;
    const all = componentsOf(card);
    const texts = all.filter((c) => c.type === 10).map((c) => c.content ?? "");
    expect(texts.every((t) => t.trim().length > 0)).toBe(true);
    expect(texts.join("").length).toBeLessThanOrEqual(4000);
    expect(texts.join("")).not.toMatch(/undefined|null|NaN|\[object/);
    for (const button of all.filter((c) => c.type === 2)) expect(button.url).toMatch(/^https:\/\//);
    for (const section of all.filter((c) => c.type === 9)) expect(section.accessory).toBeTruthy();
  });
});

describe("push", () => {
  const multi = allExamples.find((e) => e.label === "several commits")!.payload;
  const force = allExamples.find((e) => e.label === "force push")!.payload;
  const base = examples.find((e) => e.name === "push")!.examples[0] as object;

  it("links every author for multi-commit pushes", async () => {
    const text = textOf((await githubEvents.render("push", multi))!);
    expect(text).toContain("by [@Codertocat](<https://github.com/Codertocat>) and [@octocat](<https://github.com/octocat>)");
    expect(text).toContain("· **octocat**");
    expect(text).toContain("3 new commits");
  });

  it("shows a force push as a diff from the previous head", async () => {
    const text = textOf((await githubEvents.render("push", force))!);
    expect(text).toContain("```diff\n- 9c1e002 previous head\n+ 7be2041 Add rate limit headers to hub broadcasts (Codertocat)");
  });

  it("puts the repo line in its own text display", async () => {
    const card = (await githubEvents.render("push", multi))!;
    const section = componentsOf(card).find((c) => c.type === 9)!;
    expect(section.components!.map((c) => c.content!.split("\n")[0].slice(0, 3))).toEqual(["-# ", "###"]);
  });

  it("skips tag pushes and branch deletions", async () => {
    expect(await githubEvents.render("push", { ...base, ref: "refs/tags/v1" })).toBeNull();
    expect(await githubEvents.render("push", { ...base, deleted: true })).toBeNull();
  });
});

describe("workflow_run", () => {
  const completed = examples.find((e) => e.name === "workflow_run")!.examples.find((p: any) => p.action === "completed") as any;
  const run = (conclusion: string) => ({ ...completed, workflow_run: { ...completed.workflow_run, conclusion } });
  const memoryKv = () => {
    const store = new Map<string, string>();
    return {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => void store.set(k, v),
    } as unknown as KVNamespace;
  };

  it("posts failures and only the first success after one", async () => {
    const kv = memoryKv();
    expect(await githubEvents.render("workflow_run", run("success"), { kv })).toBeNull();
    expect((await githubEvents.render("workflow_run", run("failure"), { kv }))?.accent).toBe("bad");
    expect((await githubEvents.render("workflow_run", run("success"), { kv }))?.accent).toBe("ok");
    expect(await githubEvents.render("workflow_run", run("success"), { kv })).toBeNull();
  });
});

describe("unknown events", () => {
  it("renders nothing", async () => {
    expect(await githubEvents.render("label", {})).toBeNull();
    expect(githubEvents.supports("toString")).toBe(false);
  });
});
