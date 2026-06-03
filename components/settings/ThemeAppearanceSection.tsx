'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/contexts/ThemeContext';
import {
  BRAND_LABELS,
  BRAND_PRIMARY_HEX,
  BRAND_THEMES,
  type BrandTheme,
} from '@/lib/brandTheme';

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: typeof Moon }[] = [
  { id: 'dark', label: 'Escuro', icon: Moon },
  { id: 'light', label: 'Claro', icon: Sun },
];

const BRAND_OPTIONS: BrandTheme[] = ['orange', 'blue', 'green', 'purple'];

export function ThemeAppearanceSection() {
  const { theme, setTheme, brandTheme, setBrandTheme } = useTheme();

  return (
    <section className="sv-theme-card rounded-xl border p-6 shadow-lg space-y-6">
      <div>
        <h2 className="text-lg font-bold sv-theme-text tracking-tight">
          Aparência
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Personalize tema e cor institucional neste dispositivo. As alterações
          são imediatas e ficam salvas automaticamente.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
          Tema do sistema
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
                  selected
                    ? 'sv-brand-muted-bg sv-brand-muted-border ring-1 ring-[color-mix(in_srgb,var(--brand-primary)_30%,transparent)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--color-border-hover)]'
                }`}
                style={
                  selected
                    ? { borderColor: 'var(--brand-primary)' }
                    : undefined
                }
                aria-pressed={selected}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    selected
                      ? 'sv-brand-bg text-white'
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
                          ? 'sv-brand-border'
                          : 'border-[var(--border-color)]'
                      }`}
                    >
                      {selected ? (
                        <span
                          className="h-2 w-2 rounded-full sv-brand-bg"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        />
                      ) : null}
                    </span>
                    <span className="font-semibold sv-theme-text">
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

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
          Cor institucional
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BRAND_OPTIONS.map((id) => {
            const meta = BRAND_LABELS[id];
            const selected = brandTheme === id;
            const swatch = BRAND_PRIMARY_HEX[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setBrandTheme(id);
                }}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
                  selected
                    ? 'sv-brand-muted-bg ring-1 ring-[color-mix(in_srgb,var(--brand-primary)_30%,transparent)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--color-border-hover)]'
                }`}
                style={{
                  borderColor: selected ? swatch : undefined,
                }}
                aria-pressed={selected}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg border border-[var(--border-color)]"
                  style={{ backgroundColor: `${swatch}22` }}
                  aria-hidden
                >
                  {meta.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-[var(--border-color)]"
                      style={{ backgroundColor: swatch }}
                    />
                    <span className="font-semibold sv-theme-text">
                      {meta.title}
                    </span>
                  </span>
                  <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                    {meta.subtitle}
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
