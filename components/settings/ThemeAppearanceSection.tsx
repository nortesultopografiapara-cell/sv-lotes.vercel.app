'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/contexts/ThemeContext';

const OPTIONS: { id: ThemeMode; label: string; icon: typeof Moon }[] = [
  { id: 'dark', label: 'Escuro', icon: Moon },
  { id: 'light', label: 'Claro', icon: Sun },
];

export function ThemeAppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="sv-theme-card rounded-xl border p-6 shadow-lg space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
          Aparência
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Escolha como o SV LOTES é exibido neste dispositivo. A alteração é
          imediata e fica salva automaticamente.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
          Tema do sistema
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
                  selected
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/30'
                    : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--color-border-hover)]'
                }`}
                aria-pressed={selected}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    selected
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                        selected
                          ? 'border-[var(--color-primary)]'
                          : 'border-[var(--border-color)]'
                      }`}
                    >
                      {selected ? (
                        <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                      ) : null}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {opt.label}
                    </span>
                  </span>
                  <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                    {opt.id === 'dark'
                      ? 'Visual premium escuro (padrão)'
                      : 'Visual corporativo claro'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
