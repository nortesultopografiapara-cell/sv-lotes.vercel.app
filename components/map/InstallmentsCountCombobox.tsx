'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  buildInstallmentsOptions,
  filterInstallmentsOptions,
  INSTALLMENTS_MAX,
  sanitizeInstallmentsInput,
} from '@/lib/installmentsCount';

type InstallmentsCountComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputClassName?: string;
  label?: string;
  required?: boolean;
};

export function InstallmentsCountCombobox({
  value,
  onChange,
  disabled = false,
  inputClassName = '',
  label = 'Qtd de Parcelas',
  required = false,
}: InstallmentsCountComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const allOptions = useMemo(() => buildInstallmentsOptions(), []);
  const filteredOptions = useMemo(
    () => filterInstallmentsOptions(value, allOptions),
    [allOptions, value],
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleInputChange = (nextRaw: string) => {
    const sanitized = sanitizeInstallmentsInput(nextRaw);
    if (!sanitized) {
      onChange('');
      setOpen(true);
      return;
    }
    const numeric = Number(sanitized);
    if (numeric > INSTALLMENTS_MAX) {
      onChange(String(INSTALLMENTS_MAX));
      setOpen(true);
      return;
    }
    onChange(sanitized);
    setOpen(true);
  };

  const selectOption = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative" data-testid="installments-count-combobox">
      <label htmlFor={listId} className="block text-xs font-semibold text-gray-700 mb-1">
        {label}
        {required ? ' *' : ''}
      </label>
      <div className="relative">
        <input
          id={listId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder=""
          disabled={disabled}
          value={value}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'ArrowDown') setOpen(true);
          }}
          className={inputClassName}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${listId}-options`}
          role="combobox"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 disabled:opacity-50"
          aria-label={open ? 'Fechar lista de parcelas' : 'Abrir lista de parcelas'}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && !disabled ? (
        <ul
          id={`${listId}-options`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg"
        >
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">Nenhuma opção encontrada</li>
          ) : (
            filteredOptions.map((option) => (
              <li key={option} role="option" aria-selected={value === option}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                    value === option ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-700'
                  }`}
                >
                  {option}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
