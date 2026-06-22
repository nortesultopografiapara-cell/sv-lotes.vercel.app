'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  UserCog,
  UserMinus,
  UserPlus,
  KeyRound,
} from 'lucide-react';
import {
  callCompanyAdminsApi,
  CompanyAdminsApiError,
} from '@/lib/companyAdminsApiClient';
import { supabase } from '@/lib/supabase';
import type { CompanyAdminListMeta, CompanyAdminUserRow } from '@/lib/companyAdminUsers';
import { DemoSensitiveNotice } from '@/components/demo/DemoSensitiveNotice';
import { DEMO_SENSITIVE_SETTINGS_MESSAGE } from '@/lib/demoRestrictions';

type Props = {
  callerUserId: string;
  tenantId: string;
  impersonatingTenantId?: string | null;
  readOnlyDemo?: boolean;
};

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  password: string;
};

const EMPTY_FORM: FormState = {
  fullName: '',
  email: '',
  phone: '',
  jobTitle: '',
  password: '',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

function roleLabel(role: string) {
  const r = role.toUpperCase();
  if (r === 'ADMIN') return 'Administrador principal';
  if (r === 'ADMIN_EMPRESA' || r === 'COMPANY_ADMIN') return 'Administrador';
  return role;
}

export function TenantCompanyAdminsPanel({
  callerUserId,
  tenantId,
  impersonatingTenantId,
  readOnlyDemo = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState<CompanyAdminUserRow[]>([]);
  const [meta, setMeta] = useState<CompanyAdminListMeta | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyAdminUserRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await callCompanyAdminsApi({
        callerUserId,
        tenantId,
        impersonatingTenantId,
      });
      setAdmins((json.admins || []) as CompanyAdminUserRow[]);
      setMeta((json.meta || null) as CompanyAdminListMeta | null);
    } catch (err) {
      setError(err instanceof CompanyAdminsApiError ? err.message : 'Erro ao carregar administradores.');
    } finally {
      setLoading(false);
    }
  }, [callerUserId, tenantId, impersonatingTenantId]);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTempPassword(null);
    setModalOpen(true);
  };

  const openEdit = (admin: CompanyAdminUserRow) => {
    setEditing(admin);
    setForm({
      fullName: admin.full_name || '',
      email: admin.email,
      phone: admin.phone || '',
      jobTitle: admin.job_title || '',
      password: '',
    });
    setTempPassword(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    let newTempPassword: string | null = null;
    try {
      if (editing) {
        await callCompanyAdminsApi({
          method: 'PATCH',
          callerUserId,
          tenantId,
          impersonatingTenantId,
          body: {
            adminId: editing.id,
            fullName: form.fullName,
            phone: form.phone,
            jobTitle: form.jobTitle,
          },
        });
        setMessage('Administrador atualizado.');
      } else {
        const json = await callCompanyAdminsApi({
          method: 'POST',
          callerUserId,
          tenantId,
          impersonatingTenantId,
          body: {
            fullName: form.fullName,
            email: form.email,
            phone: form.phone,
            jobTitle: form.jobTitle,
            password: form.password || undefined,
          },
        });
        newTempPassword = json.temporaryPassword ? String(json.temporaryPassword) : null;
        if (newTempPassword) setTempPassword(newTempPassword);
        setMessage(
          json.isExisting
            ? 'Conta existente vinculada como administrador.'
            : 'Administrador cadastrado com sucesso.',
        );
      }
      await loadAdmins();
      if (editing || !newTempPassword) closeModal();
    } catch (err) {
      setError(err instanceof CompanyAdminsApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (admin: CompanyAdminUserRow) => {
    const next = (admin.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    const label = next === 'INACTIVE' ? 'desativar' : 'ativar';
    if (!window.confirm(`Deseja ${label} ${admin.full_name || admin.email}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await callCompanyAdminsApi({
        method: 'PATCH',
        callerUserId,
        tenantId,
        impersonatingTenantId,
        body: { adminId: admin.id, status: next },
      });
      setMessage(`Administrador ${next === 'INACTIVE' ? 'desativado' : 'ativado'}.`);
      await loadAdmins();
    } catch (err) {
      setError(err instanceof CompanyAdminsApiError ? err.message : 'Erro ao alterar status.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (admin: CompanyAdminUserRow) => {
    if (!window.confirm(`Redefinir senha de ${admin.full_name || admin.email}?`)) return;
    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/company-admins/${admin.id}/reset-password`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          callerUserId,
          tenantId,
          impersonatingTenantId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao redefinir senha');
      setTempPassword(json.temporaryPassword);
      setMessage('Senha redefinida. Informe a senha provisória ao usuário.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    } finally {
      setSaving(false);
    }
  };

  if (readOnlyDemo) {
    return <DemoSensitiveNotice message={DEMO_SENSITIVE_SETTINGS_MESSAGE} />;
  }

  return (
    <div className="sv-theme-card rounded-xl border p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)]">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Usuários Administradores</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Cadastre administradores internos com login próprio. Limite contratado:{' '}
              <strong>{meta?.limit ?? '—'}</strong> ({meta?.activeCount ?? 0} ativos).
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadAdmins()}
            className="sv-theme-upload-btn"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreate}
            disabled={!meta?.canCreate || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg sv-brand-btn-primary text-sm font-medium disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Novo administrador
          </button>
        </div>
      </div>

      {message ? (
        <div className="text-sm text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {message}
        </div>
      ) : null}
      {tempPassword ? (
        <div className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Senha provisória: <strong>{tempPassword}</strong>
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">E-mail</th>
                <th className="py-2 pr-3">Cargo</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Último acesso</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => {
                const inactive = (admin.status || 'ACTIVE').toUpperCase() === 'INACTIVE';
                return (
                  <tr key={admin.id} className="border-b border-[var(--border-color)]/60">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {admin.full_name || '—'}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">{roleLabel(admin.role)}</div>
                    </td>
                    <td className="py-3 pr-3">{admin.email}</td>
                    <td className="py-3 pr-3">{admin.job_title || '—'}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                          inactive
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-emerald-500/10 text-emerald-600'
                        }`}
                      >
                        {inactive ? 'Inativo' : 'Ativo'}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{formatDate(admin.last_login_at)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => openEdit(admin)}
                          className="p-2 rounded-md hover:bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        >
                          <UserCog className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Redefinir senha"
                          onClick={() => void resetPassword(admin)}
                          className="p-2 rounded-md hover:bg-amber-500/10 text-amber-600"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title={inactive ? 'Ativar' : 'Desativar'}
                          onClick={() => void toggleStatus(admin)}
                          className="p-2 rounded-md hover:bg-red-500/10 text-red-500"
                        >
                          {inactive ? (
                            <UserPlus className="w-4 h-4" />
                          ) : (
                            <UserMinus className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!admins.length ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[var(--text-secondary)]">
                    Nenhum administrador cadastrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-[var(--color-surface)] border border-[var(--border-color)] p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {editing ? 'Editar administrador' : 'Novo administrador'}
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="sv-theme-label">Nome completo *</label>
                <input
                  className="sv-theme-field"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              {!editing ? (
                <div>
                  <label className="sv-theme-label">E-mail *</label>
                  <input
                    type="email"
                    className="sv-theme-field"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              ) : null}
              <div>
                <label className="sv-theme-label">Telefone</label>
                <input
                  className="sv-theme-field"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="sv-theme-label">Cargo / função</label>
                <input
                  className="sv-theme-field"
                  value={form.jobTitle}
                  onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                />
              </div>
              {!editing ? (
                <div>
                  <label className="sv-theme-label">Senha inicial (opcional)</label>
                  <input
                    type="password"
                    className="sv-theme-field"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Gerada automaticamente se vazio"
                  />
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg border">
                {tempPassword ? 'Fechar' : 'Cancelar'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="px-4 py-2 rounded-lg sv-brand-btn-primary disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
