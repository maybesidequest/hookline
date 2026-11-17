import { header } from "./md";

export const Accent = {
  ok: 0x3fb950,
  merged: 0xa371f7,
  bad: 0xf85149,
  draft: 0x8b949e,
  info: 0x58a6ff,
  warn: 0xd29922,
  gold: 0xe3b341,
} as const;

export type AccentName = keyof typeof Accent;

export interface LinkButton {
  label: string;
  url: string;
}

export interface Card {
  accent: AccentName;
  head: string[];
  avatar?: string;
  body: string[];
  gallery: string[];
  buttons: LinkButton[];
}

export class CardBuilder {
  private readonly card: Card;

  constructor(accent: AccentName) {
    this.card = { accent, head: [], body: [], gallery: [], buttons: [] };
  }

  header(repo: string, what: string): this {
    this.card.head.unshift(header(repo, what));
    return this;
  }

  title(text: string, level: 2 | 3 = 3): this {
    this.card.head.push(`${"#".repeat(level)} ${text}`);
    return this;
  }

  meta(text: string | null | undefined | false): this {
    if (text) this.card.head.push(`-# ${text}`);
    return this;
  }

  avatar(url: string | undefined): this {
    this.card.avatar = url;
    return this;
  }

  body(text: string | null | undefined | false): this {
    if (text && text.trim()) this.card.body.push(text);
    return this;
  }

  gallery(urls: string[]): this {
    this.card.gallery.push(...urls);
    return this;
  }

  button(label: string, url: string | undefined | null): this {
    if (url) this.card.buttons.push({ label, url });
    return this;
  }

  build(): Card {
    return {
      ...this.card,
      head: [...this.card.head],
      body: [...this.card.body],
      gallery: [...this.card.gallery],
      buttons: [...this.card.buttons],
    };
  }
}
