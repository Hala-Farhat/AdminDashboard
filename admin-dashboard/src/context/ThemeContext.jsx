import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};

export const ThemeProvider = ({ children }) => {
    // Initialize theme from localStorage or system preference
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme;
        }
        // Check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    });

    // Apply theme to document root
    useEffect(() => {
        const root = document.documentElement;

        // Remove previous theme attributes
        root.classList.remove('dark');
        root.removeAttribute('data-theme');

        if (theme === 'light') {
            // Default light theme - nothing needed
        } else if (theme === 'dark') {
            // Default dark theme
            root.classList.add('dark');
        } else {
            // Custom themes (all are dark-based for now)
            root.classList.add('dark');
            root.setAttribute('data-theme', theme);
        }

        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        // Simple toggle for now, but UI will likely set specific themes
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    };

    const setThemeValue = (newTheme) => {
        setTheme(newTheme);
    };

    const value = {
        theme,
        toggleTheme,
        setTheme: setThemeValue,
        isDark: theme !== 'light'
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};
