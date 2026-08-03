'use client';

import { LANDING_EXPERIENCE_LINE } from '../constants/landingConfig';

/** Mantido para compatibilidade — métricas fictícias não são mais exibidas. */
export function BenefitsStats() {
  return (
    <p className="landing-section-subtitle text-center max-w-3xl mx-auto">
      {LANDING_EXPERIENCE_LINE}
    </p>
  );
}
