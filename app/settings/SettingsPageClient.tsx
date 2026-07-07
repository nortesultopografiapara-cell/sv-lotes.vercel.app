'use client';

import { useMemo } from 'react';
import { Loader2, Building2, Palette, Landmark } from 'lucide-react';
import { FinancialIntegrationPanel } from '@/components/finance/FinancialIntegrationPanel';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { ThemeAppearanceSection } from '@/components/settings/ThemeAppearanceSection';
import { OwnerProjectAccessPanel } from '@/components/settings/OwnerProjectAccessPanel';
import { TenantCompanyAdminsPanel } from '@/components/settings/TenantCompanyAdminsPanel';
import { CompanySettingsFormLegacy } from '@/components/settings/CompanySettingsFormLegacy';
import { CompanySettingsV2Shell } from '@/components/settings/CompanySettingsV2Shell';
import { useCompanySettingsForm, resolveSettingsCompanyId } from '@/components/settings/useCompanySettingsForm';
import { resolveCompanySettingsLayout } from '@/lib/companySettingsLayout';
import { isCompanyAsaasEnabled } from '@/lib/finance/companyAsaasAccess';
import { isTenantAdminRole } from '@/lib/ownerProjectAccess';
import { DEMO_SENSITIVE_SETTINGS_MESSAGE, isDemoProfile } from '@/lib/demoRestrictions';
import { DemoSensitiveNotice } from '@/components/demo/DemoSensitiveNotice';

const PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'];

export type SettingsPageClientProps = {
  bankingUiEnabled: boolean;
};

export default function SettingsPageClient({
  bankingUiEnabled,
}: SettingsPageClientProps) {
  const { user, loading: authLoading } = useSessionGuard();

  const settingsCompanyId = resolveSettingsCompanyId(user);
  const companyAsaasEnabled = isCompanyAsaasEnabled(settingsCompanyId);
  const bankingAsaasUiEnabled = bankingUiEnabled && companyAsaasEnabled;
  const isPlatformAdmin = user?.role && PLATFORM_ADMIN_ROLES.includes(user.role);

  const layoutPreview = useMemo(() => {
    if (!settingsCompanyId) return 'legacy' as const;
    return resolveCompanySettingsLayout(settingsCompanyId);
  }, [settingsCompanyId]);

  const form = useCompanySettingsForm({
    user,
    authLoading,
    normalizeAddressOnSave: layoutPreview === 'v2',
    syncNameFromFantasy: false,
  });

  const layout = useMemo(() => {
    if (!form.company || !settingsCompanyId) return layoutPreview;
    return resolveCompanySettingsLayout(settingsCompanyId, {
      documentRaw: String(form.company.cnpj || ''),
      createdAt: String(form.company.created_at || ''),
      settingsLayout: form.company.settings_layout as string | null,
    });
  }, [form.company, settingsCompanyId, layoutPreview]);

  const v2Active = layout === 'v2';
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
    <div className={`sv-page sv-page--scroll-y p-8 mx-auto font-sans h-full w-full ${v2Active ? 'max-w-6xl' : 'max-w-4xl'}`}>
      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-[var(--border-color)]">
        <div className="w-12 h-12 bg-[var(--color-primary)]/15 rounded-xl flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-primary)]/25">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Configurações</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {v2Active
              ? 'Empresa, representante legal e identidade para contratos SaaS.'
              : 'Empresa, aparência e identidade para contratos e recibos.'}
          </p>
        </div>
      </div>

      {readOnlyDemo ? <DemoSensitiveNotice message={DEMO_SENSITIVE_SETTINGS_MESSAGE} /> : null}

      {v2Active ? (
        <CompanySettingsV2Shell
          {...form}
          readOnlyDemo={readOnlyDemo}
          showAdmins={showAdmins}
          bankingUiEnabled={bankingAsaasUiEnabled}
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
      ) : (
        <>
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3 text-[var(--text-secondary)]">
              <Palette className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Aparência</span>
            </div>
            <ThemeAppearanceSection />
          </div>

          {bankingAsaasUiEnabled && settingsCompanyId ? (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3 text-[var(--text-secondary)]">
                <Landmark className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Integração Financeira</span>
              </div>
              <FinancialIntegrationPanel tenantId={settingsCompanyId} readOnlyDemo={readOnlyDemo} />
            </div>
          ) : null}

          {showAdmins && settingsCompanyId && user?.id ? (
            <div className="mb-8">
              <TenantCompanyAdminsPanel
                callerUserId={user.id}
                tenantId={settingsCompanyId}
                impersonatingTenantId={impersonatingTenantId}
                readOnlyDemo={readOnlyDemo}
              />
            </div>
          ) : null}

          {showAdmins && settingsCompanyId && user?.id ? (
            <div className="mb-8">
              <OwnerProjectAccessPanel
                callerUserId={user.id}
                tenantId={settingsCompanyId}
                readOnlyDemo={readOnlyDemo}
              />
            </div>
          ) : null}

          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border-color)]">
            <div className="w-10 h-10 bg-[var(--color-info)]/15 rounded-lg flex items-center justify-center text-[var(--color-info)] border border-[var(--color-info)]/25">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Dados da empresa</h2>
              <p className="text-sm text-[var(--text-secondary)]">Informações legais e técnicas.</p>
            </div>
          </div>
          <CompanySettingsFormLegacy {...form} readOnlyDemo={readOnlyDemo} />
        </>
      )}
    </div>
  );
}
