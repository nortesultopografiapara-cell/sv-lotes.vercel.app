'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { equipmentCategoryLabel } from '@/lib/master/topography/equipmentCategories';
import type {
  MasterTopographyEquipment,
  MasterTopographyEquipmentKpis,
} from '@/lib/master/topography/equipmentTypes';
import { EquipmentFilters, type EquipmentFiltersState } from './EquipmentFilters';
import {
  EquipmentFormModal,
  formToEquipmentPayload,
} from './EquipmentFormModal';
import { EquipmentKpiRow } from './EquipmentKpiRow';
import { EquipmentStatusBadge } from './EquipmentStatusBadge';
import styles from './equipment.module.css';

const EMPTY_KPIS: MasterTopographyEquipmentKpis = {
  total: 0,
  available: 0,
  inUse: 0,
  reserved: 0,
  maintenance: 0,
  calibration: 0,
  decommissioned: 0,
  patrimonialValue: 0,
  calibrationDueSoon: 0,
};

function formatCurrency(val: number | null | undefined) {
  if (val == null || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function EquipmentPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openNew = searchParams.get('new') === '1';

  const [items, setItems] = useState<MasterTopographyEquipment[]>([]);
  const [kpis, setKpis] = useState<MasterTopographyEquipmentKpis>(EMPTY_KPIS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [filters, setFilters] = useState<EquipmentFiltersState>({
    q: '',
    category: '',
    status: '',
    responsible: '',
    location: '',
    includeArchived: false,
  });
  const [qDebounced, setQDebounced] = useState('');
  const [responsibleDebounced, setResponsibleDebounced] = useState('');
  const [locationDebounced, setLocationDebounced] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MasterTopographyEquipment | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(filters.q.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  useEffect(() => {
    const t = setTimeout(() => setResponsibleDebounced(filters.responsible.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.responsible]);

  useEffect(() => {
    const t = setTimeout(() => setLocationDebounced(filters.location.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.location]);

  useEffect(() => {
    if (openNew) {
      setEditTarget(null);
      setFormError(null);
      setModalOpen(true);
      router.replace('/master/topography/equipment');
    }
  }, [openNew, router]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        userId: user.id,
        page: String(page),
        limit: String(limit),
      });
      if (qDebounced) params.set('q', qDebounced);
      if (filters.category) params.set('category', filters.category);
      if (filters.status) params.set('status', filters.status);
      if (responsibleDebounced) params.set('responsible', responsibleDebounced);
      if (locationDebounced) params.set('location', locationDebounced);
      if (filters.includeArchived) params.set('includeArchived', '1');

      const res = await fetch(`/api/master/topography/equipment?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar equipamentos.');
      setItems(data.equipment || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || EMPTY_KPIS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    user?.id,
    page,
    limit,
    qDebounced,
    filters.category,
    filters.status,
    filters.includeArchived,
    responsibleDebounced,
    locationDebounced,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const openCreate = () => {
    setEditTarget(null);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: MasterTopographyEquipment) => {
    setEditTarget(row);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (payload: ReturnType<typeof formToEquipmentPayload>) => {
    if (!user?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = Boolean(editTarget?.id);
      const res = await fetch(
        isEdit
          ? `/api/master/topography/equipment/${editTarget!.id}`
          : '/api/master/topography/equipment',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, userId: user.id }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar equipamento.');
      setModalOpen(false);
      setToast(isEdit ? 'Equipamento atualizado.' : `Equipamento ${data.equipment?.code || ''} criado.`);
      await load();
      if (!isEdit && data.equipment?.id) {
        router.push(`/master/topography/equipment/${data.equipment.id}`);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (row: MasterTopographyEquipment, archived: boolean) => {
    if (!user?.id) return;
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/master/topography/equipment/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          patchOnly: true,
          is_archived: archived,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar arquivamento.');
      setToast(archived ? `Equipamento ${row.code} arquivado.` : `Equipamento ${row.code} restaurado.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao arquivar/restaurar.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Equipamentos</h1>
          <p className={styles.subtitle}>
            Cadastro e gestão patrimonial dos equipamentos da SV Topografia &amp; Projetos —
            exclusivo do Master.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()}>
            <RefreshCw width={14} height={14} />
            Atualizar
          </button>
          <button type="button" className={styles.btnPrimary} onClick={openCreate}>
            <Plus width={14} height={14} />
            Novo equipamento
          </button>
        </div>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <EquipmentKpiRow kpis={kpis} />

      <EquipmentFilters
        value={filters}
        onChange={(next) => {
          setPage(1);
          setFilters(next);
        }}
      />

      <div className={styles.panel}>
        {loading ? (
          <div className={styles.loading}>Carregando equipamentos…</div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>Nenhum equipamento encontrado</h2>
            <p>
              Cadastre o primeiro equipamento patrimonial ou ajuste os filtros. O código
              sequencial EQP-AAAA-NNNN é gerado automaticamente.
            </p>
            <button type="button" className={styles.btnPrimary} onClick={openCreate}>
              <Plus width={14} height={14} />
              Novo equipamento
            </button>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Equipamento</th>
                    <th>Categoria</th>
                    <th>Fabricante / Modelo</th>
                    <th>Série</th>
                    <th>Patrimônio</th>
                    <th>Status</th>
                    <th>Responsável</th>
                    <th>Localização</th>
                    <th>Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.codeCell}>
                        {row.code}
                        {row.is_archived ? (
                          <span className={styles.archivedTag}>Arquivado</span>
                        ) : null}
                      </td>
                      <td className={styles.nameCell}>{row.name}</td>
                      <td>{equipmentCategoryLabel(row.category)}</td>
                      <td>
                        {[row.manufacturer, row.model].filter(Boolean).join(' / ') || (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td>{row.serial_number || <span className={styles.muted}>—</span>}</td>
                      <td>{row.asset_number || <span className={styles.muted}>—</span>}</td>
                      <td>
                        <EquipmentStatusBadge status={row.status} />
                      </td>
                      <td>{row.responsible_name || <span className={styles.muted}>—</span>}</td>
                      <td>{row.location || <span className={styles.muted}>—</span>}</td>
                      <td>{formatCurrency(row.purchase_value)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <Link
                            className={styles.btnGhost}
                            href={`/master/topography/equipment/${row.id}`}
                          >
                            Detalhes
                          </Link>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => openEdit(row)}
                            disabled={busyId === row.id}
                          >
                            Editar
                          </button>
                          {row.is_archived ? (
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              onClick={() => void setArchived(row, false)}
                              disabled={busyId === row.id}
                            >
                              Restaurar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.btnDanger}
                              onClick={() => void setArchived(row, true)}
                              disabled={busyId === row.id}
                            >
                              Arquivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>
                {total} registro{total === 1 ? '' : 's'} · página {page} de {totalPages}
              </span>
              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <EquipmentFormModal
        open={modalOpen}
        mode={editTarget ? 'edit' : 'create'}
        initial={editTarget}
        saving={saving}
        error={formError}
        userId={user?.id || ''}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        onSubmit={handleSave}
      />

      {toast ? (
        <div className={styles.toast}>
          {toast}
          <button
            type="button"
            style={{
              marginLeft: 12,
              background: 'transparent',
              border: 'none',
              color: '#93c5fd',
              cursor: 'pointer',
            }}
            onClick={() => setToast(null)}
          >
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function EquipmentPage() {
  return (
    <MasterSuperAdminGuard>
      <EquipmentPageInner />
    </MasterSuperAdminGuard>
  );
}
