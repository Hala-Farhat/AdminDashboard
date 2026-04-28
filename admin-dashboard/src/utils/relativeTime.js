/**
 * تنسيق وقت نسبي من سلسلة ISO 8601 باستخدام Intl فقط (بدون اعتماديات).
 * new Date(iso) يحوّل UTC إلى لحظة مطلقة؛ المقارنة مع Date.now() تعطي فرقاً صحيحاً بالتوقيت المحلي للجهاز.
 *
 * @typedef {object} FormatRelativeTimeOptions
 * @property {string} [locale] — BCP-47 (مثل ar، en-GB، أو navigator.language). الافتراضي: لغة المتصفح أو en.
 * @property {Date} [now] — مرجع «الآن» (للاختبار).
 * @property {boolean} [useShortJustNow=true] — إن كانت الفرق أقل من 60ث: «الآن» / «Just now» بدل «59 seconds ago».
 */

const DEFAULT_LOCALE =
    typeof navigator !== 'undefined' && navigator.language && String(navigator.language).trim()
        ? navigator.language
        : 'en';

/** يطابق لغة لوحة الأدمن مع سلوك الواجهة الحالي */
export function appLanguageToIntlLocale(appLanguage) {
    return appLanguage === 'ar' ? 'ar' : 'en';
}

/**
 * عرض تاريخ/وقت مطلق بتوقيت الجهاز المحلي (Browser Timezone).
 * @param {string} isoString - السلسلة النصية القادمة من API (مثل 2026-04-18T08:23:28.846Z)
 * @param {string} localeTag - رمز اللغة (ar-EG أو en-GB)
 * @param {Intl.DateTimeFormatOptions} [additionalOpts] - خيارات إضافية للتنسيق
 */
export function formatIsoLocalDateTime(isoString, localeTag, additionalOpts = {}) {
    if (!isoString) return '';
    
    let normalized = String(isoString);
    let d;

    if (typeof isoString === 'number') {
        d = new Date(isoString > 1e11 ? isoString : isoString * 1000);
        normalized = `Timestamp(${isoString})`;
    } else if (typeof isoString === 'string') {
        normalized = isoString.trim().replace(' ', 'T');
        if (!normalized.endsWith('Z') && !/[-+]\d{2}(:?\d{2})?$/.test(normalized)) {
            normalized = `${normalized}Z`;
        }
        d = new Date(normalized);
    } else {
        d = new Date(isoString);
    }


    if (Number.isNaN(d.getTime())) return typeof isoString === 'string' ? isoString : '';
    
    // الإعدادات الافتراضية: تاريخ متوسط ووقت قصير
    const opts = { 
        dateStyle: 'medium', 
        timeStyle: 'short',
        ...additionalOpts 
    };

    try {
        return new Intl.DateTimeFormat(localeTag, opts).format(d);
    } catch {
        try {
            return d.toLocaleString(localeTag, opts);
        } catch {
            return d.toString();
        }
    }
}

/**
 * @param {string} isoString
 * @param {FormatRelativeTimeOptions} [options]
 * @returns {string}
 */
export function formatRelativeTimeFromIso(isoString, options = {}) {
    const { locale = DEFAULT_LOCALE, now: manualNow, useShortJustNow = true } = options;

    if (!isoString) return '';
    
    let date;
    if (typeof isoString === 'number') {
        date = new Date(isoString > 1e11 ? isoString : isoString * 1000);
    } else if (typeof isoString === 'string') {
        let normalized = isoString.trim().replace(' ', 'T');
        if (!normalized.endsWith('Z') && !/[-+]\d{2}(:?\d{2})?$/.test(normalized)) {
            normalized = `${normalized}Z`;
        }
        date = new Date(normalized);
    } else {
        date = new Date(isoString);
    }

    if (Number.isNaN(date.getTime())) return '';

    const clientNow = manualNow || new Date();
    const rawDiffMs = clientNow.getTime() - date.getTime();
    const diffSec = Math.round(rawDiffMs / 1000);
    const finalDiffSec = diffSec < 0 ? 0 : diffSec;

    if (useShortJustNow && finalDiffSec < 60) {
        try {
            return String(locale).toLowerCase().startsWith('ar') ? 'الآن' : 'Just now';
        } catch {
            return 'Just now';
        }
    }

    return formatRelativeSecondsAgo(finalDiffSec, locale);
}

/**
 * diffSec موجب = التاريخ في الماضي (منذ).
 * @param {number} diffSec
 * @param {string} locale
 */
function formatRelativeSecondsAgo(diffSec, locale) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    const units = [
        { unit: 'year', seconds: 31536000 },
        { unit: 'month', seconds: 2592000 },
        { unit: 'week', seconds: 604800 },
        { unit: 'day', seconds: 86400 },
        { unit: 'hour', seconds: 3600 },
        { unit: 'minute', seconds: 60 },
        { unit: 'second', seconds: 1 },
    ];

    for (const { unit, seconds } of units) {
        if (Math.abs(diffSec) >= seconds || unit === 'second') {
            const count = Math.trunc(diffSec / seconds);
            return rtf.format(-count, unit);
        }
    }
    return '';
}
