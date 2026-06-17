'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, KeyRound, UserMinus, UserPlus } from 'lucide-react';
import {
  callCompanyAdminsApi,
  CompanyAdminsApiError,
} from '@/lib/companyAdminsApiClient';
import type { CompanyAdminListMeta, CompanyAdminUserRow } from '@/lib/companyAdminUsers';

type Props = {
  companyId: string;
  superAdminUserId: string;
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

export function MasterCompanyAdminsPanel({ companyId, superAdminUserId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState<CompanyAdminUserRow[]>([]);
  const [meta, setMeta] = useState<CompanyAdminListMeta | null>(null);
  const [limitInput, setLimitInput] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await callCompanyAdminsApi({
        master: true,
        callerUserId: superAdminUserId,
        companyId,
      });
      setAdmins((json.admins || []) as CompanyAdminUserRow[]);
      setMeta((json.meta || null) as CompanyAdminListMeta | null);
      setLimitInput(String((json.meta as CompanyAdminListMeta | undefined)?.limit ?? 1));
    } catch (err) {
      setError(err instanceof CompanyAdminsApiError ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [companyId, superAdminUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveLimit = async () => {
    setSaving(true);
    setError(null);
    try {
      await callCompanyAdminsApi({
        method: 'POST',
        master: true,
        callerUserId: superAdminUserId,
        companyId,
        body: {
          userId: superAdminUserId,
          action: 'update_limit',
          adminUsersLimit: Number(limitInput),
        },
      });
      setMessage('Limite de administradores atualizado.');
      await load();
    } catch (err) {
      setError(err instanceof CompanyAdminsApiError ? err.message : 'Erro ao salvar limite.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (admin: CompanyAdminUserRow) => {
    const next = (admin.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    setSaving(true);
    try {
      await callCompanyAdminsApi({
        method: 'PATCH',
        master: true,
        callerUserId: superAdminUserId,
        companyId,
        body: { userId: superAdminUserId, adminId: admin.id, status: next },
      });
      await load();
    } catch (err) {
      setError(err instanceof CompanyAdminsApiError ? err.message : 'Erro ao alterar status.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (admin: CompanyAdminUserRow) => {
    setSaving(true);
    try {
      const json = await callCompanyAdminsApi({
        method: 'POST',
        master: true,
        callerUserId: superAdminUserId,
        companyId,
        body: { userId: superAdminUserId, action: 'reset_password', adminId: admin.id },
      });
      setTempPassword(String(json.temporaryPassword || ''));
      setMessage(`Senha redefinida para ${admin.full_name || admin.email}`);
    } catch (err) {
      setError(err instanceof CompanyAdminsApiError ? err.message : 'Erro ao redefinir senha.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-white/10 bg-white/5">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Limite de administradores</label>
          <input
            type="number"
            min={1}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white"
          />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveLimit()}
          className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm"
        >
          Salvar limite
        </button>
        <div className="text-sm text-slate-400 ml-auto">
          Ativos: {meta?.activeCount ?? 0} / {meta?.limit ?? limitInput}
        </div>
      </div>

      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {tempPassword ? (
        <p className="text-sm text-amber-300">Senha provisória: {tempPassword}</p>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-white/10">
              <th className="p-3">Nome</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Perfil</th>
              <th className="p-3">Status</th>
              <th className="p-3">Criado em</th>
              <th className="p-3">Último acesso</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => {
              const inactive = (admin.status || 'ACTIVE').toUpperCase() === 'INACTIVE';
              return (
                <tr key={admin.id} className="border-b border-white/5 text-slate-200">
                  <td className="p-3">{admin.full_name || '—'}</td>
                  <td className="p-3">{admin.email}</td>
                  <td className="p-3">{admin.role}</td>
                  <td className="p-3">{inactive ? 'Inativo' : 'Ativo'}</td>
                  <td className="p-3">{formatDate(admin.created_at)}</td>
                  <td className="p-3">{formatDate(admin.last_login_at)}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title="Redefinir senha"
                        onClick={() => void resetPassword(admin)}
                        className="p-2 rounded hover:bg-white/10"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title={inactive ? 'Ativar' : 'Desativar'}
                        onClick={() => void toggleStatus(admin)}
                        className="p-2 rounded hover:bg-white/10"
                      >
                        {inactive ? <UserPlus className="w-4 h-4" /> : <UserMinus className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!admins.length ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">
                  Nenhum administrador vinculado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
