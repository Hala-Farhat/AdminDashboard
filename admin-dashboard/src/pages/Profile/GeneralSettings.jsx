import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { User, Mail, Loader2, Edit2, Save, X, Camera } from 'lucide-react';
import clsx from 'clsx';
import api from '../../api/apiConfig';
import { API_BASE_URL } from '../../api/apiConfig';
import { formatImageUrl } from '../../api/urlHelpers';

const GeneralSettings = () => {
    const { user, token, loading, refreshProfile } = useAuth();
    const { t, language, toggleLanguage } = useLanguage();
    const toast = useToast();

    const fileInputRef = useRef(null);

    const [isEditing, setIsEditing] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        avatarFile: null,
        previewUrl: ''
    });

    useEffect(() => {
        if (user) {
            const nameParts = (user.displayName || user.fullName || '').trim().split(/\s+/);
            setFormData({
                first_name: user.first_name || nameParts[0] || '',
                last_name: user.last_name || nameParts.slice(1).join(' ') || '',
                avatarFile: null,
                previewUrl: user.avatarUrl || ''
            });
        }
    }, [user, isEditing]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64 bg-white dark:bg-dark-bg-secondary rounded-2xl border border-gray-100 dark:border-dark-border">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
            </div>
        );
    }

    if (!user) return null;

    const nameParts = (user.displayName || user.fullName || '').trim().split(/\s+/);
    const firstName = user.first_name || nameParts[0] || 'Admin';
    const lastName = user.last_name || nameParts.slice(1).join(' ') || '';

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                toast.error('File size too large (max 2MB)');
                return;
            }
            setFormData(prev => ({
                ...prev,
                avatarFile: file,
                previewUrl: URL.createObjectURL(file)
            }));
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const displayName = `${formData.first_name} ${formData.last_name}`.trim();
            const submitData = new FormData();
            submitData.append('displayName', displayName);
            if (formData.avatarFile) {
                submitData.append('avatarUrl', formData.avatarFile);
            }

            await api.patch(`/users/me/profile`, submitData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            await refreshProfile();
            setIsEditing(false);
            toast.success(t('profile.messages.updateProfileSuccess'));
        } catch (err) {
            console.error(err);
            toast.error(t('common.error'));
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden transition-all duration-300">
                <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-900 dark:to-purple-900 relative">
                    <div className="absolute end-6 bottom-6 z-10">
                        {!isEditing ? (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center px-4 py-2 bg-white/20 backdrop-blur-md text-white border border-white/30 rounded-xl hover:bg-white/30 transition-all font-bold text-sm"
                            >
                                <Edit2 className="h-4 w-4 me-2" />
                                {t('common.edit')}
                            </button>
                        ) : (
                            <button
                                onClick={() => setIsEditing(false)}
                                className="flex items-center px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all font-bold text-sm shadow-lg"
                            >
                                <X className="h-4 w-4 me-2" />
                                {t('common.cancel')}
                            </button>
                        )}
                    </div>
                </div>

                <div className="px-8 pb-8">
                    <div className="relative -mt-16 mb-6 flex justify-center sm:justify-start">
                        <div className="relative h-32 w-32 rounded-2xl bg-white dark:bg-dark-bg-secondary p-2 shadow-xl ring-4 ring-white dark:ring-dark-bg-secondary transition-all">
                            <div className="h-full w-full rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-4xl overflow-hidden group relative border border-indigo-100 dark:border-indigo-800">
                                {formData.previewUrl ? (
                                    <img src={formatImageUrl(formData.previewUrl)} alt={t('common.avatar')} className="h-full w-full object-cover" />
                                ) : (
                                    (firstName[0] || 'A').toUpperCase()
                                )}

                                {isEditing && (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Camera className="h-6 w-6 mb-1" />
                                        <span className="text-[10px] font-bold uppercase">{t('profile.change')}</span>
                                    </button>
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                        </div>
                    </div>

                    {isEditing ? (
                        <form onSubmit={handleUpdate} className="space-y-6 max-w-2xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">{t('profile.firstName')}</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:bg-white dark:focus:bg-dark-bg-elevated text-gray-900 dark:text-dark-text-primary transition-all font-medium"
                                        value={formData.first_name}
                                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">{t('profile.lastName')}</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:bg-white dark:focus:bg-dark-bg-elevated text-gray-900 dark:text-dark-text-primary transition-all font-medium"
                                        value={formData.last_name}
                                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className={clsx(
                                        "flex items-center px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-200 active:scale-95",
                                        actionLoading && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <Save className="h-5 w-5 me-2" />
                                    {t('common.save')}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="max-w-2xl">
                            <h3 className="mb-8 text-3xl font-bold tracking-tight text-gray-900 dark:text-dark-text-primary">
                                {firstName} {lastName}
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 border-t border-gray-100 dark:border-dark-border">
                                <InfoCard icon={User} label={t('profile.firstName')} value={firstName} />
                                <InfoCard icon={User} label={t('profile.lastName')} value={lastName || '-'} />
                                <InfoCard icon={Mail} label={t('profile.email')} value={user.email} />
                            </div>

                        </div>
                    )}
                </div>
            </div>

        </div>

    );
};

const InfoCard = ({ icon: Icon, label, value, highlight }) => (
    <div className="flex items-center p-4 bg-gray-50/50 dark:bg-dark-bg-tertiary/50 rounded-2xl border border-gray-100 dark:border-dark-border hover:bg-white dark:hover:bg-dark-bg-elevated hover:shadow-sm transition-all duration-300 group">
        <div className="p-2.5 bg-white dark:bg-dark-bg-elevated rounded-xl shadow-sm me-4 group-hover:scale-110 transition-transform">
            <Icon className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
        </div>
        <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-400 dark:text-dark-text-muted uppercase tracking-widest">{label}</p>
            <p className={`font-bold truncate ${highlight ? 'text-indigo-600 dark:text-indigo-400 uppercase' : 'text-gray-900 dark:text-dark-text-primary'}`}>{value}</p>
        </div>
    </div>
);

export default GeneralSettings;
