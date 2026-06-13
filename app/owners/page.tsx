'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Handshake,
  Plus,
  Search,
  Loader2,
  Edit2,
  Shield,
  UserX,
  UserCheck,
  X,
  Mail,
  Phone,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import {
  OWNER_PROFILE_TYPES,
  OWNER_PROFILE_TYPE_LABELS,
  formatOwnerProfileType,
  formatOwnerStatus,
  type OwnerProfileType,
} from '@/lib/ownerProfiles';
import {
  OwnerProjectAccessEditor,
  type AccessEntry,
  type ProjectOption,
} from '@/components/owners/OwnerProjectAccessEditor';
import { canManageOwners } from '@/lib/rolePermissions';
import { callOwnersApi } from '@/lib/ownersApiClient';
import { supabase } from '@/lib/supabase';

type OwnerRecord = {
  id: string;
  full_name?: string | null;
  name?: string | null;
  email: string;
  phone?: string | null;
  status?: string | null;
  owner_profile_type?: string | null;
  owner_document?: string | null;
  projects?: Array<{
    project_id: string;
    project_name: string;
  }>;
};

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  ownerDocument: string;
  ownerProfileType: OwnerProfileType;
  status: 'ACTIVE' | 'INACTIVE';
  password: string;
};

const emptyForm = (): FormState => ({
  fullName: '',
  email: '',
  phone: '',
  ownerDocument: '',
  ownerProfileType: 'PROPRIETARIO',
  status: 'ACTIVE',
  password: '',
});

const OWNER_MODAL_SELECT_CLASS =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 [color-scheme:dark]';
const OWNER_MODAL_OPTION_CLASS = 'bg-slate-900 text-white';

function getImpersonatingTenantId(role?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  if (role !== 'SUPER_ADMIN') return null;
  return localStorage.getItem('impersonating_tenant_id');
}

async function getOwnersApiAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

export default function OwnersPage() {
  const { user, loading: authLoading } = useAuth();
  const [owners, setOwners] = useState<OwnerRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'access'>('create');
  const [selectedOwner, setSelectedOwner] = useState<OwnerRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<string | null>(null);

  const canAccess = canManageOwners(user?.role);

  const loadProjects = useCallback(async () => {
    if (!user) return;
    const rlsCtx = await resolveRlsContext(user);
    let query = supabase.from('projects').select('id, name').order('name');
    query = applyTenantFilter(query, rlsCtx, 'projects');
    const { data } = await query;
    setProjects(data || []);
  }, [user]);

  const loadOwners = useCallback(async () => {
    if (!user || !canManageOwners(user.role)) return;
    setLoading(true);
    setError('');
    try {
      const impersonatingTenantId = getImpersonatingTenantId(user.role);
      const tenantId = user.tenant_id || user.company_id;
      const json = await callOwnersApi({
        callerUserId: user.id,
        tenantId,
        impersonatingTenantId,
      });
      setOwners((json.owners || []) as OwnerRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
      setOwners([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user && canAccess) {
      void loadProjects();
      void loadOwners();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, user, canAccess, loadOwners, loadProjects]);

  const filteredOwners = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return owners;
    return owners.filter((owner) => {
      const name = (owner.full_name || owner.name || '').toLowerCase();
      const email = owner.email.toLowerCase();
      const projectsLabel = (owner.projects || [])
        .map((project) => project.project_name)
        .join(' ')
        .toLowerCase();
      return name.includes(term) || email.includes(term) || projectsLabel.includes(term);
    });
  }, [owners, search]);

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedOwner(null);
    setForm(emptyForm());
    setEntries([]);
    setTempPasswordInfo(null);
    setMessage('');
    setError('');
    setModalOpen(true);
  };

  const openEditModal = (owner: OwnerRecord) => {
    setModalMode('edit');
    setSelectedOwner(owner);
    setForm({
      fullName: owner.full_name || owner.name || '',
      email: owner.email,
      phone: owner.phone || '',
      ownerDocument: owner.owner_document || '',
      ownerProfileType:
        (OWNER_PROFILE_TYPES.find((type) => type === owner.owner_profile_type) as OwnerProfileType) ||
        'PROPRIETARIO',
      status: (owner.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      password: '',
    });
    setEntries([]);
    setTempPasswordInfo(null);
    setMessage('');
    setError('');
    setModalOpen(true);
  };

  const openAccessModal = async (owner: OwnerRecord) => {
    setModalMode('access');
    setSelectedOwner(owner);
    setForm({
      fullName: owner.full_name || owner.name || '',
      email: owner.email,
      phone: owner.phone || '',
      ownerDocument: owner.owner_document || '',
      ownerProfileType:
        (OWNER_PROFILE_TYPES.find((type) => type === owner.owner_profile_type) as OwnerProfileType) ||
        'PROPRIETARIO',
      status: (owner.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      password: '',
    });
    setTempPasswordInfo(null);
    setMessage('');
    setError('');
    setModalOpen(true);

    try {
      const headers = await getOwnersApiAuthHeaders();
      const res = await fetch(
        `/api/users/${owner.id}/owner-project-access?callerUserId=${encodeURIComponent(user?.id || '')}`,
        { headers, credentials: 'same-origin' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar acessos');
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
      setError(err instanceof Error ? err.message : 'Erro ao carregar acessos');
      setEntries([]);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedOwner(null);
    setEntries([]);
    setTempPasswordInfo(null);
  };

  const saveOwner = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    setMessage('');
    setTempPasswordInfo(null);

    try {
      const impersonatingTenantId = getImpersonatingTenantId(user.role);
      const tenantId = user.tenant_id || user.company_id;

      if (modalMode === 'access' && selectedOwner) {
        const headers = await getOwnersApiAuthHeaders();
        const res = await fetch(`/api/users/${selectedOwner.id}/owner-project-access`, {
          method: 'PUT',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify({
            callerUserId: user.id,
            tenantId: impersonatingTenantId || tenantId,
            entries,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Falha ao salvar acessos');
        setMessage('Acesso por empreendimento atualizado.');
        await loadOwners();
        return;
      }

      const payload = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        ownerDocument: form.ownerDocument,
        ownerProfileType: form.ownerProfileType,
        status: form.status,
        password: form.password || undefined,
        entries,
        impersonatingTenantId,
      };

      if (modalMode === 'create') {
        const json = await callOwnersApi({
          method: 'POST',
          callerUserId: user.id,
          tenantId,
          impersonatingTenantId,
          body: payload,
        });
        if (json.temporaryPassword) {
          setTempPasswordInfo(`Senha provisória: ${json.temporaryPassword}`);
        }
        setMessage(
          json.isExisting
            ? 'Usuário OWNER atualizado (e-mail já existia na empresa).'
            : 'Sócio/proprietário cadastrado com sucesso.',
        );
        await loadOwners();
        if (!json.temporaryPassword) {
          closeModal();
        }
        return;
      } else if (selectedOwner) {
        await callOwnersApi({
          method: 'PATCH',
          path: selectedOwner.id,
          callerUserId: user.id,
          tenantId,
          impersonatingTenantId,
          body: payload,
        });
        setMessage('Cadastro atualizado com sucesso.');
      }

      await loadOwners();
      if (modalMode !== 'create') {
        closeModal();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleOwnerStatus = async (owner: OwnerRecord) => {
    if (!user) return;
    const nextStatus = (owner.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    const actionLabel = nextStatus === 'INACTIVE' ? 'inativar' : 'ativar';
    if (!window.confirm(`Deseja ${actionLabel} ${owner.full_name || owner.email}?`)) return;

    try {
      const impersonatingTenantId = getImpersonatingTenantId(user.role);
      const tenantId = user.tenant_id || user.company_id;
      await callOwnersApi({
        method: 'PATCH',
        path: owner.id,
        callerUserId: user.id,
        tenantId,
        impersonatingTenantId,
        body: { status: nextStatus },
      });
      await loadOwners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-text-muted)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando sócios / proprietários...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Acesso restrito</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Apenas administradores da empresa podem gerenciar sócios e proprietários.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
            <Handshake className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-wide">Gestão de acesso</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Sócios / Proprietários</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Cadastre sócios, proprietários e investidores com acesso limitado por empreendimento.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Novo Sócio / Proprietário
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <Search className="h-4 w-4 text-[var(--color-text-muted)]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, e-mail ou empreendimento..."
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/60 text-left text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Empreendimentos</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredOwners.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
                  Nenhum sócio/proprietário cadastrado.
                </td>
              </tr>
            ) : (
              filteredOwners.map((owner) => (
                <tr key={owner.id} className="border-b border-[var(--color-border)]/60">
                  <td className="px-4 py-3 font-medium">{owner.full_name || owner.name || '—'}</td>
                  <td className="px-4 py-3">{owner.email}</td>
                  <td className="px-4 py-3">{formatOwnerProfileType(owner.owner_profile_type)}</td>
                  <td className="px-4 py-3">{formatOwnerStatus(owner.status)}</td>
                  <td className="px-4 py-3">
                    {(owner.projects || []).length
                      ? (owner.projects || []).map((project) => project.project_name).join(', ')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(owner)}
                        className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg)]"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void openAccessModal(owner)}
                        className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg)]"
                        title="Configurar acesso"
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleOwnerStatus(owner)}
                        className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg)]"
                        title={(owner.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'Ativar' : 'Inativar'}
                      >
                        {(owner.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? (
                          <UserCheck className="h-4 w-4" />
                        ) : (
                          <UserX className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[var(--color-text)]">
                  {modalMode === 'create'
                    ? 'Novo Sócio / Proprietário'
                    : modalMode === 'access'
                      ? 'Configurar acesso por empreendimento'
                      : 'Editar Sócio / Proprietário'}
                </h2>
                {selectedOwner ? (
                  <p className="text-sm text-[var(--color-text-muted)]">{selectedOwner.email}</p>
                ) : null}
              </div>
              <button type="button" onClick={closeModal} className="text-[var(--color-text-muted)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalMode !== 'access' ? (
              <div className="mb-6 grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Nome *</span>
                  <input
                    value={form.fullName}
                    onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">E-mail *</span>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-muted)]" />
                    <input
                      type="email"
                      value={form.email}
                      disabled={modalMode === 'edit'}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-2 pl-9 pr-3 disabled:opacity-60"
                    />
                  </div>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Telefone</span>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-muted)]" />
                    <input
                      value={form.phone}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-2 pl-9 pr-3"
                    />
                  </div>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">CPF/CNPJ (opcional)</span>
                  <input
                    value={form.ownerDocument}
                    onChange={(event) => setForm((prev) => ({ ...prev, ownerDocument: event.target.value }))}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                  />
                </label>
                <label className="text-sm text-[var(--color-text)]">
                  <span className="mb-1 block font-medium text-white">Tipo *</span>
                  <select
                    value={form.ownerProfileType}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        ownerProfileType: event.target.value as OwnerProfileType,
                      }))
                    }
                    className={OWNER_MODAL_SELECT_CLASS}
                  >
                    {OWNER_PROFILE_TYPES.map((type) => (
                      <option key={type} value={type} className={OWNER_MODAL_OPTION_CLASS}>
                        {OWNER_PROFILE_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-[var(--color-text)]">
                  <span className="mb-1 block font-medium text-white">Status</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        status: event.target.value as 'ACTIVE' | 'INACTIVE',
                      }))
                    }
                    className={OWNER_MODAL_SELECT_CLASS}
                  >
                    <option value="ACTIVE" className={OWNER_MODAL_OPTION_CLASS}>
                      Ativo
                    </option>
                    <option value="INACTIVE" className={OWNER_MODAL_OPTION_CLASS}>
                      Inativo
                    </option>
                  </select>
                </label>
                {modalMode === 'create' ? (
                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block font-medium">Senha provisória (opcional)</span>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-muted)]" />
                      <input
                        type="text"
                        value={form.password}
                        onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="Deixe em branco para gerar automaticamente"
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-2 pl-9 pr-3"
                      />
                    </div>
                  </label>
                ) : null}
              </div>
            ) : null}

            {modalMode !== 'edit' ? (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
                  Empreendimentos e permissões
                </h3>
                <OwnerProjectAccessEditor
                  projects={projects}
                  entries={entries}
                  onChange={setEntries}
                  disabled={saving}
                />
              </div>
            ) : null}

            {message ? (
              <p className="mb-3 text-sm text-green-400">{message}</p>
            ) : null}
            {tempPasswordInfo ? (
              <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                {tempPasswordInfo}
              </p>
            ) : null}
            {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveOwner()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
