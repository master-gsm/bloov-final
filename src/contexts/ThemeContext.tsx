import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme, themes, getThemeById, defaultThemeId } from '../lib/themes';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeId: string) => void;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'bloov-theme';

function applyThemeToDOM(theme: Theme) {
  const root = document.documentElement;
  const { colors } = theme;

  root.style.setProperty('--theme-background', colors.background);
  root.style.setProperty('--theme-surface', colors.surface);
  root.style.setProperty('--theme-surface-hover', colors.surfaceHover);
  root.style.setProperty('--theme-border', colors.border);
  root.style.setProperty('--theme-border-muted', colors.borderMuted);
  root.style.setProperty('--theme-text', colors.text);
  root.style.setProperty('--theme-text-secondary', colors.textSecondary);
  root.style.setProperty('--theme-text-muted', colors.textMuted);
  root.style.setProperty('--theme-primary', colors.primary);
  root.style.setProperty('--theme-primary-hover', colors.primaryHover);
  root.style.setProperty('--theme-primary-light', colors.primaryLight);
  root.style.setProperty('--theme-accent', colors.accent);
  root.style.setProperty('--theme-accent-hover', colors.accentHover);
  root.style.setProperty('--theme-success', colors.success);
  root.style.setProperty('--theme-success-light', colors.successLight);
  root.style.setProperty('--theme-warning', colors.warning);
  root.style.setProperty('--theme-warning-light', colors.warningLight);
  root.style.setProperty('--theme-error', colors.error);
  root.style.setProperty('--theme-error-light', colors.errorLight);
  root.style.setProperty('--theme-scrollbar-track', colors.scrollbarTrack);
  root.style.setProperty('--theme-scrollbar-thumb', colors.scrollbarThumb);
  root.style.setProperty('--theme-scrollbar-thumb-hover', colors.scrollbarThumbHover);

  const isDark = theme.category === 'dark';
  if (isDark) {
    root.classList.add('dark-theme');
  } else {
    root.classList.remove('dark-theme');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    return getThemeById(savedId || defaultThemeId) || themes[0];
  });

  useEffect(() => {
    const loadUserTheme = async () => {
      if (user && profile) {
        const { data } = await supabase
          .from('users')
          .select('theme_id')
          .eq('id', user.id)
          .maybeSingle();

        if (data?.theme_id) {
          const theme = getThemeById(data.theme_id);
          if (theme) {
            setCurrentTheme(theme);
            localStorage.setItem(STORAGE_KEY, theme.id);
          }
        }
      }
    };

    loadUserTheme();
  }, [user, profile]);

  useEffect(() => {
    applyThemeToDOM(currentTheme);
  }, [currentTheme]);

  const setTheme = async (themeId: string) => {
    const theme = getThemeById(themeId);
    if (!theme) return;

    setCurrentTheme(theme);
    localStorage.setItem(STORAGE_KEY, themeId);
    applyThemeToDOM(theme);

    if (user) {
      await supabase
        .from('users')
        .update({ theme_id: themeId, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
