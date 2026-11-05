import type { DataAppPublic, DataScope, DatabaseSchema } from "../data-source/public.ts";

export function mapScope(data: DataAppPublic): DataScope {
  const { context } = data.getSnapshot();
  if (!context.available || !context.chatIdentity || !context.scopeId) {
    throw new Error(context.message ?? "当前 Memory 资料不可用");
  }
  return { chatIdentity: context.chatIdentity, scopeId: context.scopeId };
}
export const stableMapKey = (schema: DatabaseSchema): string =>
  JSON.stringify([schema.sourceId, schema.stableScopeId]);
