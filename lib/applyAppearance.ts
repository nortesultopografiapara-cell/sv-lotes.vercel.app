import { BRAND_PRIMARY_HEX, type BrandTheme } from '@/lib/brandTheme';

export type ThemeMode = 'dark' | 'light';

export function applyAppearanceToDocument(
  theme: ThemeMode,
  brand: BrandTheme,
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-brand', brand);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const color =
      theme === 'light' ? BRAND_PRIMARY_HEX[brand] : '#0B1121';
    meta.setAttribute('theme-color', color);
  }
}
