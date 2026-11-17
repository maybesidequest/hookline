import type { Card } from "../card";

export interface RenderContext {
  kv?: KVNamespace;
}

export type Renderer<P> = (payload: P, ctx: RenderContext) => Card | null | Promise<Card | null>;

export function byAction<P extends { action: string }>(handlers: Record<string, Renderer<P>>): Renderer<P> {
  return (payload, ctx) => handlers[payload.action]?.(payload, ctx) ?? null;
}
