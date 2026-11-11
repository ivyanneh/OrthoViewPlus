import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const STORAGE_KEY = 'orthoviewplus_theme';
const THEME_EVENT = 'orthoviewplus-theme-change';

function getValidTheme(value) {
  return value === 'dark' || value === 'light' ? value : null;
}

export default function useTheme() {
  const { user } = useAuth();

  const [theme, setThemeState] = useState(() => {
    const stored = getValidTheme(localStorage.getItem(STORAGE_KEY));

    if (stored) return stored;

    return getValidTheme(user?.theme_preference) || 'light';
  });

  useEffect(() => {
    const syncTheme = () => {
      const nextTheme = getValidTheme(
        document.documentElement.getAttribute('data-theme') ||
        localStorage.getItem(STORAGE_KEY)
      );

      if (nextTheme) {
        setThemeState(nextTheme);
      }
    };

    window.addEventListener(THEME_EVENT, syncTheme);
    window.addEventListener('storage', syncTheme);

    return () => {
      window.removeEventListener(THEME_EVENT, syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, [theme]);

  function setTheme(newTheme) {
    const validTheme = getValidTheme(newTheme);

    if (validTheme) {
      setThemeState(validTheme);
    }
  }

  return { theme, setTheme, user };
}
