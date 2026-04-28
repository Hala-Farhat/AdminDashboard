import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatImageUrl } from '../api/urlHelpers';

/**
 * أول حرف من الاسم (يدعم العربية والإنجليزية) — بدون صور وهمية من التطبيق.
 * @param {string} [name]
 */
export function getNameInitial(name) {
    const s = String(name || '').trim();
    if (!s) return '?';
    try {
        const m = s.match(/\p{L}|\p{N}/u);
        if (m) return m[0].toLocaleUpperCase();
    } catch {
        /* regex غير مدعوم */
    }
    const first = [...s][0];
    return first ? first.toLocaleUpperCase() : '?';
}

/**
 * صورة من الرابط أو حرف أول من الاسم — لا تستخدم صورًا افتراضية من الأصول.
 * ضع المكوّن داخل حاوية بأبعاد ثابتة (مثلاً size-10 rounded-full).
 */
export default function AvatarOrInitial({ name, avatarUrl, className, imgClassName }) {
    const url = formatImageUrl(avatarUrl);
    const [imgFailed, setImgFailed] = useState(false);

    useEffect(() => {
        setImgFailed(false);
    }, [url]);

    const initial = (
        <span
            className={clsx(
                'flex size-full items-center justify-center font-bold text-khabeer-brand dark:text-khabeer-brand/90',
                className
            )}
            aria-hidden
        >
            {getNameInitial(name)}
        </span>
    );

    if (!url || imgFailed) {
        return initial;
    }

    return (
        <img
            src={url}
            alt=""
            onError={() => setImgFailed(true)}
            className={clsx('size-full object-cover', imgClassName, className)}
        />
    );
}
