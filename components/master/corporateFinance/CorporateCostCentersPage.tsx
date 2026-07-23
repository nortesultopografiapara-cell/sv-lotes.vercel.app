'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, X } from 'lucide-react';
import type { MasterCorporateCostCenter } from '@/lib/master/corporateFinance/types';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import styles from './corporateFinance.module.css';

type FormState = {
  code: string;
  name: string;
  project_id: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  code: '',
  name: '',
  project_id: '',
  is_active: true,
};

type ProjectOption = { id: string; code: string; title: string };

function CostCentersInner() {
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [rows, setRows] = useState<MasterCorporateCostCenter[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterCorporateCostCenter | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [ccRes, projRes] = await Promise.all([
        fetch(`/api/master/corporate-finance/cost-centers?${qs()}&includeInactive=1`),
        fetch(`/api/master/topography/projects?${qs()}&limit=100&includeArchived=0`),
      ]);
      const ccData = await ccRes.json();
      if (!ccRes.ok) throw new Error(ccData.error || 'Falha ao listar centros.');
      setRows(ccData.costCenters || []);

      if (projRes.ok) {
        const projData = await projRes.json();
        const list = (projData.projects || projData.items || []) as Array<{
          id: string;
          code: string;
          title: string;
        }>;
        setProjects(
          list.map((p) => ({ id: p.id, code: p.code, title: p.title })).filter((p) => p.id),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [userId, qs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial / refresh
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(c: MasterCorporateCostCenter) {
    setEditing(c);
    setForm({
      code: c.code,
      name: c.name,
      project_id: c.project_id || '',
      is_active: c.is_active,
    });
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...bodyAuth(),
        code: form.code || null,
        name: form.name,
        project_id: form.project_id || null,
        is_active: form.is_active,
      };
      const url = editing
        ? `/api/master/corporate-finance/cost-centers/${editing.id}`
        : '/api/master/corporate-finance/cost-centers';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: MasterCorporateCostCenter) {
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/cost-centers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyAuth(), is_active: !c.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar status.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar.');
    }
  }

  const projectLabel = (id: string | null) => {
    if (!id) return '—';
    const p = projects.find((x) => x.id === id);
    return p ? `${p.code} — ${p.title}` : id.slice(0, 8);
  };

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>Financeiro Corporativo</p>
            <h1 className={styles.title}>Centros de resultado</h1>
            <p className={styles.subtitle}>
              Código, nome e vínculo opcional a projeto Master. Nenhum centro é criado
              automaticamente por projeto nesta fase.
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/master/topography/finance" className={`${styles.btn} ${styles.btnGhost}`}>
              <ArrowLeft className="w-4 h-4" />
              Hub
            </Link>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Novo centro
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Centros cadastrados</h2>
          </div>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : rows.length === 0 ? (
            <p className={styles.muted}>Nenhum centro cadastrado.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Projeto</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.code}</td>
                      <td>{c.name}</td>
                      <td>{projectLabel(c.project_id)}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${c.is_active ? styles.badgeOn : styles.badgeOff}`}
                        >
                          {c.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            onClick={() => openEdit(c)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            onClick={() => void toggleActive(c)}
                          >
                            {c.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modalOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>{editing ? 'Editar centro' : 'Novo centro'}</h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.label}>Nome *</label>
                <input
                  className={styles.input}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className={styles.label}>
                  Código {editing ? '' : '(opcional — gera CEN-AAAA-NNNN)'}
                </label>
                <input
                  className={styles.input}
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder={editing ? undefined : 'Deixe vazio para gerar automaticamente'}
                />
              </div>
              <div>
                <label className={styles.label}>Projeto Master (opcional)</label>
                <select
                  className={styles.select}
                  value={form.project_id}
                  onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                >
                  <option value="">— Nenhum —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Ativo
              </label>
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CorporateCostCentersPage() {
  return (
    <CorporateFinanceGuard>
      <CostCentersInner />
    </CorporateFinanceGuard>
  );
}
