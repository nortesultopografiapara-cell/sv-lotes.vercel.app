'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OPERATION_ATTENDANCE_STATUSES,
  type MasterTopographyOperationTeamMember,
} from '@/lib/master/topography/operationTeamTypes';
import styles from '../operation.module.css';

type Props = {
  operationId: string;
  userId: string;
  active: boolean;
  onToast: (msg: string) => void;
  onError: (msg: string | null) => void;
};

function formatDt(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
}

export function OperationTeamPanel({ operationId, userId, active, onToast, onError }: Props) {
  const [team, setTeam] = useState<MasterTopographyOperationTeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [attendance, setAttendance] = useState('PLANNED');
  const [isLead, setIsLead] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !operationId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `userId=${encodeURIComponent(userId)}`;
      const res = await fetch(`/api/master/topography/operations/${operationId}/team?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar equipe.');
      setTeam(data.team || []);
    } catch (err) {
      setTeam([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar equipe.');
    } finally {
      setLoading(false);
    }
  }, [operationId, userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const addMember = async () => {
    if (!name.trim()) {
      setFormError('Nome é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${operationId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: name.trim(),
          role: role.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          attendance_status: attendance,
          is_lead: isLead,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao adicionar integrante.');
      setShowForm(false);
      setName('');
      setRole('');
      setPhone('');
      setEmail('');
      setIsLead(false);
      onToast('Integrante adicionado.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao adicionar.');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!window.confirm('Remover integrante da equipe?')) return;
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/team/${memberId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao remover.');
      onToast('Integrante removido.');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao remover.');
    }
  };

  if (!active) return null;

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Equipe</h3>
        <div className={styles.rowActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
            Atualizar
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              setFormError(null);
              setShowForm((v) => !v);
            }}
          >
            {showForm ? 'Fechar formulário' : 'Adicionar integrante'}
          </button>
        </div>
      </div>

      {error ? <div className={styles.formError}>{error}</div> : null}
      {loading ? <p className={styles.muted}>Carregando equipe…</p> : null}

      {showForm ? (
        <div className={styles.formGrid} style={{ marginBottom: '0.85rem' }}>
          {formError ? <div className={`${styles.formError} ${styles.fieldFull}`}>{formError}</div> : null}
          <div className={styles.field}>
            <label htmlFor="team-name">Nome *</label>
            <input
              id="team-name"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="team-role">Função</label>
            <input
              id="team-role"
              className={styles.input}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="team-phone">Telefone</label>
            <input
              id="team-phone"
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="team-email">E-mail</label>
            <input
              id="team-email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="team-att">Presença</label>
            <select
              id="team-att"
              className={styles.select}
              value={attendance}
              onChange={(e) => setAttendance(e.target.value)}
            >
              {OPERATION_ATTENDANCE_STATUSES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={isLead} onChange={(e) => setIsLead(e.target.checked)} />
            Líder da equipe
          </label>
          <div className={styles.fieldFull}>
            <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => void addMember()}>
              {saving ? 'Salvando…' : 'Salvar integrante'}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && team.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Nenhum integrante</h2>
          <p>Adicione colaboradores para compor a equipe de campo desta OS.</p>
        </div>
      ) : null}

      {team.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Função</th>
                <th>Contato</th>
                <th>Presença</th>
                <th>Líder</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.id}>
                  <td className={styles.nameCell}>{m.name}</td>
                  <td>{m.role || '—'}</td>
                  <td>
                    <span className={styles.muted}>{m.phone || '—'}</span>
                    {m.email ? (
                      <>
                        <br />
                        <span className={styles.muted}>{m.email}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {OPERATION_ATTENDANCE_STATUSES.find((s) => s.code === m.attendance_status)?.label ||
                      m.attendance_status}
                  </td>
                  <td>{m.is_lead ? 'Sim' : '—'}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => void removeMember(m.id)}
                      >
                        Remover
                      </button>
                    </div>
                    <span className={styles.muted}>Atualizado {formatDt(m.updated_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
