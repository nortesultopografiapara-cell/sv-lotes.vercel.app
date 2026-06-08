'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  flattenCustomerAuditForDisplay,
  type CustomerAuditDisplayEntry,
} from '@/lib/customerAudit';

type Props = {
  customer: { id: string; name?: string | null } | null;
  onClose: () => void;
};

export function CustomerAuditHistoryModal({ customer, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CustomerAuditDisplayEntry[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!customer?.id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('customer_audit_logs')
          .select('*')
          .eq('customer_id', customer!.id)
          .order('changed_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        if (!cancelled) {
          const flat = flattenCustomerAuditForDisplay((data || []) as never);
          setEntries(flat);
          const userIds = [
            ...new Set(
              flat.map((e) => e.changedBy).filter((id): id is string => !!id),
            ),
          ];
          if (userIds.length) {
            const { data: users } = await supabase
              .from('users')
              .select('id, name, email')
              .in('id', userIds);
            const map: Record<string, string> = {};
            for (const u of users || []) {
              map[u.id] = u.name || u.email || u.id.slice(0, 8);
            }
            if (!cancelled) setUserNames(map);
          }
        }
      } catch (err) {
        console.warn('CUSTOMER_AUDIT_HISTORY', err);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [customer?.id]);

  if (!customer) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">
              Histórico — {customer.name || 'Cliente'}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Alterações cadastrais (mais recente primeiro)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--color-surface-bright)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-10">
              Nenhuma alteração cadastral registrada para este cliente.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="p-2 font-bold">Data/Hora</th>
                    <th className="p-2 font-bold">Usuário</th>
                    <th className="p-2 font-bold">Campo</th>
                    <th className="p-2 font-bold">Anterior</th>
                    <th className="p-2 font-bold">Novo</th>
                    <th className="p-2 font-bold">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-surface-bright)]"
                    >
                      <td className="p-2 text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap">
                        {new Date(entry.changedAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-2 text-xs text-[var(--color-text-muted)] max-w-[120px] truncate">
                        {entry.changedBy
                          ? userNames[entry.changedBy] ||
                            `${entry.changedBy.slice(0, 8)}…`
                          : '—'}
                      </td>
                      <td className="p-2 text-[var(--text-primary)] font-medium">
                        {entry.fieldLabel}
                      </td>
                      <td className="p-2 text-[var(--color-text-muted)] max-w-[140px] truncate">
                        {entry.oldValue}
                      </td>
                      <td className="p-2 text-[var(--text-primary)] max-w-[140px] truncate">
                        {entry.newValue}
                      </td>
                      <td className="p-2 text-xs text-[var(--color-text-muted)]">
                        {entry.sourceLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
