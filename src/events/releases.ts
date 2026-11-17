import type { ReleaseEvent } from "@octokit/webhooks-types";
import { CardBuilder } from "../card";
import { code, esc, excerpt, images, link, truncate, who } from "../md";
import { byAction } from "./types";

const NAME_LENGTH = 100;
const PRERELEASE_EXCERPT_LENGTH = 300;
const RELEASE_EXCERPT_LENGTH = 700;

export const release = byAction<ReleaseEvent>({
  published: (p) => {
    const r = p.release;
    const base = new CardBuilder(r.prerelease ? "warn" : "merged")
      .avatar(r.author.avatar_url)
      .header(p.repository.full_name, r.prerelease ? "pre-release" : "new release")
      .title(link(esc(truncate(r.name || r.tag_name, NAME_LENGTH)), r.html_url), r.prerelease ? 3 : 2)
      .meta(`${code(r.tag_name)} · by ${who(r.author.login)}`);
    const withBody = r.prerelease
      ? base.body(excerpt(r.body, PRERELEASE_EXCERPT_LENGTH))
      : base.gallery(images(r.body)).body(excerpt(r.body, RELEASE_EXCERPT_LENGTH));
    return withBody.button("Release notes", r.html_url).build();
  },
});
