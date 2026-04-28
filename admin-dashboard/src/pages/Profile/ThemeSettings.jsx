import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { CheckCircle, Palette } from 'lucide-react';
import clsx from 'clsx';

const ThemeSettings = () => {
    const { t } = useLanguage();
    const { theme, setTheme } = useTheme();

    /** سمات قديمة أُزيلت من الواجهة — نعرض «داكن» كنشط */
    const isThemeActive = (id) =>
        id === 'light' ? theme === 'light' : theme !== 'light';

    const themes = [
        { id: 'light', name: t('common.themes.light.name'), bg: 'bg-gray-50', primary: 'bg-indigo-600', text: 'text-gray-900', description: t('common.themes.light.desc') },
        { id: 'dark', name: t('common.themes.dark.name'), bg: 'bg-[#0a0a0f]', primary: 'bg-indigo-600', text: 'text-gray-100', description: t('common.themes.dark.desc') }
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border overflow-hidden transition-all duration-300">
                <div className="h-32 bg-gradient-to-r from-purple-500 to-pink-600 dark:from-purple-900 dark:to-pink-900 relative">
                    <div className="absolute start-8 bottom-6 flex items-center text-white">
                        <div className="p-2 bg-white/20 backdrop-blur-md rounded-lg me-4">
                            <Palette className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">{t('profile.appearance.title')}</h2>
                            <p className="text-white/80 text-sm">{t('profile.appearance.subtitle')}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">{t('profile.appearance.themeSelection')}</h3>
                        <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">{t('profile.appearance.themeDesc')}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:max-w-3xl">
                        {themes.map((themeItem) => (
                            <button
                                key={themeItem.id}
                                onClick={() => setTheme(themeItem.id)}
                                className={clsx(
                                    "relative group flex flex-col items-start translate-x-0 rounded-2xl border-2 transition-all duration-300 overflow-hidden hover:shadow-md text-start",
                                    isThemeActive(themeItem.id)
                                        ? "border-indigo-600 ring-4 ring-indigo-600/10 dark:ring-indigo-600/20 bg-indigo-50/50 dark:bg-indigo-900/10"
                                        : "border-gray-100 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary hover:border-indigo-200 dark:hover:border-indigo-900"
                                )}
                            >
                                <div className={`w-full h-32 ${themeItem.bg} relative transition-transform duration-500 group-hover:scale-105`}>
                                    {/* Abstract UI Representation */}
                                    <div className="absolute top-4 start-4 end-4 bottom-0 bg-white/10 dark:bg-black/10 backdrop-blur-sm rounded-t-xl border border-white/20 dark:border-white/5 p-3">
                                        <div className="flex gap-2 mb-3">
                                            <div className={`h-2 w-2 rounded-full ${themeItem.primary}`}></div>
                                            <div className={`h-2 w-12 rounded-full ${themeItem.primary} opacity-30`}></div>
                                        </div>
                                        <div className={`h-2 w-3/4 rounded-full bg-current opacity-20 mb-2 ${themeItem.text}`}></div>
                                        <div className={`h-2 w-1/2 rounded-full bg-current opacity-10 ${themeItem.text}`}></div>

                                        <div className="mt-4 flex gap-2">
                                            <div className={`h-8 w-full rounded-lg bg-current opacity-5 ${themeItem.text}`}></div>
                                            <div className={`h-8 w-full rounded-lg bg-current opacity-5 ${themeItem.text}`}></div>
                                        </div>
                                    </div>

                                    {/* Active Checkmark */}
                                    {isThemeActive(themeItem.id) && (
                                        <div className="absolute top-3 end-3 h-6 w-6 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg animate-in zoom-in duration-300">
                                            <CheckCircle className="h-4 w-4" />
                                        </div>
                                    )}
                                </div>

                                <div className="p-5 w-full">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-bold text-gray-900 dark:text-dark-text-primary">{themeItem.name}</span>
                                        {isThemeActive(themeItem.id) && <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">{t('profile.appearance.active')}</span>}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-dark-text-secondary">{themeItem.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ThemeSettings;
