'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';
import type { InputHTMLAttributes } from 'react';
import {
  commitCurrencyDraft,
  currencyDraftToParseable,
  extractCurrencyDraft,
  formatCurrencyDraftDisplay,
  formatCurrencyFieldValue,
  valueToCurrencyDraft,
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
  onBlur: onBlurProp,
  onFocus: onFocusProp,
  ...rest
}: CurrencyInputProps) {
  const isLocked = Boolean(readOnly || disabled);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => valueToCurrencyDraft(value));

  useEffect(() => {
    if (!focused) {
      setDraft(valueToCurrencyDraft(value));
    }
  }, [value, focused]);

  const displayValue = isLocked
    ? formatCurrencyFieldValue(value)
    : focused
      ? formatCurrencyDraftDisplay(draft)
      : formatCurrencyFieldValue(value);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = extractCurrencyDraft(e.target.value);
    setDraft(nextDraft);
    onChange(currencyDraftToParseable(nextDraft));

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    if (!isLocked) {
      setFocused(true);
      setDraft(valueToCurrencyDraft(value));
    }
    onFocusProp?.(e);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (!isLocked) {
      setFocused(false);
      const committed = commitCurrencyDraft(draft);
      onChange(committed);
      setDraft(valueToCurrencyDraft(committed));
    }
    onBlurProp?.(e);
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      value={displayValue}
      onChange={isLocked ? undefined : handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
