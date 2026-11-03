export function logAssistantReadonlyTool(event: {
  toolId: string;
  tenantId: string | null;
  userId: string;
  durationMs: number;
  ok: boolean;
  rowCount: number;
}) {
  console.info('[assistant.readonly_tool]', {
    toolId: event.toolId,
    tenantId: event.tenantId,
    userId: event.userId,
    durationMs: event.durationMs,
    ok: event.ok,
    rowCount: event.rowCount,
  });
}
