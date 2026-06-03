'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BRAND_STORAGE_KEY,
  DEFAULT_BRAND,
  getStoredBrand,
  type BrandTheme,
} from '@/lib/brandTheme';
import {
  applyAppearanceToDocument,
  type ThemeMode,
} from '@/lib/applyAppearance';
import { THEME_STORAGE_KEY } from '@/lib/themeInitScript';

export type { ThemeMode } from '@/lib/applyAppearance';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  brandTheme: BrandTheme;
  setBrandTheme: (brand: BrandTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** @deprecated Use applyAppearanceToDocument */
export function applyThemeToDocument(theme: ThemeMode) {
  applyAppearanceToDocument(theme, getStoredBrand());
}

function persistAndApply(theme: ThemeMode, brand: BrandTheme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.setItem(BRAND_STORAGE_KEY, brand);
  } catch {
    /* ignore */
  }
  applyAppearanceToDocument(theme, brand);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() =>
    typeof window !== 'undefined' ? getStoredTheme() : 'dark',
  );
  const [brandTheme, setBrandThemeState] = useState<BrandTheme>(() =>
    typeof window !== 'undefined' ? getStoredBrand() : DEFAULT_BRAND,
  );
  const themeRef = useRef(theme);
  const brandRef = useRef(brandTheme);
  themeRef.current = theme;
  brandRef.current = brandTheme;

  useEffect(() => {
    const storedTheme = getStoredTheme();
    const storedBrand = getStoredBrand();
    setThemeState(storedTheme);
    setBrandThemeState(storedBrand);
    applyAppearanceToDocument(storedTheme, storedBrand);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    themeRef.current = next;
    persistAndApply(next, brandRef.current);
  }, []);

  const setBrandTheme = useCallback((next: BrandTheme) => {
    setBrandThemeState(next);
    brandRef.current = next;
    persistAndApply(themeRef.current, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      themeRef.current = next;
      persistAndApply(next, brandRef.current);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      brandTheme,
      setBrandTheme,
    }),
    [theme, setTheme, toggleTheme, brandTheme, setBrandTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
