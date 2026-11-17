import { githubEvents } from "../src/render";
import { allExamples } from "./examples";

for (const { event, label, payload } of allExamples) {
  const card = await githubEvents.render(event, payload);
  const name = `${event}.${label}`;
  if (!card) {
    if (githubEvents.supports(event)) console.log(`· ${name}: skipped\n`);
    continue;
  }
  const text = [...card.head, ...card.body].join("\n");
  const buttons = card.buttons.map(({ label: l }) => `[${l}]`).join(" ");
  console.log(`■ ${name} [${card.accent}]\n${text}\n${buttons}\n`);
}
