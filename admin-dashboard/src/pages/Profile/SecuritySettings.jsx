import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Lock, KeyRound, Eye, EyeOff, Save, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const SecuritySettings = () => {
    const { changePassword } = useAuth();
    const { t } = useLanguage();
    const toast = useToast();

    const [actionLoading, setActionLoading] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error(t('profile.passwordsDoNotMatch'));
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
        if (!passwordRegex.test(passwordData.newPassword)) {
            toast.error(t('profile.passwordTooShort'));
            return;
        }

        setActionLoading(true);
        const result = await changePassword(passwordData.currentPassword, passwordData.newPassword);
        setActionLoading(false);

        if (result.success) {
            toast.success(t('profile.messages.changePasswordSuccess'));
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } else {
            const errorMap = {
                'auth/wrong-password': t('profile.incorrectPassword'),
                'auth/invalid-credential': t('profile.incorrectPassword'),
                'auth/requires-recent-login': t('profile.reloginToChangePassword'),
                'auth/weak-password': t('profile.passwordTooShort'),
                'auth/too-many-requests': t('profile.tooManyAttempts')
            };
            toast.error(errorMap[result.error] || t('common.error'));
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden transition-all duration-300">
                <div className="p-8 border-b border-gray-50 dark:border-dark-border bg-gray-50/30 dark:bg-dark-bg-tertiary/30">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none">
                            <ShieldCheck className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">{t('profile.security')}</h3>
                            <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-0.5">{t('profile.securityDesc')}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    <form onSubmit={handlePasswordChange} className="max-w-xl space-y-8">
                        {/* Requirement Info */}
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800/30 flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-medium">
                                {t('profile.passwordTooShort')}
                            </p>
                        </div>

                        <div className="space-y-5">
                            <PasswordField
                                label={t('profile.currentPassword')}
                                icon={KeyRound}
                                value={passwordData.currentPassword}
                                onChange={(val) => setPasswordData({ ...passwordData, currentPassword: val })}
                                show={showPasswords.current}
                                onToggle={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                                placeholder="••••••••"
                            />

                            <div className="h-px bg-gray-100 dark:bg-dark-border my-4"></div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <PasswordField
                                    label={t('profile.newPassword')}
                                    icon={Lock}
                                    value={passwordData.newPassword}
                                    onChange={(val) => setPasswordData({ ...passwordData, newPassword: val })}
                                    show={showPasswords.new}
                                    onToggle={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                                    placeholder={t('profile.passwordPlaceholder') || '8+ characters'}
                                />
                                <PasswordField
                                    label={t('profile.confirmPassword')}
                                    icon={Lock}
                                    value={passwordData.confirmPassword}
                                    onChange={(val) => setPasswordData({ ...passwordData, confirmPassword: val })}
                                    show={showPasswords.confirm}
                                    onToggle={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                                    placeholder={t('profile.confirmPasswordPlaceholder') || 'Repeat password'}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button
                                type="submit"
                                disabled={actionLoading}
                                className={clsx(
                                    "flex items-center px-8 py-3.5 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl hover:shadow-gray-200 active:scale-95",
                                    actionLoading && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Save className="h-5 w-5 me-2" />
                                {t('profile.changePassword')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

const PasswordField = ({ label, icon: Icon, value, onChange, show, onToggle, placeholder }) => (
    <div className="space-y-2.5">
        <label className="text-[11px] font-bold text-gray-400 dark:text-dark-text-muted uppercase tracking-widest ms-1">{label}</label>
        <div className="relative group">
            <Icon className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-dark-text-muted group-focus-within:text-indigo-500 dark:group-focus-within:text-indigo-400 transition-colors" />
            <input
                type={show ? "text" : "password"}
                className="w-full ps-12 pe-12 py-3.5 bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-dark-bg-elevated transition-all font-medium text-gray-900 dark:text-dark-text-primary placeholder:text-gray-300 dark:placeholder:text-gray-600"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required
                placeholder={placeholder}
            />
            <button
                type="button"
                onClick={onToggle}
                className="absolute end-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
        </div>
    </div>
);

export default SecuritySettings;
