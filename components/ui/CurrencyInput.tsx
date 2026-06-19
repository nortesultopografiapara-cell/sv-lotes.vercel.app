'use client';

import type { InputHTMLAttributes } from 'react';
import {
  formatCurrencyFieldValue,
  maskCurrencyBRL,
} from '@/lib/currencyBrl';

type CurrencyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: string;
  onChange: (value: string) => void;
};

export function CurrencyInput({
  value,
  onChange,
  readOnly,
  disabled,
  className,
  placeholder = 'R$ 0,00',
  ...rest
}: CurrencyInputProps) {
  const isLocked = Boolean(readOnly || disabled);
  const displayValue = isLocked
    ? formatCurrencyFieldValue(value)
    : value.includes('R$')
      ? value
      : formatCurrencyFieldValue(value);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      value={displayValue}
      onChange={
        isLocked ? undefined : (e) => onChange(maskCurrencyBRL(e.target.value))
      }
    />
  );
}
