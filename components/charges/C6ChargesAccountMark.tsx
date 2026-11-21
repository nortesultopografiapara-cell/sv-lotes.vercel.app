import React from 'react';
import {
  C6_CHARGES_DISPLAY_LABEL,
  C6_CHARGES_PREPARATION_MESSAGE,
} from '@/lib/charges/chargeProviderRouting';

/** Identificação visual do C6. Não oferece emissão. */
export function C6ChargesAccountMark() {
  return (
    <span className="text-[10px] text-amber-200" data-c6-charges="preparation">
      <span className="font-semibold">{C6_CHARGES_DISPLAY_LABEL}</span>
      <span className="mt-1 block">{C6_CHARGES_PREPARATION_MESSAGE}</span>
    </span>
  );
}
