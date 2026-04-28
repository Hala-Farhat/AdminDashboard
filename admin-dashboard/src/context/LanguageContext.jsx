import { createContext, useContext, useState, useEffect } from 'react';
import translations from '../locales';

const LanguageContext = createContext(null);

// Provider for language context
export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState(() => {
        // Get language from localStorage or default to Arabic
        return localStorage.getItem('language') || 'ar';
    });

    useEffect(() => {
        // Update document direction based on language
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = language;

        // Save language preference
        localStorage.setItem('language', language);
    }, [language]);

    /**
     * إعادة تحميل كاملة بعد تغيير اللغة حتى:
     * - يُعاد POST /users/me/fcm بلغة الواجهة الجديدة (نفس التوكن كان يُمنع إعادة التسجيل بدون ريفرش).
     * - يُحدَّث Service Worker لإشعارات الخلفية (khabeer-set-lang من الصفحة بعد التحميل).
     */
    const toggleLanguage = () => {
        const next = language === 'ar' ? 'en' : 'ar';
        localStorage.setItem('language', next);
        window.location.reload();
    };

    const changeLanguage = (lang) => {
        if (lang === 'ar' || lang === 'en') {
            if (lang === language) return;
            localStorage.setItem('language', lang);
            window.location.reload();
        }
    };

    const t = (key, vars) => {
        const keys = key.split('.');
        let value = translations[language];

        for (const k of keys) {
            value = value?.[k];
        }

        let result = typeof value === 'string' ? value : key;
        if (vars && typeof result === 'string') {
            Object.entries(vars).forEach(([k, v]) => {
                result = result.split(`{${k}}`).join(String(v));
            });
        }
        return result;
    };

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, changeLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);
