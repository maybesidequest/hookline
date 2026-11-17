import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  SeparatorSpacingSize,
  type APIActionRowComponent,
  type APIButtonComponentWithURL,
  type APIComponentInContainer,
  type APIContainerComponent,
  type APISectionComponent,
  type APITextDisplayComponent,
  type RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";
import { Accent, type Card } from "./card";

const TEXT_LIMIT = 4000;
const TEXT_SAFETY_MARGIN = 50;
const MAX_BUTTONS = 5;
const MAX_GALLERY_ITEMS = 10;
const MAX_BUTTON_LABEL = 80;
const MAX_RETRY_AFTER_SECONDS = 5;
const HTTP_TOO_MANY_REQUESTS = 429;

export type DiscordMessage = RESTPostAPIWebhookWithTokenJSONBody & { components: [APIContainerComponent] };

const textDisplay = (content: string): APITextDisplayComponent => ({ type: ComponentType.TextDisplay, content });

function headerBlocks(card: Card): APIComponentInContainer[] {
  const [repoLine, ...rest] = card.head;
  const texts = [repoLine, rest.join("\n")].filter(Boolean).map(textDisplay);
  if (!card.avatar) return texts;
  const section: APISectionComponent = {
    type: ComponentType.Section,
    components: texts,
    accessory: { type: ComponentType.Thumbnail, media: { url: card.avatar } },
  };
  return [section];
}

function fitToBudget(pieces: string[], budget: number): string[] {
  const fitted: string[] = [];
  let remaining = budget;
  for (const piece of pieces) {
    if (remaining <= 0) break;
    const fit = piece.length > remaining ? piece.slice(0, remaining - 1) + "…" : piece;
    fitted.push(fit);
    remaining -= fit.length;
  }
  return fitted;
}

function bodyBlocks(card: Card): APIComponentInContainer[] {
  const used = card.head.join("\n").length + TEXT_SAFETY_MARGIN;
  const body = fitToBudget(card.body, TEXT_LIMIT - used).map(textDisplay);
  const gallery = card.gallery.slice(0, MAX_GALLERY_ITEMS);
  if (!body.length && !gallery.length) return [];
  const blocks: APIComponentInContainer[] = [
    { type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small },
  ];
  if (gallery.length) {
    blocks.push({ type: ComponentType.MediaGallery, items: gallery.map((url) => ({ media: { url } })) });
  }
  return [...blocks, ...body];
}

function buttonRow(card: Card): APIActionRowComponent<APIButtonComponentWithURL>[] {
  const buttons = card.buttons.slice(0, MAX_BUTTONS);
  if (!buttons.length) return [];
  return [
    {
      type: ComponentType.ActionRow,
      components: buttons.map(({ label, url }) => ({
        type: ComponentType.Button,
        style: ButtonStyle.Link,
        label: label.slice(0, MAX_BUTTON_LABEL),
        url,
      })),
    },
  ];
}

export function toDiscordMessage(card: Card): DiscordMessage {
  return {
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: ComponentType.Container,
        accent_color: Accent[card.accent],
        components: [...headerBlocks(card), ...bodyBlocks(card), ...buttonRow(card)],
      },
    ],
  };
}

type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

export class DiscordWebhook {
  private readonly url: URL;

  constructor(
    webhookUrl: string,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {
    this.url = new URL(webhookUrl);
    this.url.searchParams.set("with_components", "true");
  }

  async send(message: DiscordMessage): Promise<Response> {
    const res = await this.post(message);
    if (res.status !== HTTP_TOO_MANY_REQUESTS) return res;
    const wait = await this.retryAfter(res);
    if (wait > MAX_RETRY_AFTER_SECONDS) return res;
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return this.post(message);
  }

  private post(message: DiscordMessage): Promise<Response> {
    return this.fetcher(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
  }

  private async retryAfter(res: Response): Promise<number> {
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
    return body.retry_after ?? 1;
  }
}
