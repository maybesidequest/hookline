import type { DiscussionEvent, ForkEvent, GollumEvent, MemberEvent, PublicEvent, WatchEvent } from "@octokit/webhooks-types";
import { CardBuilder } from "../card";
import { esc, excerpt, link, plural, quote, truncate, who } from "../md";
import { byAction, type Renderer } from "./types";

const EXCERPT_LENGTH = 300;
const TITLE_LENGTH = 120;

interface DiscussionAnswer {
  body: string;
  user: { login: string; avatar_url: string };
}

export const watch: Renderer<WatchEvent> = (p) =>
  new CardBuilder("gold")
    .avatar(p.sender.avatar_url)
    .header(p.repository.full_name, "new star")
    .title(`${who(p.sender.login)} starred the repo`)
    .meta(plural(p.repository.stargazers_count, "star"))
    .build();

export const fork: Renderer<ForkEvent> = (p) =>
  new CardBuilder("gold")
    .avatar(p.sender.avatar_url)
    .header(p.repository.full_name, `forked by ${who(p.sender.login)}`)
    .title(link(esc(p.forkee.full_name), p.forkee.html_url))
    .meta(plural(p.repository.forks_count, "fork"))
    .build();

const discussionTitle = (p: DiscussionEvent) => link(esc(truncate(p.discussion.title, TITLE_LENGTH)), p.discussion.html_url);
const category = (p: DiscussionEvent) => `**${esc(p.discussion.category.name)}**`;

export const discussion = byAction<DiscussionEvent>({
  created: (p) =>
    new CardBuilder("info")
      .avatar(p.sender.avatar_url)
      .header(p.repository.full_name, `new discussion in ${category(p)}`)
      .title(discussionTitle(p))
      .meta(`by ${who(p.discussion.user.login)}`)
      .body(excerpt(p.discussion.body, EXCERPT_LENGTH))
      .button("Join discussion", p.discussion.html_url)
      .build(),
  answered: (p) => {
    const answer = (p as { answer?: DiscussionAnswer }).answer;
    return new CardBuilder("merged")
      .avatar(answer?.user.avatar_url ?? p.sender.avatar_url)
      .header(p.repository.full_name, `discussion answered in ${category(p)}`)
      .title(discussionTitle(p))
      .meta(answer && `answer by ${who(answer.user.login)} marked accepted`)
      .body(answer && quote(excerpt(answer.body, EXCERPT_LENGTH)))
      .build();
  },
});

export const gollum: Renderer<GollumEvent> = (p) => {
  const [first] = p.pages;
  if (!first) return null;
  return new CardBuilder("info")
    .avatar(p.sender.avatar_url)
    .header(p.repository.full_name, `wiki updated by ${who(p.sender.login)}`)
    .title(link(esc(first.title), first.html_url))
    .meta(`${plural(p.pages.length, "page")} edited · ${p.pages.map((page) => esc(page.title)).join(", ")}`)
    .build();
};

export const member = byAction<MemberEvent>({
  added: (p) => {
    const permission = ((p as unknown as { changes?: { permission?: { to?: string } } }).changes)?.permission?.to;
    return new CardBuilder("ok")
      .avatar(p.member.avatar_url)
      .header(p.repository.full_name, "new collaborator")
      .title(`${who(p.member.login)} joined${permission ? ` with ${esc(permission)} access` : ""}`)
      .meta(`added by ${who(p.sender.login)}`)
      .build();
  },
});

export const publicized: Renderer<PublicEvent> = (p) =>
  new CardBuilder("gold")
    .avatar(p.sender.avatar_url)
    .header(p.repository.full_name, "is now public")
    .title(link(esc(p.repository.full_name), p.repository.html_url))
    .meta("anyone can see and fork it")
    .build();
