import { BadgeCheck, Globe } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const LanguageSettings = () => {
    const { t, language, toggleLanguage } = useLanguage();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-8 transition-all duration-300">
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                        <Globe className="h-5 w-5 text-indigo-500" />
                        {t('common.languageSettings')}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
                        {t('common.languageSettingsDesc')}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => {
                            if (language !== 'en') toggleLanguage();
                        }}
                        className={`group relative flex items-center p-6 rounded-2xl border-2 transition-all duration-300 ${language === 'en'
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-md ring-1 ring-indigo-100 dark:ring-indigo-500/30'
                            : 'border-gray-100 dark:border-dark-border hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-white dark:hover:bg-dark-bg-tertiary hover:shadow-sm'
                            }`}
                    >
                        <div className={`p-4 rounded-full me-5 transition-colors ${language === 'en' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-secondary group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-500 dark:group-hover:text-indigo-400'
                            }`}>
                            <span className="font-bold text-xl">EN</span>
                        </div>
                        <div className="text-start">
                            <p className={`font-bold text-lg ${language === 'en' ? 'text-indigo-900 dark:text-indigo-300' : 'text-gray-900 dark:text-dark-text-primary'}`}>English</p>
                            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">English</p>
                        </div>
                        {language === 'en' && (
                            <div className="absolute top-6 end-6 text-indigo-600">
                                <BadgeCheck className="h-6 w-6" />
                            </div>
                        )}
                    </button>

                    <button
                        onClick={() => {
                            if (language !== 'ar') toggleLanguage();
                        }}
                        className={`group relative flex items-center p-6 rounded-2xl border-2 transition-all duration-300 ${language === 'ar'
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-md ring-1 ring-indigo-100 dark:ring-indigo-500/30'
                            : 'border-gray-100 dark:border-dark-border hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-white dark:hover:bg-dark-bg-tertiary hover:shadow-sm'
                            }`}
                    >
                        <div className={`p-4 rounded-full me-5 transition-colors ${language === 'ar' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400 dark:text-dark-text-secondary group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-500 dark:group-hover:text-indigo-400'
                            }`}>
                            <span className="font-bold text-xl">ع</span>
                        </div>
                        <div className="text-start">
                            <p className={`font-bold text-lg ${language === 'ar' ? 'text-indigo-900 dark:text-indigo-300' : 'text-gray-900 dark:text-dark-text-primary'}`}>{language === 'ar' ? 'العربية' : 'Arabic'}</p>
                            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">{t('common.language.ar')}</p>
                        </div>
                        {language === 'ar' && (
                            <div className="absolute top-6 end-6 text-indigo-600">
                                <BadgeCheck className="h-6 w-6" />
                            </div>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LanguageSettings;
