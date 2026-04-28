import { useCallback, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { appLanguageToIntlLocale, formatRelativeTimeFromIso } from '../utils/relativeTime';

/**
 * يرجع دالة تنسيق وقت نسبي تستخدم لغة التطبيق (عربي/إنجليزي) مثل باقي لوحة الأدمن.
 * للاستخدام مع لغة المتصفح مباشرة استخدم formatRelativeTimeFromIso بدون هذا الـ hook.
 */
export function useFormatRelativeTime() {
    const { language } = useLanguage();
    const locale = useMemo(() => appLanguageToIntlLocale(language), [language]);

    return useCallback(
        (isoString, overrides = {}) =>
            formatRelativeTimeFromIso(isoString, {
                locale,
                ...overrides,
            }),
        [locale]
    );
}
