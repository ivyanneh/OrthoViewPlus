import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const STORAGE_KEY = 'orthoviewplus_theme';
const ThemeContext = createContext();

function getValidTheme(value) {
  return value === 'dark' || value === 'light' ? value : null;
}

export function ThemeProvider({ children }) {
  const { user } = useAuth();

  const [theme, setThemeState] = useState(() => {
    const stored = getValidTheme(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
    return getValidTheme(user?.theme_preference) || 'light';
  });

  // Sync state if user settings load late from backend API
  useEffect(() => {
    if (user?.theme_preference) {
      const userPref = getValidTheme(user.theme_preference);
      if (userPref && !localStorage.getItem(STORAGE_KEY)) {
        setThemeState(userPref);
      }
    }
  }, [user?.theme_preference]);

  useEffect(() => {
    const valid = getValidTheme(theme) || 'light';

    // 1. Force data-theme on BOTH <html> and <body> elements
    document.documentElement.setAttribute('data-theme', valid);
    document.body.setAttribute('data-theme', valid);

    // 2. Force classes on BOTH <html> and <body> elements
    if (valid === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }

    // 3. Save choice in localStorage
    localStorage.setItem(STORAGE_KEY, valid);
  }, [theme]);

  const setTheme = (newTheme) => {
    const valid = getValidTheme(newTheme);
    if (valid) setThemeState(valid);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export default function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}