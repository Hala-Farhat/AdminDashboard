import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
    fetchNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    normalizeNotificationRow,
} from '../api/notificationsApi';
import {
    extractAdminPayload,
    formatAdminNotificationLines,
    getAdminNotificationTargetPath,
    isSupportTicketNotification,
} from '../utils/adminNotifications';
import { initAdminWebPush } from '../adminWebPush';
import { getApiErrorMessage } from '../utils/providerUserManagement';
import { appLanguageToIntlLocale, formatIsoLocalDateTime, formatRelativeTimeFromIso } from '../utils/relativeTime';

const NOTIFICATIONS_PAGE_SIZE = 10;

/** يحدد إن وُجدت صفحات لاحقة من استجابة السيرفر أو بطول الدفعة */
function hasMoreFromResponse(res, batchLen) {
    const tp = res?.totalPages;
    const p = res?.page;
    if (typeof tp === 'number' && typeof p === 'number' && !Number.isNaN(tp) && !Number.isNaN(p)) {
        return p < tp;
    }
    return batchLen >= NOTIFICATIONS_PAGE_SIZE;
}

/** موضع القائمة تحت زر الجرس — fixed + portal يتجنّب القصّ من overflow الأب */
function computePanelPosition(rect, isRTL) {
    const pad = 12;
    const gap = 8;
    const width = Math.min(380, window.innerWidth - 2 * pad);
    const top = rect.bottom + gap;
    let left;
    if (isRTL) {
        left = rect.left;
        if (left + width > window.innerWidth - pad) left = window.innerWidth - pad - width;
        if (left < pad) left = pad;
    } else {
        left = rect.right - width;
        if (left < pad) left = pad;
        if (left + width > window.innerWidth - pad) left = window.innerWidth - pad - width;
    }
    const maxHeight = Math.max(160, Math.min(360, window.innerHeight - top - pad));
    return { top, left, width, maxHeight };
}

const AdminNotificationsBell = () => {
    const { token, authUid } = useAuth();
    const { language, t } = useLanguage();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [error, setError] = useState(null);
    const [errorDetail, setErrorDetail] = useState('');
    const [markingAll, setMarkingAll] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    /** إن أعادها GET الصفحة 1 — للعداد الشامل غير المقروء */
    const [serverUnreadCount, setServerUnreadCount] = useState(null);
    const anchorRef = useRef(null);
    const panelRef = useRef(null);
    const tokenRef = useRef(token);
    tokenRef.current = token;
    const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 380, maxHeight: 360 });
    /** يحدّث عرض «منذ X» كل 30ث عند فتح القائمة */
    const [relativeTimeTick, setRelativeTimeTick] = useState(0);

    const notificationDateLocale = useMemo(() => appLanguageToIntlLocale(language), [language]);

    useEffect(() => {
        if (!open) return undefined;
        const id = window.setInterval(() => setRelativeTimeTick((t) => t + 1), 30000);
        return () => window.clearInterval(id);
    }, [open]);

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        setErrorDetail('');
        try {
            const res = await fetchNotifications(token, { page: 1, limit: NOTIFICATIONS_PAGE_SIZE });
            const batch = res.items || [];
            setItems(batch);
            setPage(1);
            setHasMore(hasMoreFromResponse(res, batch.length));
            setServerUnreadCount(typeof res.unreadCount === 'number' ? res.unreadCount : null);
            if (import.meta.env.DEV) {
                console.log('[notifications] GET /notifications page=1', {
                    count: batch.length,
                    hasMore: hasMoreFromResponse(res, batch.length),
                });
            }
        } catch (e) {
            const apiMsg = getApiErrorMessage(e);
            const status = e?.response?.status;
            const code = status ? `HTTP ${status}` : '';
            const combined = [apiMsg, code].filter(Boolean).join(' · ');
            setError('load');
            setErrorDetail(combined || (typeof e?.message === 'string' ? e.message : ''));
            setItems([]);
            setHasMore(false);
            setServerUnreadCount(null);
        } finally {
            setLoading(false);
        }
    }, [token]);

    const loadMore = useCallback(async () => {
        if (!token || loading || loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const nextPage = page + 1;
            const res = await fetchNotifications(token, { page: nextPage, limit: NOTIFICATIONS_PAGE_SIZE });
            const newItems = res.items || [];
            setItems((prev) => {
                const seen = new Set(
                    prev.map((r) => normalizeNotificationRow(r).id).filter(Boolean)
                );
                const merged = [...prev];
                for (const row of newItems) {
                    const nid = normalizeNotificationRow(row).id;
                    if (nid && seen.has(nid)) continue;
                    if (nid) seen.add(nid);
                    merged.push(row);
                }
                return merged;
            });
            setPage(nextPage);
            setHasMore(hasMoreFromResponse(res, newItems.length));
        } catch (e) {
            if (import.meta.env.DEV) {
                console.warn('[notifications] load more failed', e);
            }
        } finally {
            setLoadingMore(false);
        }
    }, [token, page, loading, loadingMore, hasMore]);

    const onListScroll = useCallback(
        (e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight > 72) return;
            loadMore();
        },
        [loadMore]
    );

    useEffect(() => {
        if (!token) return;
        load();
        /** تحديث دوري — الإشعارات لا تصل بوقت حقيقي من الويب بدون WebSocket؛ نُقصّ الفترة لتقريب التجربة من «فوري». */
        const id = window.setInterval(load, 30000);
        return () => window.clearInterval(id);
    }, [token, load]);

    /** FCM: POST /users/me/fcm بعد كل تسجيل دخول (authUid)؛ لا يُعاد عند تجديد JWT فقط */
    useEffect(() => {
        if (!authUid) return undefined;
        const bearer = tokenRef.current;
        if (!bearer) return undefined;
        let unsub;
        let cancelled = false;
        (async () => {
            const u = await initAdminWebPush(bearer);
            if (!cancelled) unsub = u;
        })();
        return () => {
            cancelled = true;
            if (typeof unsub === 'function') unsub();
        };
    }, [authUid]);

    useEffect(() => {
        const onRefresh = () => load();
        window.addEventListener('admin-notifications-refresh', onRefresh);
        return () => window.removeEventListener('admin-notifications-refresh', onRefresh);
    }, [load]);

    /** تحديث فوري للعداد بعد تعليم إشعار من Push (قبل اكتمال إعادة التحميل) */
    useEffect(() => {
        const onMarked = (e) => {
            const id = e?.detail?.id;
            if (!id) return;
            setServerUnreadCount((c) => (typeof c === 'number' ? Math.max(0, c - 1) : c));
            setItems((prev) =>
                prev.map((x) => {
                    const nx = normalizeNotificationRow(x);
                    return nx.id === id ? { ...x, read: true, isRead: true } : x;
                })
            );
        };
        window.addEventListener('admin-notification-mark-read', onMarked);
        return () => window.removeEventListener('admin-notification-mark-read', onMarked);
    }, []);

    useEffect(() => {
        let t;
        const schedule = () => {
            window.clearTimeout(t);
            t = window.setTimeout(() => load(), 400);
        };
        const onVis = () => {
            if (document.visibilityState === 'visible') schedule();
        };
        window.addEventListener('focus', schedule);
        document.addEventListener('visibilitychange', onVis);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener('focus', schedule);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [load]);

    useEffect(() => {
        if (!open) return;
        load();
    }, [open, load]);

    const isRTL = language === 'ar';

    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const el = anchorRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setPanelPos(computePanelPosition(rect, isRTL));
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [open, isRTL]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (anchorRef.current?.contains(e.target)) return;
            if (panelRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown, true);
        return () => document.removeEventListener('mousedown', onDown, true);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const onMarkAllRead = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!token || unreadCount === 0 || markingAll) return;
        setMarkingAll(true);
        let ok = false;
        try {
            await markAllNotificationsRead(token);
            ok = true;
        } catch {
            try {
                const unreadIds = items
                    .map((r) => normalizeNotificationRow(r))
                    .filter((n) => n.id && !n.read && !n.isRead && !n.readAt)
                    .map((n) => n.id);
                if (unreadIds.length) {
                    await Promise.all(unreadIds.map((id) => markNotificationRead(token, id)));
                    ok = true;
                }
            } catch {
                if (import.meta.env.DEV) {
                    console.warn('[notifications] mark all read failed');
                }
            }
        }
        if (ok) {
            setServerUnreadCount(0);
            setItems((prev) =>
                prev.map((x) => ({
                    ...x,
                    read: true,
                    isRead: true,
                }))
            );
        }
        setMarkingAll(false);
    };

    const onPick = async (row) => {
        const normalized = normalizeNotificationRow(row);
        const payload = extractAdminPayload(normalized);
        const path = getAdminNotificationTargetPath(payload);
        if (normalized.id) {
            try {
                await markNotificationRead(token, normalized.id);
            } catch {
                /* ignore */
            }
            setServerUnreadCount((c) => (typeof c === 'number' ? Math.max(0, c - 1) : c));
            setItems((prev) =>
                prev.map((x) => {
                    const nx = normalizeNotificationRow(x);
                    return nx.id === normalized.id ? { ...x, read: true, isRead: true } : x;
                })
            );
        }
        setOpen(false);
        if (isSupportTicketNotification(payload)) {
            return;
        }
        navigate(path);
    };

    /** غير مقروء: العدّاد من السيرفر عند التحميل الأول، وإلا من العناصر المحمّلة */
    const localUnreadCount = useMemo(
        () =>
            items.filter((r) => {
                const n = normalizeNotificationRow(r);
                return !n.read && !n.isRead && !n.readAt;
            }).length,
        [items]
    );
    const unreadCount =
        typeof serverUnreadCount === 'number' ? serverUnreadCount : localUnreadCount;

    const badge = unreadCount > 99 ? '99+' : String(unreadCount || 0);

    const dropdown =
        open &&
        createPortal(
            <div
                ref={panelRef}
                role="dialog"
                aria-label={t('notifications.title')}
                style={{
                    position: 'fixed',
                    top: panelPos.top,
                    left: panelPos.left,
                    width: panelPos.width,
                    maxHeight: panelPos.maxHeight,
                    zIndex: 300,
                }}
                className={clsx(
                    'flex max-h-[min(360px,calc(100vh-24px))] flex-col overflow-hidden rounded-2xl border border-khabeer-stroke bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:border-dark-border dark:bg-dark-bg-elevated dark:shadow-black/40'
                )}
                dir={isRTL ? 'rtl' : 'ltr'}
            >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-khabeer-stroke px-4 py-3 dark:border-dark-border">
                    <p className="text-sm font-bold text-[#151B30] dark:text-dark-text-primary">
                        {t('notifications.title')}
                    </p>
                    {items.length > 0 && unreadCount > 0 ? (
                        <button
                            type="button"
                            onClick={onMarkAllRead}
                            disabled={markingAll}
                            className="shrink-0 text-xs font-semibold text-khabeer-brand transition-colors hover:underline disabled:opacity-50 dark:text-sky-400"
                        >
                            {markingAll ? t('notifications.markingAll') : t('notifications.markAllRead')}
                        </button>
                    ) : null}
                </div>
                <div
                    onScroll={onListScroll}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                    data-relative-tick={relativeTimeTick}
                >
                    {loading && items.length === 0 && (
                        <div className="flex items-center justify-center gap-2 py-10 text-khabeer-muted">
                            <Loader2 className="size-5 animate-spin" />
                            <span className="text-sm">{t('notifications.loading')}</span>
                        </div>
                    )}
                    {error && !loading && items.length === 0 && (
                        <div className="px-4 py-6 text-center">
                            <p className="text-sm font-medium text-red-600 dark:text-red-400">
                                {t('notifications.loadError')}
                            </p>
                            {errorDetail ? (
                                <p className="mt-2 break-words text-xs text-khabeer-muted">{errorDetail}</p>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => load()}
                                className="mt-4 rounded-full border border-khabeer-brand px-4 py-2 text-sm font-semibold text-khabeer-brand transition-colors hover:bg-[#f0f7ff] dark:border-sky-500 dark:text-sky-400 dark:hover:bg-white/5"
                            >
                                {t('notifications.retry')}
                            </button>
                        </div>
                    )}
                    {!loading && !error && items.length === 0 && (
                        <div className="px-4 py-8 text-center">
                            <p className="text-sm font-medium text-[#333] dark:text-dark-text-primary">
                                {t('notifications.empty')}
                            </p>
                            <p className="mt-1 text-xs text-khabeer-muted">{t('notifications.emptyHint')}</p>
                        </div>
                    )}
                    {items.map((row) => {
                        const normalized = normalizeNotificationRow(row);
                        const payload = extractAdminPayload(normalized);
                        const { title, body } = formatAdminNotificationLines(
                            payload,
                            {
                                title: normalized.title || normalized.subject,
                                body: normalized.body || normalized.message || normalized.content,
                            },
                            t
                        );
                        const unread = !normalized.read && !normalized.isRead && !normalized.readAt;
                        const isSupport = isSupportTicketNotification(payload);
                        const whenRelative = formatRelativeTimeFromIso(normalized.createdAt, {
                            locale: notificationDateLocale,
                            useShortJustNow: true,
                        });
                        const whenAbsolute = formatIsoLocalDateTime(
                            normalized.createdAt,
                            notificationDateLocale
                        );
                        return (
                            <button
                                key={normalized.id || JSON.stringify(row)}
                                type="button"
                                onClick={() => onPick(row)}
                                className={clsx(
                                    'flex w-full flex-col gap-0.5 border-b border-khabeer-stroke px-4 py-3 text-start transition-colors last:border-b-0 hover:bg-gray-50 dark:border-dark-border dark:hover:bg-white/5',
                                    unread && 'bg-[#f0f7ff]/80 dark:bg-sky-950/20',
                                    isSupport && 'cursor-default'
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm font-semibold text-[#151B30] dark:text-dark-text-primary">
                                        {title}
                                    </span>
                                    {whenRelative && (
                                        <span
                                            className="shrink-0 text-[11px] text-khabeer-muted [unicode-bidi:isolate]"
                                            dir={language === 'ar' ? 'rtl' : 'ltr'}
                                            title={whenAbsolute || undefined}
                                        >
                                            {whenRelative}
                                        </span>
                                    )}
                                </div>
                                {body ? (
                                    <span className="line-clamp-2 text-xs text-[#555] dark:text-dark-text-secondary">
                                        {body}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                    {loadingMore && items.length > 0 && (
                        <div className="flex items-center justify-center gap-2 border-t border-khabeer-stroke py-3 text-khabeer-muted dark:border-dark-border">
                            <Loader2 className="size-4 animate-spin" />
                            <span className="text-xs">{t('notifications.loadingMore')}</span>
                        </div>
                    )}
                </div>
            </div>,
            document.body
        );

    return (
        <div className="relative z-[220] shrink-0">
            <button
                ref={anchorRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-[#333] bg-white text-khabeer-muted transition-colors hover:bg-gray-50 dark:border-dark-border dark:bg-dark-bg-secondary dark:hover:bg-dark-bg-tertiary"
                aria-label={t('notifications.title')}
                aria-expanded={open}
                aria-haspopup="dialog"
            >
                <Bell className="size-6" strokeWidth={1.25} />
                {unreadCount > 0 && (
                    <span className="absolute end-[-2px] top-[-4px] flex min-w-[1rem] px-0.5 h-4 items-center justify-center rounded-full bg-[#ef4444] text-[10px] font-medium leading-none text-white">
                        {badge}
                    </span>
                )}
            </button>
            {dropdown}
        </div>
    );
};

export default AdminNotificationsBell;
