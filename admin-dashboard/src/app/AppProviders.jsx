import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';
import { ToastProvider } from '../context/ToastContext';
import { CacheProvider } from '../context/CacheContext';
import { ThemeProvider } from '../context/ThemeContext';
import { queryClient } from '../lib/queryClient';

export function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <ThemeProvider>
            <CacheProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </CacheProvider>
          </ThemeProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

