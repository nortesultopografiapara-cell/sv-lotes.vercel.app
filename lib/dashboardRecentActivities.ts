/**
 * Timeline operacional do Dashboard — somente leitura de lot_audit_logs.
 * Não inventa eventos; tipos ausentes simplesmente não aparecem.
 */

import type { LotAuditAction, LotAuditLogRow } from '@/lib/lotAudit';
import { formatLotAuditEvent } from '@/lib/lotAudit';

export const DASHBOARD_ACTIVITY_LIMIT = 8;

/** Eventos operacionais reais já gravados no audit de lote. */
export const DASHBOARD_ACTIVITY_ACTIONS: LotAuditAction[] = [
  'sold',
  'reserved',
  'contract_generated',
  'contract_regenerated',
  'payment_received',
  'payment_reversed',
  'sale_cancelled',
  'finance_created',
  'sale_edited',
  'status_changed',
  'customer_changed',
];

export type DashboardActivityItemData = {
  id: string;
  createdAt: string;
  action: string;
  title: string;
  subtitle: string;
};

export function isDashboardActivityAction(action: string): boolean {
  return (DASHBOARD_ACTIVITY_ACTIONS as string[]).includes(action);
}

export function mapLotAuditRowsToDashboardActivities(
  rows: LotAuditLogRow[],
  limit = DASHBOARD_ACTIVITY_LIMIT,
): DashboardActivityItemData[] {
  return (rows || [])
    .filter((row) => isDashboardActivityAction(String(row.action || '')))
    .slice(0, limit)
    .map((row) => {
      const formatted = formatLotAuditEvent(row);
      const subtitle =
        (formatted.description && formatted.description.trim()) ||
        formatted.sourceLabel;
      return {
        id: formatted.id,
        createdAt: formatted.createdAt,
        action: formatted.action,
        title: formatted.title || formatted.actionLabel,
        subtitle,
      };
    });
}
