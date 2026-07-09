'use client';

import { Building2, Loader2 } from 'lucide-react';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { CompanySettingsV2Shell } from '@/components/settings/CompanySettingsV2Shell';
import { useCompanySettingsForm, resolveSettingsCompanyId } from '@/components/settings/useCompanySettingsForm';
import { isTenantAdminRole } from '@/lib/ownerProjectAccess';
import { DEMO_SENSITIVE_SETTINGS_MESSAGE, isDemoProfile } from '@/lib/demoRestrictions';
import { DemoSensitiveNotice } from '@/components/demo/DemoSensitiveNotice';

const PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'];

export type SettingsPageClientProps = {
  bankingUiEnabled: boolean;
};

export default function SettingsPageClient({
  bankingUiEnabled: _bankingUiEnabled,
}: SettingsPageClientProps) {
  const { user, loading: authLoading } = useSessionGuard();

  const settingsCompanyId = resolveSettingsCompanyId(user);

  const form = useCompanySettingsForm({
    user,
    authLoading,
    normalizeAddressOnSave: true,
    syncNameFromFantasy: false,
  });

  const loading = form.loading || authLoading;
  const showAdmins = Boolean(isTenantAdminRole(user?.role) && settingsCompanyId && user?.id);
  const readOnlyDemo = isDemoProfile(user);

  const impersonatingTenantId =
    typeof window !== 'undefined' &&
    user?.role &&
    PLATFORM_ADMIN_ROLES.includes(user.role) &&
    localStorage.getItem('impersonating_tenant_id')
      ? localStorage.getItem('impersonating_tenant_id')
      : null;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const isPlatformAdmin = user?.role && PLATFORM_ADMIN_ROLES.includes(user.role);

  if (!settingsCompanyId && !isPlatformAdmin) {
    return <div className="p-8 text-center sv-theme-muted">Acesso negado ou empresa não localizada.</div>;
  }

  if (!settingsCompanyId && isPlatformAdmin) {
    return (
      <div className="p-8 text-center sv-theme-muted">
        Selecione uma empresa (impersonação) no painel master para editar as configurações.
      </div>
    );
  }

  if (!form.company) {
    return <div className="p-8 text-center sv-theme-muted">Empresa não encontrada em companies.</div>;
  }

  return (
    <div className="sv-page sv-page--scroll-y p-8 mx-auto font-sans h-full w-full max-w-6xl">
      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-[var(--border-color)]">
        <div className="w-12 h-12 bg-[var(--color-primary)]/15 rounded-xl flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-primary)]/25">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Configurações</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Empresa, representante legal e identidade para contratos SaaS.
          </p>
        </div>
      </div>

      {readOnlyDemo ? <DemoSensitiveNotice message={DEMO_SENSITIVE_SETTINGS_MESSAGE} /> : null}

      <CompanySettingsV2Shell
        {...form}
        readOnlyDemo={readOnlyDemo}
        adminPanelProps={
          showAdmins && settingsCompanyId && user?.id
            ? {
                callerUserId: user.id,
                tenantId: settingsCompanyId,
                impersonatingTenantId,
                readOnlyDemo,
              }
            : undefined
        }
      />
    </div>
  );
}
