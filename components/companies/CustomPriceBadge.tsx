'use client';

import { resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';

export function CustomPriceBadge({ company }: { company: CompanyPricingSource }) {
  const pricing = resolveCompanyPricing(company);
  if (!pricing.badgeLabel) return null;

  const isFounding = pricing.badge === 'founding_client';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border shrink-0 ${
        isFounding
          ? 'bg-violet-500/15 text-violet-300 border-violet-500/35'
          : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
      }`}
    >
      {pricing.badgeLabel}
    </span>
  );
}
