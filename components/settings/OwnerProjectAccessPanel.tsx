'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import { Loader2, Save, Shield } from 'lucide-react';
import {
  OwnerProjectAccessEditor,
  type AccessEntry,
} from '@/components/owners/OwnerProjectAccessEditor';

type OwnerUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ProjectOption = {
  id: string;
  name: string;
};

type Props = {
  callerUserId: string;
  tenantId: string;
};

export function OwnerProjectAccessPanel({ callerUserId, tenantId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<OwnerUser[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadBaseData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const rlsCtx = await resolveRlsContext({
        id: callerUserId,
        tenant_id: tenantId,
        role: 'ADMIN',
      });

      let usersQuery = supabase
        .from('users')
        .select('id, name, email, role, full_name')
        .order('name', { ascending: true });
      usersQuery = applyTenantFilter(usersQuery, rlsCtx, 'users');
      const { data: usersData } = await usersQuery;

      let projectsQuery = supabase.from('projects').select('id, name').order('name');
      projectsQuery = applyTenantFilter(projectsQuery, rlsCtx, 'projects');
      const { data: projectsData } = await projectsQuery;

      setUsers(
        (usersData || []).map((user) => ({
          id: user.id,
          name: user.full_name || user.name || user.email,
          email: user.email,
          role: user.role,
        })),
      );
      setProjects(projectsData || []);

      if (!selectedUserId && (usersData || []).length > 0) {
        const firstOwner = (usersData || []).find(
          (user) => String(user.role || '').toUpperCase() === 'OWNER',
        );
        setSelectedUserId(firstOwner?.id || usersData![0].id);
      }
    } catch (err) {
      console.error(err);
      setMessage('Erro ao carregar usuários e empreendimentos.');
    } finally {
      setLoading(false);
    }
  }, [callerUserId, tenantId, selectedUserId]);

  const loadAccess = useCallback(async () => {
    if (!selectedUserId) {
      setEntries([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/users/${selectedUserId}/owner-project-access?callerUserId=${encodeURIComponent(callerUserId)}`,
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao carregar acessos');
      }
      setEntries(
        (json.access || []).map((row: AccessEntry) => ({
          project_id: row.project_id,
          can_view_dashboard: row.can_view_dashboard !== false,
          can_view_map: row.can_view_map !== false,
          can_view_finance: row.can_view_finance !== false,
          can_view_contracts: row.can_view_contracts !== false,
        })),
      );
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : 'Erro ao carregar acessos.');
      setEntries([]);
    }
  }, [callerUserId, selectedUserId]);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${selectedUserId}/owner-project-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerUserId,
          tenantId,
          entries,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao salvar');
      }
      setMessage('Acesso por empreendimento salvo com sucesso.');
      await loadAccess();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao salvar acessos.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando acesso por empreendimento...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-[var(--color-primary)]" />
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Acesso por Empreendimento
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Libere empreendimentos para proprietários/sócios (perfil OWNER).
            Para cadastro completo, use o menu Sócios / Proprietários.
          </p>
        </div>
      </div>

      <label className="text-sm block">
        <span className="mb-1 block font-medium">Usuário</span>
        <select
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
        >
          <option value="">Selecione...</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name || user.email} ({user.role})
            </option>
          ))}
        </select>
      </label>

      {selectedUserId ? (
        <OwnerProjectAccessEditor
          projects={projects}
          entries={entries}
          onChange={setEntries}
          disabled={saving}
        />
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !selectedUserId}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar acesso
        </button>
        {message ? <span className="text-sm text-[var(--color-text-muted)]">{message}</span> : null}
      </div>
    </div>
  );
}
