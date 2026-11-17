import examples from "@octokit/webhooks-examples";

export interface Example {
  event: string;
  label: string;
  payload: unknown;
}

type PushPayload = Record<string, any>;

const basePush = examples
  .find((e) => e.name === "push")!
  .examples.find((p) => (p as { commits: unknown[] }).commits.length) as PushPayload;

function commit(id: string, message: string, user: string, files: string[]) {
  return {
    ...basePush.commits[0],
    id,
    message,
    url: `${basePush.repository.html_url}/commit/${id}`,
    author: { name: user, email: "", username: user },
    added: [],
    modified: files,
    removed: [],
  };
}

const commits = [
  commit("a1f3c9e5d2b7", "Bump discord.js to 14.16.3", "Codertocat", ["package.json", "package-lock.json"]),
  commit("3d09aa17b8c1", "Fix race in reconnect backoff", "octocat", ["src/gateway/reconnect.ts"]),
  commit("7be2041c4fa9", "Add rate limit headers to hub broadcasts", "Codertocat", ["src/hubs/broadcast.ts"]),
];

const syntheticPushes: Example[] = [
  { event: "push", label: "several commits", payload: { ...basePush, forced: false, after: "7be2041c4fa9", commits } },
  {
    event: "push",
    label: "force push",
    payload: { ...basePush, forced: true, before: "9c1e0021aa3b", after: "7be2041c4fa9", commits },
  },
];

export const allExamples: Example[] = [
  ...examples.flatMap((group) =>
    group.examples.map((payload) => ({
      event: group.name as string,
      label: (payload as { action?: string }).action ?? "",
      payload: payload as unknown,
    })),
  ),
  ...syntheticPushes,
];
