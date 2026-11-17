const MARKDOWN_SPECIAL = /[\\`*_~|[\]()<>#]/g;
const LINE_START_SPECIAL = /^([-+>])/gm;
const MASS_MENTION = /@(everyone|here)/g;
const ZERO_WIDTH_SPACE = "​";
const CODE_FENCE = /```/g;
const SHORT_SHA_LENGTH = 7;
const EXCERPT_BREAK_RATIO = 0.6;
const SECONDS = { minute: 60, hour: 3600, day: 86400 } as const;

export const esc = (s: string) => s.replace(MARKDOWN_SPECIAL, "\\$&").replace(LINE_START_SPECIAL, "\\$1");

export const code = (s: string) => "`" + s.replace(/`/g, "ˋ") + "`";

export const defuseFences = (s: string) => s.replace(CODE_FENCE, "ˋˋˋ");

export const link = (label: string, url: string) => `[${label}](${url})`;

export const quietLink = (label: string, url: string) => `[${label}](<${url}>)`;

export const firstLine = (s: string) => s.split("\n")[0].trim();

export const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…");

export const shortSha = (sha: string) => sha.slice(0, SHORT_SHA_LENGTH);

export const plural = (n: number, word: string, many = word + "s") =>
  `${n.toLocaleString("en-US")} ${n === 1 ? word : many}`;

export const quote = (s: string) =>
  s
    .split("\n")
    .map((line) => "> " + line)
    .join("\n");

export const header = (repo: string, what: string) => `-# **${esc(repo)}** · ${what}`;

export const numberedTitle = (item: { number: number; title: string; html_url: string }, max = 120) =>
  link(`#${item.number} ${esc(truncate(item.title, max))}`, item.html_url);

export function who(login: string): string {
  const bot = login.match(/^(.+)\[bot\]$/);
  const name = bot ? bot[1] : login;
  const path = bot ? `apps/${encodeURIComponent(name)}` : encodeURIComponent(login);
  return quietLink(`@${esc(name)}`, `https://github.com/${path}`);
}

export function people(names: string[]): string {
  const unique = [...new Set(names)];
  if (unique.length <= 2) return unique.join(" and ");
  if (unique.length === 3) return `${unique[0]}, ${unique[1]} and ${unique[2]}`;
  return `${unique[0]}, ${unique[1]} and ${unique.length - 2} others`;
}

export function duration(from: string | number | Date, to: string | number | Date = Date.now()): string {
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  if (s < SECONDS.minute) return `${s}s`;
  if (s < SECONDS.hour) return `${Math.floor(s / SECONDS.minute)}m ${s % SECONDS.minute}s`;
  if (s < SECONDS.day) return plural(Math.round(s / SECONDS.hour), "hour");
  return plural(Math.round(s / SECONDS.day), "day");
}

function cleanBody(body: string): string {
  return body
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/^#{1,6}\s+(.*)$/gm, "**$1**")
    .replace(MASS_MENTION, `@${ZERO_WIDTH_SPACE}$1`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cutAtBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  return cut.slice(0, lastBreak > max * EXCERPT_BREAK_RATIO ? lastBreak : max).trimEnd() + "…";
}

function closeOpenFence(s: string): string {
  const fences = (s.match(CODE_FENCE) ?? []).length;
  return fences % 2 ? s + "\n```" : s;
}

export function excerpt(body: string | null | undefined, max = 300): string {
  if (!body) return "";
  return closeOpenFence(cutAtBoundary(cleanBody(body), max));
}

export function images(body: string | null | undefined, max = 4): string[] {
  if (!body) return [];
  const pattern = /!\[[^\]]*\]\((https:[^)\s]+)\)|<img[^>]+src="(https:[^"]+)"/g;
  return [...body.matchAll(pattern)].map((m) => m[1] ?? m[2]).slice(0, max);
}
