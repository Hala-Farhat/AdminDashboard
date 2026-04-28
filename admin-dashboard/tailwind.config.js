/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            /* Figma node 15:2808 — sidebar */
            width: {
                sidebar: '258px',
                'sidebar-collapsed': '104px',
            },
            spacing: {
                sidebar: '258px',
                'sidebar-collapsed': '104px',
            },
            fontFamily: {
                sans: ['Tajawal', 'sans-serif'],
                heading: ['Tajawal', 'sans-serif'],
            },
            colors: {
                primary: {
                    50: 'rgb(var(--primary-50) / <alpha-value>)',
                    100: 'rgb(var(--primary-100) / <alpha-value>)',
                    200: 'rgb(var(--primary-200) / <alpha-value>)',
                    300: 'rgb(var(--primary-300) / <alpha-value>)',
                    400: 'rgb(var(--primary-400) / <alpha-value>)',
                    500: 'rgb(var(--primary-500) / <alpha-value>)',
                    600: 'rgb(var(--primary-600) / <alpha-value>)',
                    700: 'rgb(var(--primary-700) / <alpha-value>)',
                    800: 'rgb(var(--primary-800) / <alpha-value>)',
                    900: 'rgb(var(--primary-900) / <alpha-value>)',
                    950: 'rgb(var(--primary-950) / <alpha-value>)',
                },
                secondary: {
                    50: '#f5f3ff',
                    100: '#ede9fe',
                    200: '#ddd6fe',
                    300: '#c4b5fd',
                    400: '#a78bfa',
                    500: '#8b5cf6',
                    600: '#7c3aed',
                    700: '#6d28d9',
                    800: '#5b21b6',
                    900: '#4c1d95',
                    950: '#2e1065',
                },
                // Antigravity-inspired dark mode colors (using variables for multi-theme)
                // Khabeer dashboard (Figma — sidebar)
                khabeer: {
                    brand: '#0077b6',
                    muted: '#666666',
                    stroke: '#e2e2e2',
                    danger: '#ef4444',
                },
                dark: {
                    bg: {
                        primary: 'rgb(var(--dark-bg-primary) / <alpha-value>)',
                        secondary: 'rgb(var(--dark-bg-secondary) / <alpha-value>)',
                        tertiary: 'rgb(var(--dark-bg-tertiary) / <alpha-value>)',
                        elevated: 'rgb(var(--dark-bg-elevated) / <alpha-value>)',
                    },
                    text: {
                        primary: 'rgb(var(--dark-text-primary) / <alpha-value>)',
                        secondary: 'rgb(var(--dark-text-secondary) / <alpha-value>)',
                        muted: 'rgb(var(--dark-text-muted) / <alpha-value>)',
                    },
                    accent: {
                        purple: 'rgb(var(--dark-accent-purple) / <alpha-value>)',
                        blue: '#5b9cf6',
                        green: '#4ade80',
                        red: '#f87171',
                        yellow: '#fbbf24',
                    },
                    border: 'rgb(var(--dark-border) / <alpha-value>)',
                    'border-light': '#35354a',
                }
            },
            backgroundImage: {
                'gradient-dark': 'linear-gradient(135deg, #0a0a0f 0%, #1a1a24 100%)',
                'gradient-purple': 'linear-gradient(135deg, #8b7cf6 0%, #5b9cf6 100%)',
            },
            boxShadow: {
                'dark-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
                'dark-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
                'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
                'dark-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
            }
        },
    },
    plugins: [],
}
