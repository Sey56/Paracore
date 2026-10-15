import { createContext, useContext } from 'react';

/**
 * The app's two themes.
 *
 * ⚠ This is the APP's own theme context, not next-themes — `ThemeProvider` owns the state and
 *   puts the `.dark` class on `<html>`.
 *
 * A third `eclipse` theme used to exist here; it is now simply what `dark` looks like, so the
 * components that used to branch on it only need `theme === 'dark'`.
 */
export type ThemeType = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeType;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
