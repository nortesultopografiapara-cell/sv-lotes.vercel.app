'use client';

import { CompanySettingsV2Shell } from '@/components/settings/CompanySettingsV2Shell';
import type { useCompanySettingsForm } from '@/components/settings/useCompanySettingsForm';

type FormState = ReturnType<typeof useCompanySettingsForm>;

type Props = Pick<
  FormState,
  | 'company'
  | 'technical'
  | 'submitting'
  | 'handleChange'
  | 'handleCheckboxChange'
  | 'handleSave'
  | 'handleLogoUpload'
  | 'handleSignatureUpload'
  | 'handleCompanyStampUpload'
  | 'handleTechChange'
  | 'handleTechSignatureUpload'
  | 'handleTechStampUpload'
  | 'logoInputRef'
  | 'signatureInputRef'
  | 'companyStampInputRef'
  | 'techSignatureInputRef'
  | 'techStampInputRef'
  | 'uploadingLogo'
  | 'uploadingSignature'
  | 'uploadingCompanyStamp'
  | 'uploadingTechSignature'
  | 'uploadingTechStamp'
> & {
  showAdmins?: boolean;
  adminPanelProps?: {
    callerUserId: string;
    tenantId: string;
    impersonatingTenantId: string | null;
  };
};

/** @deprecated Prefer CompanySettingsV2Shell — mantido como wrapper fino. */
export function CompanySettingsFormV2({ adminPanelProps, ...form }: Props) {
  return <CompanySettingsV2Shell {...form} adminPanelProps={adminPanelProps} />;
}
