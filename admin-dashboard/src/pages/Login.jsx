import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { Lock, Mail, Loader2, X, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useToast } from '../context/ToastContext';

const inputBaseClass =
    'block w-full rounded-lg border border-khabeer-stroke bg-white py-2.5 text-sm text-[#111] shadow-sm transition-all placeholder:text-gray-400 focus:border-khabeer-brand focus:outline-none focus:ring-2 focus:ring-khabeer-brand/20 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary dark:placeholder-dark-text-muted dark:focus:border-dark-accent-blue dark:focus:ring-dark-accent-blue/25';

// Modal component for Forgot Password
const ForgotPasswordModal = ({ isOpen, onClose, onReset }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const { t } = useLanguage();

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        await onReset(email);
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60">
            <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-khabeer-stroke bg-white shadow-2xl dark:border-dark-border dark:bg-dark-bg-elevated"
                role="dialog"
                aria-modal="true"
                aria-labelledby="forgot-password-heading"
            >
                <div className="h-1 bg-gradient-to-r from-khabeer-brand via-sky-500 to-cyan-400" />
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-dark-border">
                    <h3
                        id="forgot-password-heading"
                        className="font-heading text-lg font-bold text-[#111] dark:text-dark-text-primary"
                    >
                        {t('login.forgotPasswordTitle')}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-dark-bg-tertiary dark:hover:text-dark-text-primary"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="p-6">
                    <p className="mb-5 text-sm leading-relaxed text-gray-600 dark:text-dark-text-secondary">
                        {t('login.forgotPasswordDesc')}
                    </p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label
                                htmlFor="reset-email"
                                className="mb-1.5 block text-sm font-medium text-[#333] dark:text-dark-text-secondary"
                            >
                                {t('login.email')}
                            </label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5">
                                    <Mail className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                                </div>
                                <input
                                    id="reset-email"
                                    type="email"
                                    required
                                    className={`${inputBaseClass} ps-11 pe-3`}
                                    placeholder={t('login.email')}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex items-center justify-center rounded-xl bg-khabeer-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-khabeer-brand/25 transition hover:bg-[#006aa3] disabled:opacity-50 dark:shadow-khabeer-brand/20"
                            >
                                {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                {t('login.sendResetLink')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errorKey, setErrorKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [showForgotModal, setShowForgotModal] = useState(false);

    const { login, loginWithGoogle, resetPassword, token } = useAuth();
    const { t, language } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const from = location.state?.from?.pathname || '/';

    useEffect(() => {
        if (token) {
            navigate(from === '/login' ? '/' : from, { replace: true });
        }
    }, [token, navigate, from]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorKey('');
        setIsLoading(true);

        const result = await login(email, password);

        if (result.success) {
            navigate(from, { replace: true });
        } else {
            setErrorKey(result.errorKey);
        }
        setIsLoading(false);
    };

    const handleGoogleLogin = async () => {
        setErrorKey('');
        setIsGoogleLoading(true);
        const result = await loginWithGoogle();
        if (result.success) {
            navigate(from, { replace: true });
        } else {
            if (!result.isCancelled) {
                setErrorKey(result.errorKey);
            }
        }
        setIsGoogleLoading(false);
    };

    const handleResetPassword = async (resetEmail) => {
        const result = await resetPassword(resetEmail);
        if (result.success) {
            setShowForgotModal(false);
            toast.success(t('login.resetLinkSent'));
        } else {
            toast.error(t(result.errorKey));
        }
    };

    const isRTL = language === 'ar';

    return (
        /** h-full + overflow-y-auto: #root له overflow:hidden — بدونها يُقص أسفل الصفحة (زر Google) */
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain bg-white dark:bg-dark-bg-primary">
            {/* أدوات أعلى: ثيم + لغة */}
            <div
                className={`sticky top-0 z-20 flex shrink-0 px-4 pb-2 pt-4 sm:px-6 ${isRTL ? 'justify-start' : 'justify-end'}`}
            >
                <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-khabeer-stroke bg-white text-gray-600 shadow-sm transition hover:text-khabeer-brand dark:border-dark-border dark:bg-dark-bg-elevated dark:text-dark-text-secondary dark:hover:text-dark-accent-blue"
                    title={
                        theme === 'dark'
                            ? t('common.themes.switchToLight') || 'Switch to Light Mode'
                            : t('common.themes.switchToDark') || 'Switch to Dark Mode'
                    }
                >
                    {theme === 'dark' ? (
                        <Sun className="h-5 w-5 text-amber-400" />
                    ) : (
                        <Moon className="h-5 w-5 text-khabeer-brand" />
                    )}
                </button>
                <LanguageSwitcher variant="pill" className="min-w-[9.5rem] [&_button]:h-10" />
                </div>
            </div>

            <div className="flex w-full flex-1 flex-col items-center justify-center px-4 pb-10 pt-2 sm:px-6">
                <div className="relative z-10 w-full max-w-[380px] shrink-0 animate-fade-in">
                <div className="rounded-2xl border border-khabeer-stroke bg-white shadow-lg shadow-gray-200/80 dark:border-dark-border dark:bg-dark-bg-elevated dark:shadow-black/40">
                    <div className="h-1 bg-gradient-to-r from-khabeer-brand via-sky-500 to-cyan-400" />

                    <div className="px-5 pb-7 pt-6 sm:px-6">
                        <div className="mb-5 flex flex-col items-center text-center">
                            <h1 className="font-heading text-lg font-extrabold tracking-tight text-[#0a0a0a] dark:text-dark-text-primary sm:text-xl">
                                {t('login.title')}
                            </h1>
                            <p className="mt-1.5 max-w-[280px] text-xs leading-relaxed text-gray-600 dark:text-dark-text-secondary sm:text-[13px]">
                                {t('login.subtitle')}
                            </p>
                        </div>

                        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                            <div className="space-y-3">
                                <div>
                                    <label
                                        htmlFor="email-address"
                                        className="mb-1 block text-start text-xs font-medium text-[#333] dark:text-dark-text-secondary sm:text-[13px]"
                                    >
                                        {t('login.email')}
                                    </label>
                                    <div className="relative">
                                        <div className="pointer-events-none absolute inset-y-0 start-0 z-10 flex items-center ps-3.5">
                                            <Mail className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                                        </div>
                                        <input
                                            id="email-address"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            className={`${inputBaseClass} ps-10 pe-3`}
                                            placeholder={t('login.email')}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label
                                        htmlFor="password"
                                        className="mb-1 block text-start text-xs font-medium text-[#333] dark:text-dark-text-secondary sm:text-[13px]"
                                    >
                                        {t('login.password')}
                                    </label>
                                    <div className="relative">
                                        <div className="pointer-events-none absolute inset-y-0 start-0 z-10 flex items-center ps-3.5">
                                            <Lock className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                                        </div>
                                        <input
                                            id="password"
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="current-password"
                                            required
                                            className={`${inputBaseClass} ps-10 pe-11`}
                                            placeholder={t('login.password')}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="absolute inset-y-0 end-0 z-10 flex items-center justify-center rounded-e-xl px-3 text-gray-500 transition hover:text-khabeer-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-khabeer-brand/40 dark:text-dark-text-muted dark:hover:text-dark-accent-blue dark:focus-visible:ring-dark-accent-blue/40"
                                            onClick={() => setShowPassword((v) => !v)}
                                            aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                                            aria-pressed={showPassword}
                                        >
                                            {showPassword ? (
                                                <EyeOff className="h-5 w-5 shrink-0" strokeWidth={2} />
                                            ) : (
                                                <Eye className="h-5 w-5 shrink-0" strokeWidth={2} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowForgotModal(true)}
                                    className="text-sm font-semibold text-khabeer-brand transition hover:underline dark:text-dark-accent-blue"
                                >
                                    {t('login.forgotPassword')}
                                </button>
                            </div>

                            {errorKey ? (
                                <div
                                    className="rounded-xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                                    role="alert"
                                >
                                    {t(errorKey)}
                                </div>
                            ) : null}

                            <div className="space-y-2.5 pt-0.5">
                                <button
                                    type="submit"
                                    disabled={isLoading || isGoogleLoading}
                                    className="relative w-full overflow-hidden rounded-lg bg-khabeer-brand py-2.5 text-sm font-semibold text-white shadow-md shadow-khabeer-brand/25 transition hover:bg-[#006aa3] focus:outline-none focus:ring-2 focus:ring-khabeer-brand/40 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-dark-accent-blue/35"
                                >
                                    {isLoading ? (
                                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                                    ) : (
                                        t('login.signIn')
                                    )}
                                </button>

                                <div className="relative py-0.5">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-200 dark:border-dark-border" />
                                    </div>
                                    <div className="relative flex justify-center text-[11px] sm:text-xs">
                                        <span className="bg-white px-2 font-medium text-gray-500 dark:bg-dark-bg-elevated dark:text-dark-text-muted">
                                            {t('login.orContinueWith') || 'Or continue with'}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleGoogleLogin}
                                    disabled={isLoading || isGoogleLoading}
                                    className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-khabeer-stroke bg-white py-2.5 text-sm font-semibold text-[#333] shadow-sm transition hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300/80 disabled:opacity-50 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary dark:hover:bg-dark-bg-elevated dark:focus:ring-dark-border"
                                >
                                    {isGoogleLoading ? (
                                        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                                    ) : (
                                        <>
                                            <svg className="h-5 w-5 shrink-0" aria-hidden="true" viewBox="0 0 24 24">
                                                <path
                                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                                    fill="#4285F4"
                                                />
                                                <path
                                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                                    fill="#34A853"
                                                />
                                                <path
                                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                                    fill="#FBBC05"
                                                />
                                                <path
                                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                                    fill="#EA4335"
                                                />
                                            </svg>
                                            {t('login.google')}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
                </div>
            </div>

            <ForgotPasswordModal
                isOpen={showForgotModal}
                onClose={() => setShowForgotModal(false)}
                onReset={handleResetPassword}
            />
        </div>
    );
};

export default Login;
