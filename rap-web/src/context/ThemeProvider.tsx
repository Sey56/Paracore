import React, { useState, useEffect } from 'react';
import { ThemeContext } from './ThemeContext';

export type ThemeType = 'light' | 'midnight' | 'eclipse';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<ThemeType>(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeType;
    if (savedTheme && ['light', 'midnight', 'eclipse'].includes(savedTheme)) {
      return savedTheme;
    }
    const userPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return userPrefersDark ? 'midnight' : 'light';
  });

  useEffect(() => {
    const htmlEl = window.document.documentElement;

    // Remove all theme classes first
    htmlEl.classList.remove('dark', 'eclipse');

    if (theme === 'midnight') {
      htmlEl.classList.add('dark');
    } else if (theme === 'eclipse') {
      htmlEl.classList.add('dark', 'eclipse');
    }

    // Control the browser-native UI like scrollbars
    // For 'midnight' and 'eclipse', use 'dark' color scheme
    htmlEl.style.colorScheme = theme === 'light' ? 'light' : 'dark';

    // Save the user's preference
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => {
      if (prevTheme === 'light') return 'midnight';
      if (prevTheme === 'midnight') return 'eclipse';
      return 'light';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
