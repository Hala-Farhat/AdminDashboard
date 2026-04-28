import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { ChevronDown, Globe } from 'lucide-react';
import clsx from 'clsx';

const LanguageSwitcher = ({ variant = 'default', className = '' }) => {
    const { language, toggleLanguage, changeLanguage, t } = useLanguage();
    const [menuOpen, setMenuOpen] = useState(false);
    const pillWrapRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onDoc = (e) => {
            if (pillWrapRef.current && !pillWrapRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    // Login page variant - Absolute positioning, sleek minimalist look
    if (variant === 'login') {
        return (
            <button
                onClick={toggleLanguage}
                className={`
                    absolute top-6 end-6
                    flex items-center gap-2 px-4 py-2 
                    bg-transparent hover:bg-white/90 hover:backdrop-blur-md
                    border border-transparent hover:border-gray-200/60
                    text-gray-500 hover:text-indigo-600
                    rounded-full transition-all duration-300 ease-out
                    group z-50 hover:shadow-lg hover:-translate-y-0.5
                `}
                title={t('common.language.' + (language === 'ar' ? 'en' : 'ar'))}
            >
                <div className="bg-gray-100 p-1.5 rounded-full group-hover:bg-indigo-50 transition-colors duration-300">
                    <Globe className="h-4 w-4 text-gray-500 group-hover:text-indigo-600 transition-colors duration-300" />
                </div>
                <span className="font-medium text-sm tracking-wide opacity-80 group-hover:opacity-100 transition-opacity">
                    {language === 'ar' ? 'English' : 'العربية'}
                </span>
            </button>
        );
    }

    // Figma header — pill (globe + label + chevron): قائمة اختيار وليس تبديلاً مباشراً
    if (variant === 'pill') {
        const menuId = 'language-switcher-menu';
        return (
            <div ref={pillWrapRef} className={clsx('relative shrink-0', className)}>
                <button
                    type="button"
                    id="language-switcher-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={menuOpen}
                    aria-controls={menuId}
                    onClick={() => setMenuOpen((o) => !o)}
                    className={clsx(
                        'flex h-10 w-full min-w-0 shrink-0 items-center gap-3.5 rounded-full border border-khabeer-stroke bg-white px-2 text-khabeer-muted transition-colors hover:border-khabeer-brand/40 hover:text-khabeer-brand dark:border-dark-border dark:bg-dark-bg-secondary dark:hover:border-dark-accent-blue/50 dark:hover:text-dark-accent-blue',
                        menuOpen && 'border-khabeer-brand/50 text-khabeer-brand dark:border-dark-accent-blue/50 dark:text-dark-accent-blue'
                    )}
                    title={t('dashboard.languageMenuAria')}
                >
                    <Globe className="size-6 shrink-0 opacity-80" strokeWidth={1.5} aria-hidden />
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-1 text-[14px] font-normal leading-normal">
                        <span className="truncate">
                            {language === 'ar' ? t('common.language.ar') : t('common.language.en')}
                        </span>
                        <ChevronDown
                            className={clsx(
                                'size-6 shrink-0 opacity-70 transition-transform duration-200',
                                menuOpen && 'rotate-180'
                            )}
                            strokeWidth={1.5}
                            aria-hidden
                        />
                    </span>
                </button>
                {menuOpen ? (
                    <ul
                        id={menuId}
                        role="listbox"
                        aria-labelledby="language-switcher-trigger"
                        className="absolute end-0 top-full z-[100] mt-1 min-w-[11rem] rounded-xl border border-khabeer-stroke bg-white py-1 shadow-lg dark:border-dark-border dark:bg-dark-bg-secondary"
                    >
                        <li role="presentation">
                            <button
                                type="button"
                                role="option"
                                aria-selected={language === 'ar'}
                                className={clsx(
                                    'flex w-full items-center px-3 py-2.5 text-[14px] transition-colors',
                                    language === 'ar'
                                        ? 'bg-khabeer-brand/10 font-medium text-khabeer-brand dark:bg-dark-accent-blue/15 dark:text-dark-accent-blue'
                                        : 'text-[#333] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary'
                                )}
                                onClick={() => {
                                    setMenuOpen(false);
                                    changeLanguage('ar');
                                }}
                            >
                                {t('common.language.ar')}
                            </button>
                        </li>
                        <li role="presentation">
                            <button
                                type="button"
                                role="option"
                                aria-selected={language === 'en'}
                                className={clsx(
                                    'flex w-full items-center px-3 py-2.5 text-[14px] transition-colors',
                                    language === 'en'
                                        ? 'bg-khabeer-brand/10 font-medium text-khabeer-brand dark:bg-dark-accent-blue/15 dark:text-dark-accent-blue'
                                        : 'text-[#333] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary'
                                )}
                                onClick={() => {
                                    setMenuOpen(false);
                                    changeLanguage('en');
                                }}
                            >
                                {t('common.language.en')}
                            </button>
                        </li>
                    </ul>
                ) : null}
            </div>
        );
    }

    // Dashboard header (Khabeer toolbar — matches #666 / #0077b6 tokens)
    return (
        <button
            type="button"
            onClick={toggleLanguage}
            className="flex h-10 items-center gap-2 rounded-[5px] px-2.5 text-khabeer-muted transition-colors hover:bg-gray-50 hover:text-khabeer-brand sm:px-3 dark:hover:bg-dark-bg-tertiary"
            title={t('common.language.' + (language === 'ar' ? 'en' : 'ar'))}
        >
            <Globe className="size-5 shrink-0" />
            <span className="hidden text-[14px] font-medium sm:inline">
                {language === 'ar' ? 'English' : 'عربي'}
            </span>
        </button>
    );
};

export default LanguageSwitcher;
