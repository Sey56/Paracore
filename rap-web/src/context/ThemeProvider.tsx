import React, { useState, useEffect } from 'react';
import { ThemeContext, type ThemeType } from './ThemeContext';

export type { ThemeType };

const STORAGE_KEY = 'theme';

/**
 * ⚠ Older builds persisted 'midnight' | 'eclipse'. BOTH now mean 'dark', so a returning user keeps
 *   dark mode instead of silently snapping back to light. (This is the whole reason the read is a
 *   migration rather than a plain `=== 'light'` check.)
 */
function readStoredTheme(): ThemeType | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'light') return 'light';
  if (raw === 'dark' || raw === 'midnight' || raw === 'eclipse') return 'dark';
  return null;
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<ThemeType>(() => {
    const stored = readStoredTheme();
    if (stored) return stored;
    // First visit — follow the OS.
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    return prefersDark ? 'dark' : 'light';
  });

  useEffect(() => {
    const htmlEl = document.documentElement;
    // ONE class, ONE switch — `toggle` also clears a stale `dark` when returning to light.
    htmlEl.classList.toggle('dark', theme === 'dark');
    // Drives the browser-native UI (scrollbars, form controls). 'light' | 'dark' are both valid.
    htmlEl.style.colorScheme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
