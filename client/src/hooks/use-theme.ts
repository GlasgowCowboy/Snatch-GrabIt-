import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'sg-theme';
const DEFAULT_THEME: Theme = 'dark';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
}

/**
 * Tiny theme manager — toggles the `dark`/`light` class on <html> and persists
 * the choice in localStorage. Defaults to dark to match the original design.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
