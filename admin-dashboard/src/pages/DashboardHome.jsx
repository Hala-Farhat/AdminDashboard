import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getIdToken } from 'firebase/auth';
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    ExternalLink,
    Loader2,
    Star,
    TrendingDown,
    TrendingUp
} from 'lucide-react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
    fetchDashboardFeaturedExperts,
    fetchDashboardGlobalSearch,
    fetchDashboardJoinRequests,
    fetchDashboardMapPoints,
    fetchDashboardNewUsers,
    fetchDashboardOrdersSummary,
    fetchDashboardRecentOrders,
    fetchDashboardRecentReviews,
    fetchDashboardSummary,
    fetchDashboardTopServices,
    parseDashboardGlobalSearchSections,
    unwrapDashboardEnvelope
} from '../api/dashboardApi';
import AvatarOrInitial from '../components/AvatarOrInitial';
import { auth } from '../firebase';
import { getHttpErrorMessage } from '../utils/httpErrorMessage';
/* Figma KPI row — محلي من src/assets/images/home */
import IMG_COVERAGE from '../assets/images/home/Capa 2.svg';
import IMG_SERVICES from '../assets/images/home/78cdfc119f1a145e1f8898586f83cd981877c51f.png';
import IMG_EXPERT from '../assets/images/home/2a83bfe728ef25ef9d9db15c12ecd8d404c440cf.png';
import IMG_CLIENT from '../assets/images/home/22348d698aa293f664b2c638e311b947195faabe.png';
import iconHomeCalendar from '../assets/images/home/Icon (1).svg';
import iconHomeChevron from '../assets/images/home/Icon (2).svg';
import iconHomeClock from '../assets/images/home/Clock Circle.svg';
import iconGoogle from '../assets/images/home/Google.svg';
import iconApple from '../assets/images/home/apple.svg';
import iconEyeHome from '../assets/images/home/Eye.svg';

/** فترة افتراضية للأقسام التي تدعم الفلتر الزمني */
const DASHBOARD_SUMMARY_PERIOD = 'month';

const DASHBOARD_PERIOD_OPTIONS = /** @type {const} */ (['day', 'week', 'month', 'year']);

async function resolveDashboardToken(contextToken) {
    if (auth?.currentUser) {
        try {
            return await getIdToken(auth.currentUser, true);
        } catch {
            return contextToken;
        }
    }
    return contextToken;
}
function RecentServiceStatusBadge({ variant, t, dir: textDir, labelOverride }) {
    const map = {
        awaiting: {
            pill: 'bg-[#0077b6] text-white dark:bg-khabeer-brand dark:text-white',
            labelKey: 'recentFilterAwaitingChip'
        },
        completed: {
            pill: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
            labelKey: 'tableStatusCompleted'
        },
        cancelled: {
            pill: 'bg-orange-500 text-white dark:bg-orange-600 dark:text-white',
            labelKey: 'recentFilterCancelled'
        },
        in_progress: {
            pill: 'bg-amber-500 text-white dark:bg-amber-600 dark:text-white',
            labelKey: 'tableStatusInProgress'
        },
        pending_completion: {
            pill: 'bg-sky-600 text-white dark:bg-sky-600 dark:text-white',
            labelKey: 'tableStatusPendingCompletion'
        },
        rejected: {
            pill: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-white',
            labelKey: 'recentFilterRejected'
        }
    };
    const cfg = map[variant];
    if (!cfg) return null;
    const label = labelOverride?.trim() ? labelOverride : t(`dashboard.home.${cfg.labelKey}`);
    return (
        <span
            dir={textDir}
            className={clsx(
                'inline-flex max-w-full items-center justify-center whitespace-normal break-words rounded-2xl px-2 py-1 text-center text-xs font-medium leading-snug sm:text-sm',
                cfg.pill
            )}
        >
            {label}
        </span>
    );
}

function tf(template, n) {
    return template.replace('{n}', String(n));
}

function uiBucketToStatusVariant(uiBucket) {
    const m = {
        awaitingExpert: 'awaiting',
        inProgress: 'in_progress',
        pendingCompletion: 'pending_completion',
        cancelled: 'cancelled',
        completed: 'completed',
        expertRejected: 'rejected',
        rejected: 'rejected',
        awaiting: 'awaiting',
        in_progress: 'in_progress',
        pending_completion: 'pending_completion',
    };
    return m[uiBucket] || 'awaiting';
}

/** فلترة محلية للخدمات الأخيرة عند غياب uiBucket من العنصر */
function recentOrderUiBucketFromItem(o) {
    if (o?.uiBucket) return o.uiBucket;
    const s = String(o?.status || '').toUpperCase().replace(/-/g, '_');
    if (s === 'COMPLETED') return 'completed';
    if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
    if (s === 'PENDING_COMPLETION' || s.includes('PENDING_COMPLETION')) return 'pendingCompletion';
    if (s === 'IN_PROGRESS' || s.includes('PROGRESS')) return 'inProgress';
    if (s.includes('REJECT') || s === 'EXPERT_REJECTED') return 'expertRejected';
    return 'awaitingExpert';
}

function daysAgoFromIso(iso) {
    if (!iso) return 0;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) return 0;
    return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}

function joinRequestReviewPath(row) {
    const providerId = row?.providerId || row?.expertId || row?.serviceProviderId;
    if (providerId) {
        const appId = row?.applicationId;
        const status = (() => {
            const raw = row?.status;
            if (!raw) return undefined;
            const u = String(raw).toUpperCase().replace(/-/g, '_');
            if (u === 'UNDER_REVIEW') return 'underReview';
            if (u === 'SUBMITTED') return 'submitted';
            if (u === 'DRAFT') return 'draft';
            if (u === 'APPROVED') return 'approved';
            if (u === 'REJECTED') return 'rejected';
            return undefined;
        })();
        const params = new URLSearchParams();
        if (appId) params.set('appId', appId);
        if (status) params.set('status', status);
        const qs = params.toString();
        return `/dashboard/provider/${encodeURIComponent(providerId)}${qs ? `?${qs}` : ''}`;
    }
    const u = String(row?.status || '').toUpperCase();
    if (u === 'UNDER_REVIEW') return '/dashboard/under-review';
    return '/dashboard/submitted?view=all';
}

function pickDashboardSearchPrimary(item) {
    if (!item || typeof item !== 'object') return '—';
    const v =
        item.orderNumber ??
        item.order_number ??
        item.title ??
        item.name ??
        item.nameAr ??
        item.nameEn ??
        item.fullName ??
        item.displayName ??
        item.label ??
        item.number ??
        item.email;
    return v != null && String(v).trim() !== '' ? String(v).trim() : '—';
}

function pickDashboardSearchSecondary(item) {
    if (!item || typeof item !== 'object') return '';
    const spec = item.specialization;
    const specLabel =
        spec && typeof spec === 'object'
            ? spec.label ?? spec.nameAr ?? spec.nameEn ?? spec.name
            : '';
    const statusTxt = item.statusLabel ?? item.status_label ?? item.status ?? '';
    const addr = item.serviceExecutionAddress ?? item.service_execution_address ?? '';
    const orderBits = [specLabel, statusTxt, addr].map((x) => (x != null ? String(x).trim() : '')).filter(Boolean);
    if (orderBits.length) return orderBits.join(' · ');
    const v =
        item.subtitle ??
        item.description ??
        item.email ??
        item.phone ??
        item.mobile ??
        item.orderNumber ??
        item.order_number;
    return v != null && String(v).trim() !== '' ? String(v).trim() : '';
}

function firstNonEmptyStr(...vals) {
    for (const v of vals) {
        if (v == null) continue;
        const s = String(v).trim();
        if (s !== '') return s;
    }
    return '';
}

/** مسار تفاصيل من مفتاح القسم + حقول العنصر (مرن مع أشكال الباكند) */
function getDashboardSearchItemTo(sectionKey, item) {
    if (!item || typeof item !== 'object') return null;
    const h = item.href || item.path || item.url;
    if (typeof h === 'string' && h.startsWith('/')) return h;
    const sk = String(sectionKey).toLowerCase();

    const orderId = firstNonEmptyStr(
        item.orderId,
        item.order_id,
        item.orderUID,
        item.orderUid,
        item.serviceOrderId,
        item.service_order_id
    );

    const isOrderLikeSection =
        sk.includes('servicerequest') ||
        sk.includes('serviceorder') ||
        sk.includes('order') ||
        sk.includes('booking');
    const isExpertSection =
        sk.includes('expert') ||
        sk.includes('provider') ||
        sk.includes('specialist') ||
        (sk.includes('join') && sk.includes('request'));
    const isCustomerSection =
        sk.includes('customer') ||
        sk.includes('seeker') ||
        (sk.includes('client') && !sk.includes('service')) ||
        sk === 'users';

    /** طلبات خدمة: يعتمد على orderId أو رقم الطلب في العنصر */
    if (orderId && (isOrderLikeSection || item.orderNumber != null)) {
        return `/dashboard/service-orders/${encodeURIComponent(orderId)}`;
    }

    /** خبراء / مزودو خدمة — الباكند غالباً يرسل id أو firebaseUid فقط */
    if (isExpertSection) {
        const pid = firstNonEmptyStr(
            item.providerId,
            item.provider_id,
            item.expertId,
            item.expert_id,
            item.serviceProviderId,
            item.service_provider_id,
            item.firebaseUid,
            item.manageProviderId,
            item.id,
            item._id
        );
        if (pid) return `/dashboard/provider/${encodeURIComponent(pid)}`;
    }

    /** عملاء / باحثون */
    if (isCustomerSection) {
        const cid = firstNonEmptyStr(
            item.seekerId,
            item.seeker_id,
            item.clientId,
            item.client_id,
            item.userId,
            item.user_id,
            item.customerId,
            item.customer_id,
            item.manageUserId,
            item.firebaseUid,
            item.id,
            item._id
        );
        if (cid) return `/dashboard/client/${encodeURIComponent(cid)}`;
    }

    if (sk === 'categories' || sk === 'subcategories') {
        return '/dashboard/categories';
    }

    /** احتياطي بدون مطابقة قسم واضحة */
    if (orderId) return `/dashboard/service-orders/${encodeURIComponent(orderId)}`;
    const fallbackProvider = firstNonEmptyStr(
        item.providerId,
        item.provider_id,
        item.expertId,
        item.firebaseUid,
        item.id
    );
    const fallbackClient = firstNonEmptyStr(
        item.seekerId,
        item.clientId,
        item.userId,
        item.customerId,
        item.firebaseUid,
        item.id
    );
    if (fallbackProvider && fallbackClient && fallbackProvider === fallbackClient) {
        if (isExpertSection) return `/dashboard/provider/${encodeURIComponent(fallbackProvider)}`;
        if (isCustomerSection) return `/dashboard/client/${encodeURIComponent(fallbackClient)}`;
        return null;
    }
    if (fallbackProvider && !fallbackClient) {
        return `/dashboard/provider/${encodeURIComponent(fallbackProvider)}`;
    }
    if (fallbackClient && !fallbackProvider) {
        return `/dashboard/client/${encodeURIComponent(fallbackClient)}`;
    }
    return null;
}

function dashboardSearchSectionTitle(t, sectionKey) {
    const path = `dashboard.home.searchSections.${sectionKey}`;
    const tr = t(path);
    if (tr !== path) return tr;
    return String(sectionKey)
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
}

/** فلتر زمني: يوم / أسبوع / شهر / سنة — يُمرَّر للـ API كـ ?period= */
function DashboardPeriodSelect({ className, period = 'month', onPeriodChange }) {
    const { t, language } = useLanguage();
    const isEn = language === 'en';
    const labelKey = {
        day: 'periodDay',
        week: 'periodWeek',
        month: 'periodMonth',
        year: 'periodYear'
    };
    return (
        <div
            dir={isEn ? 'ltr' : 'rtl'}
            className={clsx('relative isolate z-20 shrink-0', className)}
        >
            <select
                dir={isEn ? 'ltr' : 'rtl'}
                value={period}
                onChange={(e) => onPeriodChange?.(e.target.value)}
                aria-label={t('dashboard.home.periodFilterAria')}
                className={clsx(
                    'h-12 w-full min-w-[160px] cursor-pointer appearance-none rounded-2xl border border-khabeer-stroke bg-white py-2 text-sm text-[#333] outline-none dark:border-dark-border dark:bg-dark-bg-secondary dark:text-dark-text-primary',
                    'focus-visible:ring-2 focus-visible:ring-khabeer-brand/30 dark:focus-visible:ring-khabeer-brand/40',
                    isEn ? 'ps-10 pe-11 text-start' : 'ps-11 pe-10 text-end'
                )}
            >
                {DASHBOARD_PERIOD_OPTIONS.map((p) => (
                    <option key={p} value={p} dir={isEn ? 'ltr' : 'rtl'}>
                        {t(`dashboard.home.${labelKey[p]}`)}
                    </option>
                ))}
            </select>
            <img
                src={iconHomeCalendar}
                alt=""
                className={clsx(
                    'pointer-events-none absolute top-1/2 size-6 -translate-y-1/2',
                    isEn ? 'start-3' : 'end-3'
                )}
                draggable={false}
            />
            <img
                src={iconHomeChevron}
                alt=""
                className={clsx(
                    'pointer-events-none absolute top-1/2 size-6 -translate-y-1/2 opacity-70',
                    isEn ? 'end-3' : 'start-3'
                )}
                draggable={false}
            />
        </div>
    );
}

/** أخضر لتخصص الشبكات/الإنترنت (أول تخصص شبكات في القائمة) */
const TOP_SERVICE_COLOR_NETWORK = '#58ff7c';

const TOP_SERVICE_PALETTE_UNIQUE = [
    '#8675ff',
    '#fd7289',
    '#ff9a3e',
    '#0077b6',
    '#9b59b6',
    '#e74c3c',
    '#1abc9c',
    '#f39c12',
    '#34495e',
    '#16a085',
    '#8e44ad',
    '#2980b9',
    '#c0392b',
    '#d35400',
    '#7f8c8d',
    '#1a535c',
    '#ffb703',
    '#6c5ce7',
    '#00b894',
    '#e84393',
    '#fdcb6e',
    '#a29bfe',
    '#74b9ff',
    '#55efc4'
];

const TOP_SERVICE_NETWORK_FALLBACK_GREENS = ['#2ecc71', '#20bf6b', '#00d2a0', '#27ae60'];

function isTopServiceNetworkCategory(it) {
    const blob = [it.label, it.nameAr, it.nameEn]
        .filter((x) => typeof x === 'string' && x.trim())
        .join(' ')
        .toLowerCase();
    return (
        blob.includes('شبكات') ||
        blob.includes('إنترنت') ||
        blob.includes('network') ||
        blob.includes('internet') ||
        blob.includes('wi-fi') ||
        blob.includes('wifi')
    );
}

/**
 * لون فريد لكل `key` في نفس الاستجابة — بدون تكرار لون بين صفّين.
 * ترتيب المفاتيح أبجدياً يثبّت الألوان عند تغيّر ترتيب الـ API.
 */
function buildTopServiceItemsWithUniqueColors(topServices, language) {
    const raw = Array.isArray(topServices?.items) ? topServices.items : [];
    const used = new Set();
    let paletteIdx = 0;

    const rowMeta = raw.map((it, i) => {
        const rowKey = it.key != null && String(it.key).trim() ? String(it.key) : `top-svc-${i}`;
        return { it, i, rowKey };
    });

    const uniqueKeys = [...new Set(rowMeta.map((r) => r.rowKey))].sort();

    function pickColorForRepresentative(repIt, seq) {
        if (repIt && isTopServiceNetworkCategory(repIt)) {
            if (!used.has(TOP_SERVICE_COLOR_NETWORK)) {
                used.add(TOP_SERVICE_COLOR_NETWORK);
                return TOP_SERVICE_COLOR_NETWORK;
            }
            for (const c of TOP_SERVICE_NETWORK_FALLBACK_GREENS) {
                if (!used.has(c)) {
                    used.add(c);
                    return c;
                }
            }
        }
        while (paletteIdx < TOP_SERVICE_PALETTE_UNIQUE.length && used.has(TOP_SERVICE_PALETTE_UNIQUE[paletteIdx])) {
            paletteIdx += 1;
        }
        if (paletteIdx < TOP_SERVICE_PALETTE_UNIQUE.length) {
            const c = TOP_SERVICE_PALETTE_UNIQUE[paletteIdx];
            paletteIdx += 1;
            used.add(c);
            return c;
        }
        let hue = (seq * 47 + 23) % 360;
        let tries = 0;
        let c = `hsl(${hue}, 55%, 46%)`;
        while (used.has(c) && tries < 80) {
            tries += 1;
            hue = (hue + 17) % 360;
            c = `hsl(${hue}, 55%, 46%)`;
        }
        used.add(c);
        return c;
    }

    const keyToColor = new Map();
    uniqueKeys.forEach((key, seq) => {
        const rep = rowMeta.find((r) => r.rowKey === key)?.it;
        keyToColor.set(key, pickColorForRepresentative(rep, seq));
    });

    return rowMeta.map(({ it, i, rowKey }) => {
        const p = Number(it.percent);
        const pctNum = Number.isFinite(p) ? p : 0;
        const labelFromApi =
            language === 'ar'
                ? (typeof it.label === 'string' && it.label.trim()) || it.nameAr || it.nameEn || '—'
                : it.nameEn || it.nameAr || (typeof it.label === 'string' && it.label.trim()) || '—';
        return {
            rowKey,
            value: pctNum,
            pct: `${pctNum.toFixed(1)}%`,
            label: labelFromApi,
            color: keyToColor.get(rowKey) ?? TOP_SERVICE_PALETTE_UNIQUE[0]
        };
    });
}

function TopServicesDonutChart({ items }) {
    const total = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
    let acc = 0;
    const stops = [];
    for (const it of items) {
        const v = Number(it.value) || 0;
        if (v <= 0) continue;
        const portion = total > 0 ? (v / total) * 100 : 0;
        const start = acc;
        acc += portion;
        stops.push(`${it.color} ${start}% ${acc}%`);
    }
    const background =
        stops.length > 0
            ? `conic-gradient(from -90deg, ${stops.join(', ')})`
            : 'conic-gradient(from -90deg, #e8e8e8 0% 100%)';

    return (
        <div className="relative h-[200px] w-[201px] max-w-full shrink-0">
            <div
                className="size-full rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                style={{ background }}
                aria-hidden
            />
            <div className="absolute inset-[22%] rounded-full bg-white shadow-sm dark:bg-dark-bg-secondary" aria-hidden />
        </div>
    );
}

/** Figma 278:24739 — الخدمات الأكثر طلباً + طلبات الخدمات */
function HomeServiceAnalyticsSection({
    cardDir,
    topServices,
    ordersSummary,
    periodTopServices,
    onPeriodTopServicesChange,
    periodOrdersSummary,
    onPeriodOrdersSummaryChange,
    loadingTopServices = false,
    loadingOrdersSummary = false
}) {
    const { t, language } = useLanguage();

    /** أسماء ونسب من الـ API؛ ألوان فريدة بين الصفوف في نفس الاستجابة */
    const items = useMemo(
        () => buildTopServiceItemsWithUniqueColors(topServices, language),
        [topServices, language]
    );

    const buckets = ordersSummary?.byUiBucket;
    const rejectedCount = Number(
        buckets?.expertRejected ?? buckets?.expert_rejected ?? buckets?.rejected ?? 0
    );
    const orderRows = [
        { count: String(buckets?.awaitingExpert ?? 0), labelKey: 'orderAwaitingExpert', color: '#ffd700' },
        { count: String(buckets?.inProgress ?? 0), labelKey: 'orderInProgress', color: '#e17f00' },
        { count: String(buckets?.pendingCompletion ?? buckets?.pending_completion ?? 0), labelKey: 'orderPendingCompletion', color: '#0284c7' },
        { count: String(buckets?.completed ?? 0), labelKey: 'orderCompleted', color: '#0055cd' },
        { count: String(rejectedCount), labelKey: 'orderExpertRejected', color: '#e11d48' },
        { count: String(buckets?.cancelled ?? 0), labelKey: 'orderCanceled', color: '#f97316' }
    ];

    const totalOrderCount = orderRows.reduce((s, r) => s + Number(r.count || 0), 0);
    const totalBar = Math.max(1, totalOrderCount);
    const barSegments = orderRows.map((r) => ({
        color: r.color,
        /** نسبة حقيقية من الإجمالي — بدون حد أدنى وهمي (كان 0.08 فيُظهر ألواناً لعدد 0) */
        flex: totalOrderCount === 0 ? 0 : Number(r.count || 0) / totalBar
    }));

    const totalOrdersLabel =
        ordersSummary != null && ordersSummary.totalOrdersInPeriod != null ? String(ordersSummary.totalOrdersInPeriod) : '—';

    const reverseLgRow = language === 'en';

    return (
        <section
            dir="ltr"
            className={clsx('flex flex-col gap-6 lg:flex-row lg:items-stretch', reverseLgRow && 'lg:flex-row-reverse')}
        >
            <div className="flex min-h-[297px] flex-1 flex-col gap-4 rounded-[24px] bg-white p-4 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none">
                <div
                    dir={cardDir}
                    className="flex w-full items-center justify-between gap-6"
                >
                    <h2
                        dir={cardDir}
                        className={clsx(
                            'min-w-0 flex-1 text-2xl font-bold text-black/87 dark:text-dark-text-primary',
                            cardDir === 'rtl' ? 'text-end' : 'text-start'
                        )}
                    >
                        {t('dashboard.home.mostRequestedServices')}
                    </h2>
                    <DashboardPeriodSelect className="shrink-0" period={periodTopServices} onPeriodChange={onPeriodTopServicesChange} />
                </div>
                <div className="relative min-h-[217px] flex-1">
                    {loadingTopServices ? (
                        <div className="absolute inset-0 z-[5] flex items-center justify-center rounded-xl bg-white/85 backdrop-blur-[1px] dark:bg-dark-bg-secondary/90">
                            <Loader2 className="size-9 animate-spin text-khabeer-brand dark:text-dark-accent-blue" aria-hidden />
                        </div>
                    ) : null}
                    {items.length === 0 ? (
                        <p
                            dir={cardDir}
                            className="flex min-h-[200px] w-full items-center justify-center px-2 text-center text-sm text-[#999] dark:text-dark-text-muted"
                        >
                            {t('dashboard.home.noTopServicesData')}
                        </p>
                    ) : (
                        <div className="flex h-[217px] w-full min-h-0 flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex w-full min-w-0 flex-1 flex-col justify-center gap-4">
                                {items.map((row) => (
                                    <div key={row.rowKey} dir="ltr" className="flex w-full items-center gap-2">
                                        <span className="w-10 shrink-0 text-center text-sm font-medium text-[#999] dark:text-dark-text-muted">
                                            {row.pct}
                                        </span>
                                        <p
                                            dir={cardDir}
                                            className={clsx(
                                                'min-w-0 flex-1 text-base font-medium text-[#333] dark:text-dark-text-primary',
                                                cardDir === 'rtl' ? 'text-end' : 'text-start'
                                            )}
                                        >
                                            {row.label}
                                        </p>
                                        <div
                                            className={clsx(
                                                'size-5 shrink-0 rounded-[4px]',
                                                row.color === '#eff3fe' && 'ring-1 ring-khabeer-stroke dark:ring-dark-border'
                                            )}
                                            style={{ backgroundColor: row.color }}
                                            aria-hidden
                                        />
                                    </div>
                                ))}
                            </div>
                            <TopServicesDonutChart items={items} />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex min-h-[297px] flex-1 flex-col gap-10 rounded-[24px] bg-white p-4 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none">
                <div className="flex w-full flex-col gap-2">
                    <div
                        dir={cardDir}
                        className="flex w-full items-center justify-between gap-6"
                    >
                        <h2
                            dir={cardDir}
                            className={clsx(
                                'min-w-0 flex-1 text-2xl font-bold text-black/87 dark:text-dark-text-primary',
                                cardDir === 'rtl' ? 'text-end' : 'text-start'
                            )}
                        >
                            {t('dashboard.home.serviceRequestsCardTitle')}
                        </h2>
                        <DashboardPeriodSelect
                            className="shrink-0"
                            period={periodOrdersSummary}
                            onPeriodChange={onPeriodOrdersSummaryChange}
                        />
                    </div>
                </div>
                <div className="relative flex min-h-[140px] w-full flex-1 flex-col gap-4">
                    {loadingOrdersSummary ? (
                        <div className="absolute inset-0 z-[5] flex items-center justify-center rounded-xl bg-white/85 backdrop-blur-[1px] dark:bg-dark-bg-secondary/90">
                            <Loader2 className="size-9 animate-spin text-khabeer-brand dark:text-dark-accent-blue" aria-hidden />
                        </div>
                    ) : null}
                    <div className="flex w-full flex-wrap items-baseline justify-end gap-2">
                        <span className="text-sm font-medium text-black/60 dark:text-dark-text-muted">
                            {t('dashboard.home.totalServicesProvided')}
                        </span>
                        <span className="text-2xl font-bold text-black/87 dark:text-dark-text-primary">{totalOrdersLabel}</span>
                    </div>

                    <div className="flex h-4 w-full overflow-hidden rounded-[4px] bg-white dark:bg-dark-bg-tertiary">
                        {totalOrderCount === 0 ? (
                            <div className="h-full w-full bg-[#ececec] dark:bg-dark-bg-elevated" aria-hidden />
                        ) : (
                            barSegments.map((seg, i) => (
                                <div key={i} className="h-full min-w-0" style={{ backgroundColor: seg.color, flex: seg.flex }} />
                            ))
                        )}
                    </div>

                    <div className="grid w-full grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                        {orderRows.map((row) => (
                            <div key={row.labelKey} dir="ltr" className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-[#999] dark:text-dark-text-muted">{row.count}</span>
                                <div className="flex min-w-0 items-center gap-2">
                                    <p
                                        dir={cardDir}
                                        className={clsx(
                                            'min-w-0 text-base font-medium text-[#333] dark:text-dark-text-primary',
                                            cardDir === 'rtl' ? 'text-end' : 'text-start'
                                        )}
                                    >
                                        {t(`dashboard.home.${row.labelKey}`)}
                                    </p>
                                    <div className="size-5 shrink-0 rounded-[4px]" style={{ backgroundColor: row.color }} aria-hidden />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

/** Figma 278:24804 — بطاقة «أحدث تقييمات التطبيق» */
function AppReviewsCardFigma27824804({ cardDir, reviewItems = [] }) {
    const { t, language } = useLanguage();
    const [reviewStore, setReviewStore] = useState('apple');

    const displayReviews = reviewItems.slice(0, 5).map((r) => ({
        rating: r.rating ?? '—',
        body: r.comment || '—',
        name: r.reviewer?.displayName || '—',
        avatarUrl: r.reviewer?.avatarUrl,
        dateLabel: r.createdAt
            ? new Date(r.createdAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-GB', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
              })
            : ''
    }));

    /** رابط صفحة التطبيق على المتجر — يُضبط من .env؛ افتراضي صفحة المتجر العامة */
    const viewAllOnStoreUrl = useMemo(() => {
        const pick = (envVal, fallback) =>
            typeof envVal === 'string' && envVal.trim() ? envVal.trim() : fallback;
        if (reviewStore === 'google') {
            return pick(import.meta.env.VITE_APP_GOOGLE_PLAY_URL, 'https://play.google.com/store');
        }
        return pick(import.meta.env.VITE_APP_APP_STORE_URL, 'https://apps.apple.com/');
    }, [reviewStore]);

    return (
        <div
            dir="ltr"
            className="flex w-full shrink-0 flex-col gap-6 rounded-[24px] bg-white p-4 shadow-[0px_1px_3px_rgba(16,24,40,0.1),0px_1px_2px_rgba(16,24,40,0.06)] dark:bg-dark-bg-secondary dark:shadow-none lg:w-[362px]"
        >
            <p
                dir={cardDir}
                className={clsx(
                    'w-full text-2xl font-bold leading-none text-[#333] whitespace-nowrap dark:text-dark-text-primary',
                    cardDir === 'rtl' ? 'text-end' : 'text-start'
                )}
            >
                {t('dashboard.home.userReviewsTitle')}
            </p>

            {/* 337:26915 — gap 16px بين المقطع وقائمة المراجعات */}
            <div className="flex w-full flex-col gap-4">
                {/* 278:24810 segment */}
                <div className="flex w-full items-center justify-center gap-4 rounded-[32px] border border-solid border-[#e2e2e2] bg-white p-1 dark:border-dark-border dark:bg-dark-bg-secondary">
                    <button
                        type="button"
                        onClick={() => setReviewStore('google')}
                        className={clsx(
                            'flex min-h-0 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-xl p-2 text-base font-medium transition-colors',
                            reviewStore === 'google'
                                ? 'border border-[#e2e2e2] bg-white text-[#333] shadow-sm dark:border-dark-border dark:bg-dark-bg-elevated dark:text-dark-text-primary'
                                : 'border border-transparent bg-transparent text-[#333] dark:text-dark-text-primary'
                        )}
                    >
                        <span dir={cardDir} className={clsx('whitespace-nowrap', cardDir === 'rtl' ? 'text-end' : 'text-start')}>
                            {t('dashboard.home.reviewsSourceGoogle')}
                        </span>
                        <img src={iconGoogle} alt="" className="size-6 shrink-0" draggable={false} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setReviewStore('apple')}
                        className={clsx(
                            'flex min-h-0 min-w-0 flex-1 items-center justify-center gap-2 rounded-[32px] px-4 py-2 text-base transition-colors',
                            reviewStore === 'apple'
                                ? 'bg-[#333] font-normal text-white dark:bg-neutral-800'
                                : 'border border-transparent bg-transparent font-medium text-[#333] dark:text-dark-text-primary'
                        )}
                    >
                        <span dir={cardDir} className={clsx('whitespace-nowrap', cardDir === 'rtl' ? 'text-end' : 'text-start')}>
                            {t('dashboard.home.reviewsSourceApple')}
                        </span>
                        <img
                            src={iconApple}
                            alt=""
                            className={clsx('size-6 shrink-0', reviewStore === 'apple' ? 'brightness-0 invert' : '')}
                            draggable={false}
                        />
                    </button>
                </div>

                {/* 337:26914 — بطاقات المراجعة gap 16px */}
                <div className="flex w-full flex-col gap-4">
                    {displayReviews.length === 0 ? (
                        <p dir={cardDir} className="py-6 text-center text-sm text-[#999] dark:text-dark-text-muted">
                            {t('dashboard.home.noAppReviews')}
                        </p>
                    ) : null}
                    {displayReviews.map((rev, idx) => (
                        <div
                            key={idx}
                            className="flex w-full flex-col gap-2 rounded-xl border border-solid border-[#e2e2e2] bg-white p-2 dark:border-dark-border dark:bg-dark-bg-secondary"
                        >
                            <div className="flex w-full items-start justify-between gap-3">
                                <div className="flex shrink-0 items-center gap-1 text-[#333] dark:text-dark-text-primary">
                                    <p className="text-sm font-normal leading-none">{rev.rating}</p>
                                    <Star className="size-[18px] shrink-0 text-amber-400" fill="currentColor" strokeWidth={0} />
                                </div>
                                <div className="flex min-w-0 items-center gap-2">
                                    <div
                                        dir={cardDir}
                                        className={clsx(
                                            'flex min-w-0 flex-col gap-1 whitespace-nowrap',
                                            cardDir === 'rtl' ? 'items-end text-end' : 'items-start text-start'
                                        )}
                                    >
                                        <p className="text-sm font-medium leading-none text-[#333] dark:text-dark-text-primary md:text-base">
                                            {rev.name}
                                        </p>
                                        <p className="text-xs leading-none text-[#999] dark:text-dark-text-muted">{rev.dateLabel}</p>
                                    </div>
                                    <div className="relative size-10 shrink-0 overflow-hidden rounded-full border border-[#e2e2e2] bg-[#0077b6]/10 dark:border-dark-border">
                                        <AvatarOrInitial name={rev.name} avatarUrl={rev.avatarUrl} className="text-sm" />
                                    </div>
                                </div>
                            </div>
                            <p
                                dir={cardDir}
                                className={clsx(
                                    'w-full text-sm font-medium leading-normal text-[#333] dark:text-dark-text-primary',
                                    cardDir === 'rtl' ? 'text-end' : 'text-start'
                                )}
                            >
                                {rev.body}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* 337:26908 — فتح صفحة التطبيق على Google Play أو App Store (خارجي) */}
            <a
                href={viewAllOnStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-solid border-[#e2e2e2] bg-white px-4 text-base font-medium text-[#333] shadow-[0px_0px_4px_0px_rgba(255,255,255,0.4)] transition-colors hover:bg-gray-50 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary dark:hover:bg-dark-bg-elevated"
            >
                <Star className="size-6 shrink-0 text-amber-400" fill="currentColor" strokeWidth={0} />
                <span dir={cardDir} className="whitespace-nowrap">
                    {t('dashboard.home.viewAllStoreReviews')}
                </span>
                <ExternalLink className="size-6 shrink-0 opacity-70" strokeWidth={1.5} />
            </a>
        </div>
    );
}

/** Figma 278:24821 — «الخدمات الأخيرة»: آخر الطلبات من الـ API، تبويبات + فلترة محلية حسب uiBucket */
function RecentServicesCardFigma27824821({ cardDir, recentOrdersPayload }) {
    const { t, language } = useLanguage();
    const navigate = useNavigate();
    const [recentUiBucket, setRecentUiBucket] = useState('all');

    const counts = recentOrdersPayload?.countsByUiBucket || {};

    const totalRecentCount = useMemo(() => {
        if (counts.total != null && Number.isFinite(Number(counts.total))) return Number(counts.total);
        if (counts.all != null && Number.isFinite(Number(counts.all))) return Number(counts.all);
        const keys = [
            'awaitingExpert',
            'inProgress',
            'pendingCompletion',
            'cancelled',
            'completed',
            'expertRejected',
            'rejected',
        ];
        const sum = keys.reduce((acc, k) => acc + (Number(counts[k]) || 0), 0);
        return sum;
    }, [counts]);

    const tableRows = useMemo(() => {
        const items = recentOrdersPayload?.items;
        if (items?.length) {
            return items.map((o, idx) => ({
                key: o.orderId || o.orderNumber || `o-${idx}`,
                orderDisplay: o.orderNumber || o.orderId || '—',
                title: o.title || '—',
                uiBucket: recentOrderUiBucketFromItem(o),
                statusLabel: language === 'ar' ? o.statusLabelAr || '' : o.statusLabelEn || '',
                detailId: o.orderId || o.orderNumber || ''
            }));
        }
        return [];
    }, [recentOrdersPayload, language]);

    const filteredRows = useMemo(() => {
        if (recentUiBucket === 'all') return tableRows;
        if (recentUiBucket === 'expertRejected') {
            return tableRows.filter((r) => r.uiBucket === 'expertRejected' || r.uiBucket === 'rejected');
        }
        return tableRows.filter((r) => r.uiBucket === recentUiBucket);
    }, [tableRows, recentUiBucket]);

    const recentStatusChips = useMemo(() => {
        const chipDefs = [
            { id: 'all', bucket: 'all', labelKey: 'recentFilterAll' },
            { id: 'expertRejected', bucket: 'expertRejected', labelKey: 'recentFilterRejected' },
            { id: 'completed', bucket: 'completed', labelKey: 'recentFilterCompleted' },
            { id: 'cancelled', bucket: 'cancelled', labelKey: 'recentFilterCancelled' },
            { id: 'inProgress', bucket: 'inProgress', labelKey: 'recentFilterInProgressChip' },
            { id: 'pendingCompletion', bucket: 'pendingCompletion', labelKey: 'recentFilterPendingCompletionChip' },
            { id: 'awaitingExpert', bucket: 'awaitingExpert', labelKey: 'recentFilterAwaitingChip' }
        ];
        return chipDefs.map((c) => {
            let count = 0;
            if (c.bucket === 'all') {
                count = totalRecentCount > 0 ? totalRecentCount : tableRows.length;
            } else if (c.bucket === 'expertRejected') {
                count = Number(counts.expertRejected) || Number(counts.rejected) || 0;
            } else {
                count = Number(counts[c.bucket]) || 0;
            }
            return {
                id: c.id,
                bucket: c.bucket,
                labelKey: c.labelKey,
                count
            };
        });
    }, [counts, totalRecentCount, tableRows.length, recentOrdersPayload]);

    return (
        <div
            dir="ltr"
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 self-stretch rounded-[24px] bg-white p-4 shadow-[0px_1px_3px_rgba(16,24,40,0.1),0px_1px_2px_rgba(16,24,40,0.06)] dark:bg-dark-bg-secondary dark:shadow-none"
        >
            <div dir={cardDir} className="flex w-full items-center justify-between gap-3">
                <h2 className="min-h-[35px] min-w-0 flex-1 text-start text-2xl font-bold leading-none text-[#333] dark:text-dark-text-primary">
                    {t('dashboard.home.recentServicesTitle')}
                </h2>
                <Link
                    to="/dashboard/service-orders"
                    className="shrink-0 text-sm whitespace-nowrap text-[#999] hover:text-khabeer-brand dark:text-dark-text-muted dark:hover:text-dark-accent-blue"
                >
                    {t('dashboard.home.more')}
                </Link>
            </div>

            <div className="relative flex min-h-[200px] flex-1 flex-col gap-4">
            <div dir={cardDir} className="flex w-full flex-wrap items-center justify-start gap-2 pb-1">
                {recentStatusChips.map((c) => {
                    const active = recentUiBucket === c.bucket;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            dir={cardDir}
                            onClick={() => setRecentUiBucket(c.bucket)}
                            className={clsx(
                                'flex h-10 shrink-0 items-center gap-3.5 rounded-[52px] border border-[#e2e2e2] py-1 ps-1 pe-2 text-base font-medium transition-colors dark:border-dark-border',
                                active
                                    ? 'border-[#0077b6] bg-[#0077b6] text-white dark:border-khabeer-brand dark:bg-khabeer-brand'
                                    : 'bg-white text-[#666] hover:bg-gray-50 dark:bg-dark-bg-secondary dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary'
                            )}
                        >
                            <span
                                className={clsx(
                                    'flex size-8 shrink-0 items-center justify-center rounded-full text-base font-medium',
                                    active
                                        ? 'bg-white text-[#0077b6] dark:bg-white dark:text-khabeer-brand'
                                        : 'bg-[#f7f7f7] text-[#333] dark:bg-dark-bg-tertiary dark:text-dark-text-primary'
                                )}
                            >
                                {c.count}
                            </span>
                            <span dir={cardDir} className="whitespace-nowrap text-start">
                                {t(`dashboard.home.${c.labelKey}`)}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto rounded-lg shadow-[0px_1px_3px_rgba(16,24,40,0.1),0px_1px_2px_rgba(16,24,40,0.06)] dark:shadow-none">
                {tableRows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-[#999] dark:text-dark-text-muted">{t('dashboard.home.noRecentOrders')}</p>
                ) : filteredRows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-[#999] dark:text-dark-text-muted">{t('dashboard.home.noRecentOrders')}</p>
                ) : (
                    <table
                        dir={cardDir}
                        className="table-fixed w-full max-w-full border-collapse text-sm text-[#333] dark:text-dark-text-primary"
                    >
                        <colgroup>
                            <col className="min-w-[7.5rem] w-[18%]" />
                            <col className="w-[46%]" />
                            <col className="w-[24%]" />
                            <col className="w-[12%]" />
                        </colgroup>
                        <thead>
                            <tr className="bg-[#e7e7e7] dark:bg-dark-bg-tertiary">
                                <th
                                    dir={cardDir}
                                    className="h-11 min-w-0 px-1.5 align-middle text-xs font-bold text-[#333] sm:px-2 sm:text-sm dark:text-dark-text-primary"
                                >
                                    <div className="flex w-full items-center justify-center text-center">
                                        {t('dashboard.home.tableColSerialId')}
                                    </div>
                                </th>
                                <th
                                    dir={cardDir}
                                    className="h-11 min-w-0 px-1.5 align-middle text-xs font-bold text-[#333] sm:px-2 sm:text-sm dark:text-dark-text-primary"
                                >
                                    <div className="flex w-full items-center justify-center text-center">
                                        {t('dashboard.home.tableColServiceTitle')}
                                    </div>
                                </th>
                                <th
                                    dir={cardDir}
                                    className="h-11 min-w-0 px-1.5 align-middle text-xs font-bold text-[#333] sm:px-2 sm:text-sm dark:text-dark-text-primary"
                                >
                                    <div className="flex w-full items-center justify-center text-center">
                                        {t('dashboard.home.tableColStatus')}
                                    </div>
                                </th>
                                <th
                                    dir={cardDir}
                                    className="h-11 min-w-0 px-1 align-middle text-xs font-bold text-[#333] sm:px-2 sm:text-sm dark:text-dark-text-primary"
                                >
                                    <div className="flex w-full items-center justify-center text-center">
                                        {t('dashboard.home.tableColActions')}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((row, idx) => (
                                <tr
                                    key={row.key}
                                    className={
                                        idx % 2 === 0
                                            ? 'bg-white dark:bg-dark-bg-secondary'
                                            : 'bg-[#f7f7f7] dark:bg-dark-bg-tertiary/50'
                                    }
                                >
                                    <td className="min-h-[60px] min-w-0 px-1.5 align-middle text-center text-xs font-medium sm:px-2 sm:text-sm">
                                        <div className="flex justify-center">
                                            <span dir="ltr" className="break-words font-mono leading-snug">
                                                {row.orderDisplay}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="h-[60px] min-w-0 px-1.5 align-middle text-center text-xs font-medium sm:px-2 sm:text-sm">
                                        <span
                                            dir={cardDir}
                                            className="line-clamp-2 inline-block max-w-full break-words text-center"
                                            title={row.title}
                                        >
                                            {row.title}
                                        </span>
                                    </td>
                                    <td className="h-[60px] min-w-0 px-1.5 align-middle text-center sm:px-2">
                                        <div className="flex justify-center">
                                            <RecentServiceStatusBadge
                                                variant={uiBucketToStatusVariant(row.uiBucket)}
                                                t={t}
                                                dir={cardDir}
                                                labelOverride={row.statusLabel || undefined}
                                            />
                                        </div>
                                    </td>
                                    <td className="h-[60px] min-w-0 px-1 align-middle text-center sm:px-2">
                                        <div className="flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    navigate(
                                                        `/dashboard/service-orders/${encodeURIComponent(row.detailId)}`
                                                    )
                                                }
                                                className="inline-flex rounded-lg p-1.5 text-[#333] transition-colors hover:bg-black/[0.04] sm:p-2.5 dark:text-dark-text-secondary dark:hover:bg-dark-bg-elevated"
                                                aria-label={t('dashboard.home.tableViewOrder')}
                                            >
                                                <img src={iconEyeHome} alt="" className="size-4 sm:size-5" draggable={false} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            </div>
        </div>
    );
}

/** Figma 278:24802 + 278:24821 — صف الأعمدة LTR؛ بطاقة التقييمات + الخدمات الأخيرة */
function HomeReviewsAndServicesSection({ cardDir, recentOrdersPayload, recentReviews }) {
    const { language } = useLanguage();
    return (
        <section
            dir="ltr"
            className={clsx(
                'flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-6',
                language === 'en' && 'lg:flex-row-reverse'
            )}
        >
            <AppReviewsCardFigma27824804 cardDir={cardDir} reviewItems={recentReviews?.items || []} />
            <RecentServicesCardFigma27824821 cardDir={cardDir} recentOrdersPayload={recentOrdersPayload} />
        </section>
    );
}

function KpiCard({
    title,
    value,
    badge,
    badgeVariant,
    linkTo,
    linkLabel,
    illustrationSrc,
    illustrationClassName,
    illustrationImgClassName,
    contentDir = 'ltr'
}) {
    /* جغرافياً: left = يسار الشاشة مثل Figma (وليس start حتى لا ينعكس مع RTL) */
    return (
        <div
            dir="ltr"
            className="relative flex h-[120px] min-h-[120px] flex-1 basis-[min(100%,296px)] overflow-hidden rounded-[24px] bg-white px-3.5 py-2 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none"
        >
            <div
                dir={contentDir}
                className="relative z-[1] flex min-w-0 flex-1 flex-col gap-3 text-start pl-[clamp(88px,26%,152px)]"
            >
                <p className="w-full text-sm font-medium leading-normal text-[#333] dark:text-dark-text-primary">{title}</p>
                <div className="flex flex-wrap items-center justify-start gap-1">
                    {badge != null && (
                        <span
                            className={clsx(
                                'inline-flex items-center gap-1 rounded-2xl py-0.5 ps-2 pe-2 text-[10px] font-normal',
                                badgeVariant === 'success' && 'text-[#00b615]',
                                badgeVariant === 'danger' && 'text-[#ef4444]',
                                badgeVariant === 'brand' && 'text-khabeer-brand'
                            )}
                        >
                            {badge}
                            {badgeVariant === 'success' && <TrendingUp className="size-2.5 shrink-0" strokeWidth={2} />}
                            {badgeVariant === 'danger' && <TrendingDown className="size-2.5 shrink-0" strokeWidth={2} />}
                            {badgeVariant === 'brand' && <Clock className="size-2.5 shrink-0" strokeWidth={2} />}
                        </span>
                    )}
                    <span className="text-lg font-medium leading-normal text-[#333] dark:text-dark-text-primary">{value}</span>
                </div>
                <Link
                    to={linkTo}
                    className="block max-w-full truncate whitespace-nowrap text-sm font-normal leading-normal text-[#333] underline decoration-solid underline-offset-2 hover:text-khabeer-brand dark:text-dark-text-secondary dark:hover:text-dark-accent-blue"
                >
                    {linkLabel}
                </Link>
            </div>
            {illustrationSrc ? (
                <div
                    className={clsx(
                        'pointer-events-none absolute left-2 top-1/2 z-0 h-16 w-16 -translate-y-1/2 overflow-hidden sm:h-20 sm:w-20',
                        illustrationClassName
                    )}
                >
                    <img
                        src={illustrationSrc}
                        alt=""
                        className={clsx(
                            'block size-full max-w-none object-contain object-left object-bottom',
                            illustrationImgClassName
                        )}
                    />
                </div>
            ) : null}
        </div>
    );
}

function JoinRequestCard({ name, category, daysAgo, avatarUrl, reviewTo }) {
    const { t, language } = useLanguage();
    const cardDir = language === 'ar' ? 'rtl' : 'ltr';
    return (
        <div className="flex w-full flex-col gap-4 rounded-2xl bg-white dark:bg-dark-bg-secondary">
            {/* Figma I337:26835 — صف LTR: نص يسار، صورة يمين (فيزيائي) */}
            <div dir="ltr" className="flex w-full items-center gap-2">
                <div
                    dir={cardDir}
                    className={clsx(
                        'flex min-w-0 flex-1 flex-col gap-1',
                        cardDir === 'rtl' ? 'items-end text-end' : 'items-start text-start'
                    )}
                >
                    <p className="w-full text-base font-medium text-[#333] dark:text-dark-text-primary">{name}</p>
                    <div dir="ltr" className="flex w-full items-center justify-between gap-1">
                        <div className="flex shrink-0 items-center gap-1 text-sm text-[#999] dark:text-dark-text-muted">
                            <img src={iconHomeClock} alt="" className="size-4 shrink-0" draggable={false} />
                            <span className="whitespace-nowrap">{tf(t('dashboard.home.daysAgo'), daysAgo)}</span>
                        </div>
                        <p className="min-w-0 flex-1 text-end text-sm text-[#999] dark:text-dark-text-muted">{category}</p>
                    </div>
                </div>
                <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border-[0.5px] border-khabeer-stroke bg-[#0077b6]/10 dark:border-dark-border">
                    <AvatarOrInitial name={name} avatarUrl={avatarUrl} className="text-base" />
                </div>
            </div>
            <Link
                to={reviewTo}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-khabeer-stroke bg-white px-4 text-sm font-medium text-[#333] shadow-[0px_0px_4px_0px_rgba(255,255,255,0.4)] transition-colors hover:bg-gray-50 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary dark:hover:bg-dark-bg-elevated"
            >
                {t('dashboard.home.reviewExpertProfile')}
            </Link>
        </div>
    );
}

/** يطابق عقد GET /manage/dashboard/new-users: date و periodStart (ISO) */
function pickDateFromPoint(p) {
    if (!p || typeof p !== 'object') return null;
    const raw = p.date ?? p.periodStart ?? p.day ?? p.at ?? p.bucketStart;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function safeChartTimeZone(tz) {
    if (typeof tz !== 'string' || !tz.trim()) return undefined;
    const z = tz.trim();
    try {
        Intl.DateTimeFormat('en-US', { timeZone: z });
        return z;
    } catch {
        return undefined;
    }
}

/**
 * سقف المحور (⌈dataMax⌉ + هامش) مع شبكة بخطوة ثابتة من 0 حتى السقف.
 * divisions = عدد الفترات المتساوية (مثلاً 4 → 0، 15، 30، 45، 60 عندما السقف 60).
 */
function newUsersYScaleFromDataMax(dataMax, headroom = 5, divisions = 4) {
    const d = Math.max(0, Number(dataMax) || 0);
    const minTop = d <= 0 ? Math.max(5, headroom) : Math.ceil(d) + headroom;
    const rawStep = minTop / divisions;
    const step = Math.max(1, Math.ceil(rawStep));
    const yMax = step * divisions;
    const yGridValues = [];
    for (let i = divisions; i >= 0; i -= 1) {
        yGridValues.push(i * step);
    }
    return { yMax, yGridValues };
}

/**
 * قيمة → Y: الصفر عند أسفل منطقة الرسم (padBottom=0 يلتصق خط 0 بأسفل الـ SVG).
 * padTop يبقى للهوامش العلوية فقط — كان سابقاً هامش مزدوج في الأسفل فيبدو أن المقياس لا يبدأ من صفر.
 */
function chartValueToY(value, yMax, height, padTop, padBottom) {
    const innerH = height - padTop - padBottom;
    const max = Math.max(yMax, 1e-9);
    const v = Math.min(Math.max(Number(value) || 0, 0), max * 1.001);
    return padTop + innerH - (v / max) * innerH;
}

/** لا نرسم دلوز بعد «الآن» (سنة: أشهر مستقبلية، يوم: ساعات لاحقة، …) */
function trimNewUsersSeriesUpToNow(series, timeZone, period) {
    if (!Array.isArray(series) || series.length === 0) return [];
    const tz = safeChartTimeZone(timeZone);
    const nowMs = Date.now();
    const fmtDay = (dt) =>
        new Intl.DateTimeFormat('en-CA', {
            timeZone: tz || undefined,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(dt);

    return series.filter((p) => {
        const d = pickDateFromPoint(p);
        if (!d || Number.isNaN(d.getTime())) return true;
        if (period === 'day') {
            return d.getTime() <= nowMs;
        }
        return fmtDay(d) <= fmtDay(new Date());
    });
}

/** فهارس محور سيني: كل نقطة من الـ API (مع تمرير أفقي عند الازدحام) */
function newUsersXTickIndices(n) {
    if (n <= 0) return [];
    return Array.from({ length: n }, (_, i) => i);
}

function chartInnerXPercent(i, n, width, plotLeft, plotRight) {
    const innerW = plotRight - plotLeft;
    if (n <= 1) return ((plotLeft + innerW / 2) / width) * 100;
    return ((plotLeft + (i / (n - 1)) * innerW) / width) * 100;
}

function svgPlotX(i, n, plotLeft, plotRight) {
    const innerW = plotRight - plotLeft;
    if (n <= 1) return plotLeft + innerW / 2;
    return plotLeft + (i / (n - 1)) * innerW;
}

/** تسمية محور سيني: كما يرسلها الـ API أولاً، ثم احتياط من التاريخ */
function formatNewUsersXTickLabel(point, period, language, timeZone) {
    const primary = language === 'ar' ? point?.labelAr : point?.labelEn;
    const fallback = language === 'ar' ? point?.labelEn : point?.labelAr;
    const apiLabel = String(primary ?? fallback ?? '')
        .trim();
    if (apiLabel) {
        return apiLabel;
    }

    const loc = language === 'ar' ? 'ar-EG' : 'en-GB';
    const tz = safeChartTimeZone(timeZone);
    const d = pickDateFromPoint(point);
    if (!d) {
        return '—';
    }

    if (period === 'day') {
        const opts = { hour: 'numeric', minute: '2-digit', hour12: false };
        if (tz) opts.timeZone = tz;
        return d.toLocaleTimeString(loc, opts);
    }

    if (period === 'week' || period === 'month') {
        const opts = { day: 'numeric', month: 'long' };
        if (tz) opts.timeZone = tz;
        return d.toLocaleDateString(loc, opts);
    }

    if (period === 'year') {
        const opts = { month: 'short' };
        if (tz) opts.timeZone = tz;
        return d.toLocaleDateString(loc, opts);
    }

    const opts = { month: 'short', day: 'numeric' };
    if (tz) opts.timeZone = tz;
    return d.toLocaleDateString(loc, opts);
}

/** يفصل الوقت عن صباحاً/مساءً أو AM/PM — عرض سطرين ثابت */
function splitNewUsersDayTickLabel(text, language) {
    const s = String(text ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    if (!s) return null;
    if (language === 'ar') {
        const m = s.match(/^(.+?)\s+(صباحاً|صباحا|مساءً|مساء|مساءا)\s*$/);
        if (m) return { line1: m[1].trim(), line2: m[2] };
    }
    const m = s.match(/^(.+?)\s+(AM|PM)\s*$/i);
    if (m) return { line1: m[1].trim(), line2: m[2].toUpperCase() };
    return null;
}

/** تسمية يوم: من labelAr/labelEn ثم احتياط Intl بسطرين */
function buildNewUsersDayTickLines(point, language, timeZone) {
    const primary = language === 'ar' ? point?.labelAr : point?.labelEn;
    const fallback = language === 'ar' ? point?.labelEn : point?.labelAr;
    const raw = String(primary ?? fallback ?? '').trim();
    if (raw) {
        const sp = splitNewUsersDayTickLabel(raw, language);
        if (sp) return sp;
    }
    const d = pickDateFromPoint(point);
    if (!d) return { line1: '—', line2: '' };
    const loc = language === 'ar' ? 'ar-EG' : 'en-GB';
    const tz = safeChartTimeZone(timeZone);
    const opts = { hour: 'numeric', minute: '2-digit', hour12: true };
    if (tz) opts.timeZone = tz;
    const parts = new Intl.DateTimeFormat(loc, opts).formatToParts(d);
    let tStr = '';
    let dp = '';
    for (const p of parts) {
        if (p.type === 'dayPeriod') dp = p.value.replace(/\s+/g, ' ').trim();
        else if (p.type === 'hour' || p.type === 'minute' || p.type === 'literal') tStr += p.value;
    }
    tStr = tStr.replace(/\s+/g, ' ').trim();
    if (dp) return { line1: tStr, line2: dp };
    const h24 = new Intl.DateTimeFormat(loc, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
        ...(tz ? { timeZone: tz } : {})
    }).format(d);
    return { line1: h24, line2: '' };
}

/** «12 أبريل» / «12 April 2026» → يوم فوق، شهر تحت (بدون سنة في السطر الثاني) */
function splitApiDayMonthLabel(text) {
    const s = String(text ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    if (!s) return null;
    const m = s.match(/^([\d\u0660-\u0669\u06F0-\u06F9]{1,2})\s+(.+)$/u);
    if (!m) return null;
    const line2 = m[2].trim().replace(/\s+\d{4}$/, '').trim();
    if (!line2) return null;
    return { line1: m[1].trim(), line2 };
}

/** «يناير 2026» / «January 2026» → شهر فوق، سنة تحت */
function splitApiMonthYearLabel(text) {
    const s = String(text ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    if (!s) return null;
    const m = s.match(/^(.+?)\s+(\d{4})\s*$/);
    if (!m) return null;
    return { line1: m[1].trim(), line2: m[2].trim() };
}

/**
 * تسمية محور سيني بسطرين لكل الفترات: يوم = وقت + صباحاً/مساءً، أسبوع/شهر = يوم + شهر، سنة = شهر + سنة.
 */
function buildNewUsersXTickTwoLines(point, period, language, timeZone) {
    if (period === 'day') {
        return buildNewUsersDayTickLines(point, language, timeZone);
    }

    const loc = language === 'ar' ? 'ar-EG' : 'en-GB';
    const tz = safeChartTimeZone(timeZone);
    const d = pickDateFromPoint(point);
    const primary = language === 'ar' ? point?.labelAr : point?.labelEn;
    const fallback = language === 'ar' ? point?.labelEn : point?.labelAr;
    const raw = String(primary ?? fallback ?? '').trim();

    if (period === 'year') {
        if (raw) {
            const sp = splitApiMonthYearLabel(raw);
            if (sp) return sp;
        }
        if (d) {
            const parts = new Intl.DateTimeFormat(loc, {
                month: 'long',
                year: 'numeric',
                ...(tz ? { timeZone: tz } : {})
            }).formatToParts(d);
            let month = '';
            let year = '';
            for (const p of parts) {
                if (p.type === 'month') month += p.value;
                if (p.type === 'year') year += p.value;
            }
            if (month) return { line1: month.trim(), line2: year.trim() };
        }
        return { line1: raw || '—', line2: '' };
    }

    if (period === 'week' || period === 'month') {
        if (raw) {
            const sp = splitApiDayMonthLabel(raw);
            if (sp) return sp;
            /** API يرسل أحياناً اليوم فقط («5» / «١٣») بدون شهر */
            if (/^[\d\u0660-\u0669\u06F0-\u06F9]{1,2}$/u.test(raw) && d) {
                const parts = new Intl.DateTimeFormat(loc, {
                    day: 'numeric',
                    month: 'long',
                    ...(tz ? { timeZone: tz } : {})
                }).formatToParts(d);
                let month = '';
                for (const p of parts) {
                    if (p.type === 'month') month += p.value;
                }
                if (month) return { line1: raw.trim(), line2: month.trim() };
            }
        }
        if (d) {
            const parts = new Intl.DateTimeFormat(loc, {
                day: 'numeric',
                month: 'long',
                ...(tz ? { timeZone: tz } : {})
            }).formatToParts(d);
            let day = '';
            let month = '';
            for (const p of parts) {
                if (p.type === 'day') day = p.value;
                if (p.type === 'month') month += p.value;
            }
            if (day && month) return { line1: day.trim(), line2: month.trim() };
        }
        return { line1: raw || formatNewUsersXTickLabel(point, period, language, timeZone), line2: '' };
    }

    return { line1: formatNewUsersXTickLabel(point, period, language, timeZone), line2: '' };
}

function buildLinePath(values, maxVal, plotLeft, plotRight, height, padTop, padBottom) {
    const n = values.length;
    const innerW = Math.max(0, plotRight - plotLeft);
    if (n === 0) return '';
    if (n === 1) {
        const x = plotLeft + innerW / 2;
        const y = chartValueToY(values[0], maxVal, height, padTop, padBottom);
        return `M ${x.toFixed(1)} ${y.toFixed(1)} L ${(x + 0.5).toFixed(1)} ${y.toFixed(1)}`;
    }
    const pts = values.map((v, i) => {
        const x = plotLeft + (i / (n - 1)) * innerW;
        const y = chartValueToY(v, maxVal, height, padTop, padBottom);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return pts.join(' ');
}

/**
 * يبني قيم منحنى النمو: يفضّل customersCumulative / expertsCumulative من الـ API،
 * وإن غابا يحسب تراكمياً من مجموع customers/experts داخل نافذة السلسلة فقط.
 */
function prepareNewUsersSeriesForGrowthChart(series) {
    if (!series?.length) return [];
    let runC = 0;
    let runE = 0;
    return series.map((s) => {
        const incC = Number(s.customers ?? 0);
        const incE = Number(s.experts ?? 0);
        runC += Number.isFinite(incC) ? incC : 0;
        runE += Number.isFinite(incE) ? incE : 0;
        const apiC = Number(s.customersCumulative);
        const apiE = Number(s.expertsCumulative);
        return {
            ...s,
            _growthCust: Number.isFinite(apiC) ? apiC : runC,
            _growthExp: Number.isFinite(apiE) ? apiE : runE
        };
    });
}

function NewUsersChart({ newUsers, period = 'month', loading = false }) {
    const { t, language } = useLanguage();
    const daysRowDir = language === 'ar' ? 'rtl' : 'ltr';
    const chartScrollRef = useRef(null);
    const [panState, setPanState] = useState({ showArrows: false, canLeft: false, canRight: false });

    const refreshChartPanState = useCallback(() => {
        const el = chartScrollRef.current;
        if (!el) return;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        const maxScroll = scrollWidth - clientWidth;
        const showArrows = maxScroll > 4;
        setPanState({
            showArrows,
            canLeft: showArrows && scrollLeft > 2,
            canRight: showArrows && scrollLeft < maxScroll - 2
        });
    }, []);

    const chartPanByArrows = useCallback(
        (direction) => {
            const el = chartScrollRef.current;
            if (!el) return;
            const step = Math.max(120, Math.round(el.clientWidth * 0.38));
            el.scrollBy({ left: direction * step, behavior: 'smooth' });
            window.setTimeout(refreshChartPanState, 400);
        },
        [refreshChartPanState]
    );

    const rawSeries = newUsers?.series;
    const hasApiPoints = Array.isArray(rawSeries) && rawSeries.length > 0;
    const seriesTrimmed = hasApiPoints ? trimNewUsersSeriesUpToNow(rawSeries, newUsers?.timezone, period) : [];
    const hasPointsAfterTrim = seriesTrimmed.length > 0;
    const seriesPrepared = hasPointsAfterTrim ? prepareNewUsersSeriesForGrowthChart(seriesTrimmed) : [];
    const seriesForChart = hasPointsAfterTrim ? seriesPrepared : null;
    const totals = newUsers?.totals || {};

    const expertTotal = totals.experts ?? 0;
    const customerTotal = totals.customers ?? 0;

    const safeSeriesCount = (x) => {
        const n = Number(x);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
    };
    const custVals = seriesForChart ? seriesForChart.map((s) => safeSeriesCount(s._growthCust ?? 0)) : [];
    const expVals = seriesForChart ? seriesForChart.map((s) => safeSeriesCount(s._growthExp ?? 0)) : [];
    const dataMaxFromSeries = seriesForChart?.length ? Math.max(0, ...custVals, ...expVals) : 0;
    /** أعلى قيمة على المحور الصادي = أقصى ظاهر في السلسلة أو في الإجماليين (كما يعرضه الباك) */
    const dataMax = Math.max(dataMaxFromSeries, expertTotal, customerTotal);
    const { yMax: yMaxLabel, yGridValues } = newUsersYScaleFromDataMax(dataMax);
    const H = 304;
    const PLOT_EDGE = 2;
    /** هامش يسار/يمين داخل المحتوى القابل للتمرير حتى لا تُقصّ «1 أبريل» مع translateX(-50%) */
    const SCROLL_X_PAD = 36;
    /** عمود المحور Y ثابت خارج التمرير — عرض يتسع لـ «عدد المستخدمين: N» */
    const Y_AXIS_COL_W = 132;
    const MIN_X_GAP = 36;
    /** أقل عرض لمنطقة الرسم (كان ~640 مع عرض مرجعي 760 ناقص تسميات Y) */
    const INNER_PLOT_MIN = 640;
    const n = custVals.length;
    const innerPlotW = n <= 1 ? INNER_PLOT_MIN : Math.max(INNER_PLOT_MIN, (n - 1) * MIN_X_GAP);
    const plotInnerStart = PLOT_EDGE + SCROLL_X_PAD;
    const plotInnerEnd = plotInnerStart + innerPlotW;
    const scrollViewW = plotInnerEnd + SCROLL_X_PAD;
    const PT = 24;
    const PB = 0;
    const pathCust = buildLinePath(custVals, yMaxLabel, plotInnerStart, plotInnerEnd, H, PT, PB);
    const pathExp = buildLinePath(expVals, yMaxLabel, plotInnerStart, plotInnerEnd, H, PT, PB);

    useEffect(() => {
        const el = chartScrollRef.current;
        if (!el || loading) return;
        const onScroll = () => refreshChartPanState();
        el.addEventListener('scroll', onScroll, { passive: true });
        const ro = new ResizeObserver(() => refreshChartPanState());
        ro.observe(el);
        requestAnimationFrame(() => {
            el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
            refreshChartPanState();
        });
        return () => {
            el.removeEventListener('scroll', onScroll);
            ro.disconnect();
        };
    }, [scrollViewW, n, loading, hasPointsAfterTrim, refreshChartPanState]);

    const xTickIdx = seriesForChart && n > 0 ? newUsersXTickIndices(n) : [];
    const xTicks =
        seriesForChart && xTickIdx.length > 0
            ? xTickIdx.map((idx) => ({
                  idx,
                  label: formatNewUsersXTickLabel(seriesForChart[idx], period, language, newUsers?.timezone),
                  tickLines: buildNewUsersXTickTwoLines(seriesForChart[idx], period, language, newUsers?.timezone)
              }))
            : [];

    const plotBottomY = H - PB;
    const isEn = language === 'en';

    return (
        <div className="flex min-h-[340px] w-full flex-1 flex-col gap-4">
            <div dir="ltr" className={clsx('flex flex-col gap-1', isEn ? 'items-start' : 'items-end')}>
                <div
                    className={clsx(
                        'flex flex-wrap gap-6',
                        isEn ? 'items-center justify-start' : 'items-center justify-end'
                    )}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-black/60 dark:text-dark-text-muted">{t('dashboard.home.legendExperts')}</span>
                        <span className="text-2xl font-bold text-black/87 dark:text-dark-text-primary">{expertTotal}</span>
                        <span className="size-4 shrink-0 rounded bg-[#fc5c00]" />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-black/60 dark:text-dark-text-muted">{t('dashboard.home.legendClients')}</span>
                        <span className="text-2xl font-bold text-black/87 dark:text-dark-text-primary">{customerTotal}</span>
                        <span className="size-4 shrink-0 rounded bg-khabeer-brand" />
                    </div>
                </div>
                {newUsers?.timezone ? (
                    <p
                        className={clsx('text-[11px] text-[#999] dark:text-dark-text-muted', isEn ? 'text-start' : 'text-end')}
                        dir="auto"
                    >
                        {t('dashboard.home.chartDataTimezone').replace('{tz}', String(newUsers.timezone))}
                    </p>
                ) : null}
            </div>
            {newUsers != null && (!hasApiPoints || !hasPointsAfterTrim) && !loading ? (
                <p dir={daysRowDir} className="text-center text-sm text-[#999] dark:text-dark-text-muted">
                    {t('dashboard.home.chartNoSeries')}
                </p>
            ) : null}
            <div className="relative min-h-[300px] flex-1">
                {loading ? (
                    <div className="absolute inset-0 z-[5] flex items-center justify-center rounded-xl bg-white/85 backdrop-blur-[1px] dark:bg-dark-bg-secondary/90">
                        <Loader2 className="size-9 animate-spin text-khabeer-brand dark:text-dark-accent-blue" aria-hidden />
                    </div>
                ) : null}
                <div
                    dir="ltr"
                    className={clsx('flex min-h-[300px] min-w-0 flex-1 gap-1', isEn ? 'flex-row-reverse' : 'flex-row')}
                >
                    <div className="relative min-h-0 min-w-0 flex-1">
                        {panState.showArrows ? (
                            <>
                                <button
                                    type="button"
                                    disabled={!panState.canLeft}
                                    aria-label={t('dashboard.home.chartPanOlder')}
                                    className={clsx(
                                        'absolute start-2 top-[148px] z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#e2e2e2] bg-white/95 text-[#333] shadow-sm backdrop-blur-sm transition-opacity disabled:pointer-events-none disabled:opacity-25 dark:border-dark-border dark:bg-dark-bg-secondary/95 dark:text-dark-text-primary',
                                        panState.canLeft && 'hover:bg-[#f5f5f5] dark:hover:bg-dark-bg-tertiary'
                                    )}
                                    onClick={() => chartPanByArrows(-1)}
                                >
                                    <ChevronLeft className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                                </button>
                                <button
                                    type="button"
                                    disabled={!panState.canRight}
                                    aria-label={t('dashboard.home.chartPanNewer')}
                                    className={clsx(
                                        'absolute end-2 top-[148px] z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#e2e2e2] bg-white/95 text-[#333] shadow-sm backdrop-blur-sm transition-opacity disabled:pointer-events-none disabled:opacity-25 dark:border-dark-border dark:bg-dark-bg-secondary/95 dark:text-dark-text-primary',
                                        panState.canRight && 'hover:bg-[#f5f5f5] dark:hover:bg-dark-bg-tertiary'
                                    )}
                                    onClick={() => chartPanByArrows(1)}
                                >
                                    <ChevronRight className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                                </button>
                            </>
                        ) : null}
                        <div
                            ref={chartScrollRef}
                            className="h-full min-h-0 w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]"
                        >
                        <div
                            className="grid shrink-0 grid-cols-1 grid-rows-[auto_auto] gap-y-0"
                            style={{ width: scrollViewW }}
                        >
                            <div className="row-start-1 max-h-[320px]">
                                <svg
                                    width={scrollViewW}
                                    height={H}
                                    viewBox={`0 0 ${scrollViewW} ${H}`}
                                    className="block"
                                    overflow="visible"
                                    aria-hidden
                                >
                                    {yGridValues.map((gv, gi) => (
                                        <line
                                            key={`h-${gi}-${gv}`}
                                            x1={plotInnerStart}
                                            x2={plotInnerEnd}
                                            y1={chartValueToY(gv, yMaxLabel, H, PT, PB)}
                                            y2={chartValueToY(gv, yMaxLabel, H, PT, PB)}
                                            className="stroke-khabeer-stroke dark:stroke-dark-border"
                                            strokeWidth="1"
                                        />
                                    ))}
                                    {custVals.length > 0 && n > 0
                                        ? xTickIdx.map((ti) => (
                                              <line
                                                  key={`v-${ti}`}
                                                  x1={svgPlotX(ti, n, plotInnerStart, plotInnerEnd)}
                                                  x2={svgPlotX(ti, n, plotInnerStart, plotInnerEnd)}
                                                  y1={PT}
                                                  y2={plotBottomY}
                                                  className="stroke-khabeer-stroke/60 dark:stroke-dark-border/60"
                                                  strokeWidth="1"
                                              />
                                          ))
                                        : null}
                                    {pathCust ? (
                                        <path d={pathCust} fill="none" stroke="#0077b6" strokeWidth="3" strokeLinecap="round" />
                                    ) : null}
                                    {pathExp ? (
                                        <path d={pathExp} fill="none" stroke="#fc5c00" strokeWidth="3" strokeLinecap="round" />
                                    ) : null}
                                </svg>
                            </div>
                            {xTicks.length > 0 ? (
                                <div
                                    className="relative row-start-2 mt-4 min-h-16 shrink-0 overflow-visible pt-0.5"
                                    style={{ width: scrollViewW }}
                                    dir="ltr"
                                >
                                    {xTicks.map(({ idx, label, tickLines }) => (
                                        <span
                                            key={`xt-${idx}`}
                                            className="pointer-events-none absolute top-0 flex min-w-[3.25rem] max-w-[6.5rem] flex-col items-center gap-0.5 text-center text-sm font-medium leading-tight text-[#999] dark:text-dark-text-muted"
                                            style={{
                                                left: `${chartInnerXPercent(idx, n, scrollViewW, plotInnerStart, plotInnerEnd)}%`,
                                                transform: 'translateX(-50%)'
                                            }}
                                            dir="auto"
                                        >
                                            {tickLines.line2 ? (
                                                <>
                                                    <span className="block whitespace-nowrap leading-tight">{tickLines.line1}</span>
                                                    <span className="block whitespace-nowrap text-[11px] leading-tight dark:text-dark-text-muted">
                                                        {tickLines.line2}
                                                    </span>
                                                </>
                                            ) : (
                                                label
                                            )}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        </div>
                    </div>
                    <div
                        dir="ltr"
                        className={clsx(
                            'isolate shrink-0 border-[#ececec] bg-white dark:border-dark-border dark:bg-dark-bg-secondary',
                            isEn ? 'border-e' : 'border-s'
                        )}
                        style={{ width: Y_AXIS_COL_W }}
                    >
                        {/*
                          تسميات المحور Y كـ HTML (لتفادي bidi لنص SVG). صيغة: «عدد المستخدمين: N» / «Users: N».
                        */}
                        <div className="relative text-[#999] dark:text-dark-text-muted" style={{ height: H }}>
                            {yGridValues.map((gv, yi) => {
                                const yMid = chartValueToY(gv, yMaxLabel, H, PT, PB);
                                const topPct = (yMid / H) * 100;
                                return (
                                    <div
                                        key={`yfix-${yi}-${gv}`}
                                        className={clsx(
                                            'pointer-events-none absolute inset-x-0 flex pe-1 font-medium leading-none',
                                            isEn ? 'justify-end' : 'justify-start'
                                        )}
                                        style={{
                                            top: `${topPct}%`,
                                            transform: 'translateY(-50%)',
                                            fontFamily: "system-ui, 'Segoe UI', sans-serif",
                                            fontSize: 13
                                        }}
                                    >
                                        <span
                                            dir="auto"
                                            className={clsx('whitespace-nowrap tabular-nums', isEn ? 'text-end' : 'text-start')}
                                        >
                                            {tf(t('dashboard.home.yAxisChartTick'), String(gv))}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 min-h-16 pt-0.5" aria-hidden />
                    </div>
                </div>
            </div>
        </div>
    );
}

function FeaturedExpertRow({ name, category, orders, rating, avatarUrl, listRtl }) {
    const { t } = useLanguage();
    return (
        <div
            dir={listRtl ? 'rtl' : 'ltr'}
            className="flex w-full flex-row items-center gap-1 rounded-2xl border border-[#ece4eb] bg-white p-3 dark:border-dark-border dark:bg-dark-bg-secondary"
        >
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border-[0.5px] border-[#e2e2e2] bg-[#0077b6]/10 dark:border-dark-border">
                <AvatarOrInitial name={name} avatarUrl={avatarUrl} className="text-base" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="min-w-0 flex-1 overflow-hidden text-start">
                    <span className="block min-w-0 truncate text-base font-semibold text-[#000000] dark:text-dark-text-primary">
                        {name}
                    </span>
                    <span className="mt-1 block min-w-0 truncate text-sm text-[#666] dark:text-dark-text-muted">
                        {category}
                    </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-end">
                    <span className="whitespace-nowrap text-sm text-[#999] dark:text-dark-text-muted">
                        {tf(t('dashboard.home.ordersCount'), orders)}
                    </span>
                    <span className="inline-flex items-center justify-end gap-0.5 tabular-nums text-sm text-[#333] dark:text-dark-text-primary">
                        <Star className="size-4 shrink-0 text-amber-500" fill="currentColor" strokeWidth={0} aria-hidden />
                        <span>{rating}</span>
                    </span>
                </div>
            </div>
        </div>
    );
}

const RIYADH_MAP_CENTER = /** @type {const} */ ([24.7136, 46.6753]);

function escapeAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** حجم دائرة الخبير على الخريطة — صورة من `avatarUrl` في ريسبونس الـ API */
const EXPERT_MARKER_PX = 64;

function expertMapDivIcon(avatarUrl, displayName) {
    const s = EXPERT_MARKER_PX;
    const half = s / 2;
    const initial = escapeAttr((displayName || '—').trim().charAt(0) || '—').toUpperCase();
    const trimmed = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';
    const safeUrl = trimmed ? escapeAttr(trimmed) : '';
    const inner = safeUrl
        ? `<img src="${safeUrl}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block" />`
        : `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font:700 ${Math.round(s * 0.34)}px/1 system-ui,sans-serif;color:#0077b6;background:rgba(0,119,182,0.14)">${initial}</span>`;
    const pinH = 11;
    const html = `<div style="display:flex;flex-direction:column;align-items:center;width:${s}px">
<div style="width:${s}px;height:${s}px;border-radius:999px;overflow:hidden;border:3px solid #0077b6;box-shadow:0 3px 14px rgba(0,0,0,0.22),0 0 0 2px #fff;background:#fff">${inner}</div>
<div style="margin-top:-2px;width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-top:${pinH}px solid #0077b6;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.15))"></div>
</div>`;
    const totalH = s + pinH;
    return L.divIcon({
        className: '!bg-transparent !border-0',
        html,
        iconSize: [s, totalH],
        iconAnchor: [half, totalH],
        popupAnchor: [0, -(totalH - 4)]
    });
}

function ExpertsMapFitBounds({ points }) {
    const map = useMap();
    useEffect(() => {
        if (!points.length) {
            map.setView(RIYADH_MAP_CENTER, 11, { animate: false });
            return;
        }
        if (points.length === 1) {
            map.setView([points[0].lat, points[0].lng], 13, { animate: false });
            return;
        }
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: false });
    }, [map, points]);
    return null;
}

function ExpertsMapPanel({ contentDir = 'ltr', mapPoints }) {
    const { t } = useLanguage();
    const rawItems = mapPoints?.items?.length ? mapPoints.items : [];
    const points = useMemo(() => {
        const out = [];
        for (const p of rawItems) {
            const lat = Number(p.lat);
            const lng = Number(p.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            const avatarFromApi = p.avatarUrl ?? p.avatar_url;
            const label =
                [p.displayName, p.display_name, p.fullName, p.full_name, p.name]
                    .map((x) => (typeof x === 'string' ? x.trim() : ''))
                    .find(Boolean) || '';
            out.push({
                lat,
                lng,
                key: String(p.providerId || p.firebaseUid || `${lat.toFixed(5)}-${lng.toFixed(5)}`),
                avatarUrl: typeof avatarFromApi === 'string' ? avatarFromApi : '',
                name: label
            });
        }
        return out;
    }, [rawItems]);

    const pointsWithIcons = useMemo(
        () => points.map((p) => ({ ...p, icon: expertMapDivIcon(p.avatarUrl, p.name) })),
        [points]
    );

    return (
        <div dir={contentDir} className="flex min-h-[380px] flex-1 flex-col gap-4 self-stretch rounded-[24px] bg-white p-4 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none">
            <h2 className="w-full text-start text-2xl font-bold leading-normal text-[#333] dark:text-dark-text-primary">
                {t('dashboard.home.mapTitle')}
            </h2>
            <div
                dir="ltr"
                className="relative z-0 min-h-[320px] flex-1 overflow-hidden rounded-[15px] border border-[#e2e2e2] dark:border-dark-border [&_.leaflet-container]:isolate [&_.leaflet-container]:size-full [&_.leaflet-container]:min-h-[320px] [&_.leaflet-container]:bg-[#e8eef2] dark:[&_.leaflet-container]:bg-dark-bg-tertiary"
            >
                <MapContainer center={RIYADH_MAP_CENTER} zoom={11} className="size-full min-h-[320px]" scrollWheelZoom>
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    <ExpertsMapFitBounds points={points} />
                    {pointsWithIcons.map((p) => (
                        <Marker key={p.key} position={[p.lat, p.lng]} icon={p.icon}>
                            {p.name ? (
                                <Tooltip
                                    direction="top"
                                    offset={[0, -10]}
                                    opacity={0.95}
                                    className="!rounded-lg !border-0 !px-2.5 !py-1.5 !text-sm !font-semibold !text-[#333] !shadow-md dark:!bg-dark-bg-elevated dark:!text-dark-text-primary"
                                >
                                    <span dir="auto">{p.name}</span>
                                </Tooltip>
                            ) : null}
                        </Marker>
                    ))}
                </MapContainer>
                {points.length === 0 ? (
                    <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center rounded-[15px] bg-white/75 p-4 backdrop-blur-[1px] dark:bg-dark-bg-secondary/80">
                        <p dir={contentDir} className="max-w-sm text-center text-sm text-[#666] dark:text-dark-text-muted">
                            {t('dashboard.home.noMapExperts')}
                        </p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default function DashboardHome() {
    const { t, language } = useLanguage();
    const { token, authUid } = useAuth();
    const [searchParams] = useSearchParams();
    const cardDir = language === 'ar' ? 'rtl' : 'ltr';
    const lang = language === 'ar' ? 'ar' : 'en';
    const rawSearchQ = (searchParams.get('q') ?? '').trim();

    const [debouncedSearchQ, setDebouncedSearchQ] = useState('');
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearchQ(rawSearchQ), 400);
        return () => clearTimeout(id);
    }, [rawSearchQ]);

    const [globalSearchSections, setGlobalSearchSections] = useState(/** @type {Array<{ key: string, items: object[] }>} */ ([]));
    const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
    const [globalSearchError, setGlobalSearchError] = useState('');

    useEffect(() => {
        if (!authUid || !token) {
            setGlobalSearchSections([]);
            setGlobalSearchError('');
            setGlobalSearchLoading(false);
            return;
        }
        if (debouncedSearchQ.length < 2) {
            setGlobalSearchSections([]);
            setGlobalSearchError('');
            setGlobalSearchLoading(false);
            return;
        }
        if (debouncedSearchQ.length > 120) {
            setGlobalSearchSections([]);
            setGlobalSearchError('');
            setGlobalSearchLoading(false);
            return;
        }
        let cancelled = false;
        setGlobalSearchLoading(true);
        setGlobalSearchError('');
        (async () => {
            try {
                const idToken = await resolveDashboardToken(token);
                const res = await fetchDashboardGlobalSearch(idToken, {
                    q: debouncedSearchQ,
                    limit: 8,
                    lang
                });
                const data = unwrapDashboardEnvelope(res);
                if (cancelled) return;
                setGlobalSearchSections(parseDashboardGlobalSearchSections(data));
            } catch (e) {
                console.error('dashboard global search:', e);
                if (!cancelled) {
                    setGlobalSearchError(getHttpErrorMessage(e));
                    setGlobalSearchSections([]);
                }
            } finally {
                if (!cancelled) setGlobalSearchLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debouncedSearchQ, authUid, token, lang]);

    /** كل قسم له فلتر مستقل — تغيير أحدهم لا يحدّث الباقي (الدمج من الـ API فقط) */
    const [periodNewUsers, setPeriodNewUsers] = useState(DASHBOARD_SUMMARY_PERIOD);
    const [periodTopServices, setPeriodTopServices] = useState(DASHBOARD_SUMMARY_PERIOD);
    const [periodOrdersSummary, setPeriodOrdersSummary] = useState(DASHBOARD_SUMMARY_PERIOD);
    /** تحميل عند تغيير الفلتر فقط (بعد أول تحميل للصفحة) */
    const [loadingNewUsersChart, setLoadingNewUsersChart] = useState(false);
    const [loadingTopServices, setLoadingTopServices] = useState(false);
    const [loadingOrdersSummary, setLoadingOrdersSummary] = useState(false);
    const [home, setHome] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [loadErrorDetail, setLoadErrorDetail] = useState('');
    const [retryKey, setRetryKey] = useState(0);
    /** يزيد عند إشعار FCM لتحديث بيانات الهوم صامتاً */
    const [homeEventRefreshTick, setHomeEventRefreshTick] = useState(0);
    /** جاهز بعد أول جلب رئيسي ناجح — لدمج طبقة التحليلات */
    const [mainDataReady, setMainDataReady] = useState(false);
    /** بعد أول تحميل ناجح لا نُخفِ المحتوى عند تغيير اللغة — تجنب إحساس «تحديث الصفحة كاملة». */
    const dashboardReadyRef = useRef(false);
    /** آخر طلب رئيسي */
    const homeFetchIdRef = useRef(0);
    /** طلبات دمج منفصلة لتفادي تعارض الاستجابات */
    const newUsersFetchIdRef = useRef(0);
    const topServicesFetchIdRef = useRef(0);
    const ordersSummaryFetchIdRef = useRef(0);
    /** يزيد مع كل تشغيل فعلي للـ effect (لتجاهل finally من طلب أُلغي أو من تشغيل مزدوج) */
    const newUsersMergeRunIdRef = useRef(0);
    const topServicesMergeRunIdRef = useRef(0);
    const ordersSummaryMergeRunIdRef = useRef(0);
    const homeRef = useRef(null);
    /** عند `true` يعاد جلب البيانات دون تعطيل المحتوى أو إظهار خطأ يمسح الشاشة */
    const homeSilentRefreshRef = useRef(false);
    useEffect(() => {
        homeRef.current = home;
    }, [home]);

    useEffect(() => {
        const onDataRefresh = (e) => {
            const scopes = e?.detail?.scopes;
            if (!Array.isArray(scopes) || !scopes.includes('home')) return;
            homeSilentRefreshRef.current = true;
            setHomeEventRefreshTick((n) => n + 1);
        };
        window.addEventListener('admin-dashboard-data-refresh', onDataRefresh);
        return () => window.removeEventListener('admin-dashboard-data-refresh', onDataRefresh);
    }, []);
    /**
     * لكل قسم: هل المستخدم غيّر الفلتر منذ آخر جلب رئيسي؟
     * إذا لا والفترة = شهر → نتخطى طلب الدمج (البيانات جاية من Promise.all) بدون تبديل ref يُفسد تخطي React 18 Strict Mode.
     */
    const hasUserAdjustedPeriodNewUsersRef = useRef(false);
    const hasUserAdjustedTopServicesRef = useRef(false);
    const hasUserAdjustedOrdersSummaryRef = useRef(false);

    /**
     * لكل شريحة: آخر {lang, period} مُزامَن مع الطلب.
     * عند تغيير اللغة فقط (نفس الفترة) لا نُظهر التحميل — الطلب يبقى صامتاً.
     */
    const newUsersMergePrevRef = useRef({ lang, period: periodNewUsers });
    const topServicesMergePrevRef = useRef({ lang, period: periodTopServices });
    const ordersSummaryMergePrevRef = useRef({ lang, period: periodOrdersSummary });

    /** أحدث فلتر لكل قسم — يُقرأ داخل جلب «الصفحة الرئيسية» دون إضافة الفترة لـ deps (تجنب إعادة تحميل كامل عند تغيير الفلتر) */
    const periodNewUsersRef = useRef(periodNewUsers);
    const periodTopServicesRef = useRef(periodTopServices);
    const periodOrdersSummaryRef = useRef(periodOrdersSummary);
    periodNewUsersRef.current = periodNewUsers;
    periodTopServicesRef.current = periodTopServices;
    periodOrdersSummaryRef.current = periodOrdersSummary;

    useEffect(() => {
        if (!authUid || !token) {
            setLoading(false);
            setMainDataReady(false);
            return;
        }
        let cancelled = false;
        const fetchId = ++homeFetchIdRef.current;
        const silentRefresh = homeSilentRefreshRef.current;
        homeSilentRefreshRef.current = false;
        (async () => {
            if (!silentRefresh) {
                if (!dashboardReadyRef.current) {
                    setLoading(true);
                }
                setLoadError(null);
                setLoadErrorDetail('');
                setMainDataReady(false);
            }
            try {
                const idToken = await resolveDashboardToken(token);
                const p = DASHBOARD_SUMMARY_PERIOD;
                const [
                    summaryRes,
                    joinRes,
                    newUsersRes,
                    ordersSummaryRes,
                    topServicesRes,
                    recentOrdersRes,
                    featuredRes,
                    mapRes,
                    reviewsRes
                ] = await Promise.all([
                    fetchDashboardSummary(idToken, { lang }),
                    fetchDashboardJoinRequests(idToken, { lang }),
                    fetchDashboardNewUsers(idToken, { lang, period: p }),
                    fetchDashboardOrdersSummary(idToken, { lang, period: p }),
                    fetchDashboardTopServices(idToken, { lang, period: p }),
                    fetchDashboardRecentOrders(idToken, { lang }),
                    fetchDashboardFeaturedExperts(idToken, { lang }),
                    fetchDashboardMapPoints(idToken, { lang }),
                    fetchDashboardRecentReviews(idToken, { lang })
                ]);
                if (cancelled || fetchId !== homeFetchIdRef.current) {
                    return;
                }
                const incoming = {
                    summary: unwrapDashboardEnvelope(summaryRes),
                    joinRequests: unwrapDashboardEnvelope(joinRes),
                    newUsers: unwrapDashboardEnvelope(newUsersRes),
                    ordersSummary: unwrapDashboardEnvelope(ordersSummaryRes),
                    topServices: unwrapDashboardEnvelope(topServicesRes),
                    recentOrders: unwrapDashboardEnvelope(recentOrdersRes),
                    featuredExperts: unwrapDashboardEnvelope(featuredRes),
                    mapPoints: unwrapDashboardEnvelope(mapRes),
                    recentReviews: unwrapDashboardEnvelope(reviewsRes)
                };
                const p0 = DASHBOARD_SUMMARY_PERIOD;
                setHome((prev) => {
                    if (!prev) return incoming;
                    const pn = periodNewUsersRef.current;
                    const pt = periodTopServicesRef.current;
                    const po = periodOrdersSummaryRef.current;
                    return {
                        ...incoming,
                        newUsers: pn === p0 ? incoming.newUsers : (prev.newUsers ?? incoming.newUsers),
                        ordersSummary: po === p0 ? incoming.ordersSummary : (prev.ordersSummary ?? incoming.ordersSummary),
                        topServices: pt === p0 ? incoming.topServices : (prev.topServices ?? incoming.topServices),
                        recentOrders: incoming.recentOrders
                    };
                });
                dashboardReadyRef.current = true;
                setMainDataReady(true);
                hasUserAdjustedPeriodNewUsersRef.current = false;
                hasUserAdjustedTopServicesRef.current = false;
                hasUserAdjustedOrdersSummaryRef.current = false;
            } catch (e) {
                console.error(e);
                if (cancelled || fetchId !== homeFetchIdRef.current) {
                    return;
                }
                if (silentRefresh) {
                    return;
                }
                setLoadError(e?.message || 'error');
                setLoadErrorDetail(getHttpErrorMessage(e));
                setHome(null);
                dashboardReadyRef.current = false;
                setMainDataReady(false);
            } finally {
                if (fetchId === homeFetchIdRef.current && !silentRefresh) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [authUid, lang, retryKey, homeEventRefreshTick]);

    /** مستخدمون جدد — يحدّث newUsers فقط */
    useEffect(() => {
        if (!authUid || !mainDataReady || !homeRef.current?.summary) return;

        if (periodNewUsers === DASHBOARD_SUMMARY_PERIOD && !hasUserAdjustedPeriodNewUsersRef.current) {
            newUsersMergePrevRef.current = { lang, period: periodNewUsers };
            setLoadingNewUsersChart(false);
            return;
        }

        const nuPrev = newUsersMergePrevRef.current;
        const onlyLangChanged = nuPrev.period === periodNewUsers && nuPrev.lang !== lang;
        newUsersMergePrevRef.current = { lang, period: periodNewUsers };

        const runId = ++newUsersMergeRunIdRef.current;
        queueMicrotask(() => {
            if (runId !== newUsersMergeRunIdRef.current) return;
            const fid = ++newUsersFetchIdRef.current;
            if (!onlyLangChanged) setLoadingNewUsersChart(true);
            (async () => {
                try {
                    const idToken = await resolveDashboardToken(token);
                    const res = await fetchDashboardNewUsers(idToken, { lang, period: periodNewUsers });
                    const slice = unwrapDashboardEnvelope(res);
                    if (fid !== newUsersFetchIdRef.current) return;
                    setHome((prev) => {
                        if (!prev) return { summary: {}, newUsers: slice };
                        return {
                            ...prev,
                            summary: prev.summary,
                            newUsers: slice ?? prev.newUsers
                        };
                    });
                } catch (e) {
                    console.error('dashboard newUsers merge:', e);
                } finally {
                    if (fid !== newUsersFetchIdRef.current) return;
                    if (runId !== newUsersMergeRunIdRef.current) return;
                    setLoadingNewUsersChart(false);
                }
            })();
        });
        return () => {
            newUsersMergeRunIdRef.current += 1;
            setLoadingNewUsersChart(false);
        };
    }, [authUid, lang, periodNewUsers, mainDataReady]);

    /** أكثر الخدمات طلباً — يحدّث topServices فقط */
    useEffect(() => {
        if (!authUid || !mainDataReady || !homeRef.current?.summary) return;

        if (periodTopServices === DASHBOARD_SUMMARY_PERIOD && !hasUserAdjustedTopServicesRef.current) {
            topServicesMergePrevRef.current = { lang, period: periodTopServices };
            setLoadingTopServices(false);
            return;
        }

        const tsPrev = topServicesMergePrevRef.current;
        const onlyLangChanged = tsPrev.period === periodTopServices && tsPrev.lang !== lang;
        topServicesMergePrevRef.current = { lang, period: periodTopServices };

        const runId = ++topServicesMergeRunIdRef.current;
        queueMicrotask(() => {
            if (runId !== topServicesMergeRunIdRef.current) return;
            const fid = ++topServicesFetchIdRef.current;
            if (!onlyLangChanged) setLoadingTopServices(true);
            (async () => {
                try {
                    const idToken = await resolveDashboardToken(token);
                    const res = await fetchDashboardTopServices(idToken, { lang, period: periodTopServices });
                    const topServices = unwrapDashboardEnvelope(res);
                    if (fid !== topServicesFetchIdRef.current) return;
                    setHome((prev) => {
                        if (!prev) return { summary: {}, topServices };
                        return {
                            ...prev,
                            summary: prev.summary,
                            topServices: topServices ?? prev.topServices
                        };
                    });
                } catch (e) {
                    console.error('dashboard topServices merge:', e);
                } finally {
                    if (fid !== topServicesFetchIdRef.current) return;
                    if (runId !== topServicesMergeRunIdRef.current) return;
                    setLoadingTopServices(false);
                }
            })();
        });
        return () => {
            topServicesMergeRunIdRef.current += 1;
            setLoadingTopServices(false);
        };
    }, [authUid, lang, periodTopServices, mainDataReady]);

    /** طلبات الخدمات (الشريط) — يحدّث ordersSummary فقط */
    useEffect(() => {
        if (!authUid || !mainDataReady || !homeRef.current?.summary) return;

        if (periodOrdersSummary === DASHBOARD_SUMMARY_PERIOD && !hasUserAdjustedOrdersSummaryRef.current) {
            ordersSummaryMergePrevRef.current = { lang, period: periodOrdersSummary };
            setLoadingOrdersSummary(false);
            return;
        }

        const osPrev = ordersSummaryMergePrevRef.current;
        const onlyLangChanged = osPrev.period === periodOrdersSummary && osPrev.lang !== lang;
        ordersSummaryMergePrevRef.current = { lang, period: periodOrdersSummary };

        const runId = ++ordersSummaryMergeRunIdRef.current;
        queueMicrotask(() => {
            if (runId !== ordersSummaryMergeRunIdRef.current) return;
            const fid = ++ordersSummaryFetchIdRef.current;
            if (!onlyLangChanged) setLoadingOrdersSummary(true);
            (async () => {
                try {
                    const idToken = await resolveDashboardToken(token);
                    const res = await fetchDashboardOrdersSummary(idToken, { lang, period: periodOrdersSummary });
                    const ordersSummary = unwrapDashboardEnvelope(res);
                    if (fid !== ordersSummaryFetchIdRef.current) return;
                    setHome((prev) => {
                        if (!prev) return { summary: {}, ordersSummary };
                        return {
                            ...prev,
                            summary: prev.summary,
                            ordersSummary: ordersSummary ?? prev.ordersSummary
                        };
                    });
                } catch (e) {
                    console.error('dashboard ordersSummary merge:', e);
                } finally {
                    if (fid !== ordersSummaryFetchIdRef.current) return;
                    if (runId !== ordersSummaryMergeRunIdRef.current) return;
                    setLoadingOrdersSummary(false);
                }
            })();
        });
        return () => {
            ordersSummaryMergeRunIdRef.current += 1;
            setLoadingOrdersSummary(false);
        };
    }, [authUid, lang, periodOrdersSummary, mainDataReady]);

    const summary = home?.summary || {};
    const cov = summary.coverage;
    const orders = summary.orders || summary.catalog;
    const exp = summary.experts;
    const cust = summary.customers;

    const joinItems = home?.joinRequests?.items || [];
    const featuredItems = home?.featuredExperts?.items || [];

    const onPeriodNewUsersChange = (next) => {
        hasUserAdjustedPeriodNewUsersRef.current = true;
        setPeriodNewUsers(next);
    };
    const onPeriodTopServicesChange = (next) => {
        hasUserAdjustedTopServicesRef.current = true;
        setPeriodTopServices(next);
    };
    const onPeriodOrdersSummaryChange = (next) => {
        hasUserAdjustedOrdersSummaryRef.current = true;
        setPeriodOrdersSummary(next);
    };

    return (
        <div className="flex w-full flex-col gap-6 lg:gap-8">
            {loading && (
                <div className="flex min-h-[280px] items-center justify-center">
                    <Loader2 className="size-10 animate-spin text-khabeer-brand dark:text-dark-accent-blue" />
                </div>
            )}

            {!loading && loadError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    <p className="font-medium">{t('dashboard.home.overviewLoadError')}</p>
                    {loadErrorDetail ? (
                        <p className="mt-2 break-words text-xs opacity-90" dir="auto">
                            {loadErrorDetail}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setRetryKey((k) => k + 1)}
                        className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100 dark:hover:bg-red-900/50"
                    >
                        {t('dashboard.home.retryOverview')}
                    </button>
                </div>
            )}

            {!loading && !loadError && (
                <>
                    {rawSearchQ.length > 0 && (
                        <section
                            dir={cardDir}
                            className="rounded-2xl border border-khabeer-stroke bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-bg-secondary"
                        >
                            <h2 className="mb-3 text-start text-lg font-bold text-[#333] dark:text-dark-text-primary">
                                {t('dashboard.home.globalSearchTitle')}
                            </h2>
                            {rawSearchQ.length < 2 && (
                                <p className="text-sm text-[#999] dark:text-dark-text-muted">
                                    {t('dashboard.home.globalSearchMinHint')}
                                </p>
                            )}
                            {rawSearchQ.length >= 2 && globalSearchLoading && (
                                <div className="flex items-center gap-2 text-sm text-khabeer-muted">
                                    <Loader2 className="size-5 shrink-0 animate-spin text-khabeer-brand" />
                                    {t('dashboard.home.globalSearchLoading')}
                                </div>
                            )}
                            {rawSearchQ.length >= 2 && !globalSearchLoading && globalSearchError && (
                                <p className="text-sm text-red-600 dark:text-red-400" dir="auto">
                                    {t('dashboard.home.globalSearchError')}
                                    {globalSearchError ? `: ${globalSearchError}` : ''}
                                </p>
                            )}
                            {rawSearchQ.length >= 2 &&
                                !globalSearchLoading &&
                                !globalSearchError &&
                                globalSearchSections.length === 0 && (
                                    <p className="text-sm text-[#999] dark:text-dark-text-muted">
                                        {t('dashboard.home.globalSearchEmpty')}
                                    </p>
                                )}
                            {rawSearchQ.length >= 2 &&
                                !globalSearchLoading &&
                                !globalSearchError &&
                                globalSearchSections.length > 0 && (
                                    <div className="flex flex-col gap-6">
                                        {globalSearchSections.map((sec) => (
                                            <div key={sec.key}>
                                                <h3 className="mb-2 text-start text-sm font-semibold text-khabeer-muted">
                                                    {dashboardSearchSectionTitle(t, sec.key)}
                                                </h3>
                                                <ul className="flex flex-col gap-2">
                                                    {sec.items.map((item, idx) => {
                                                        const to = getDashboardSearchItemTo(sec.key, item);
                                                        const primary = pickDashboardSearchPrimary(item);
                                                        const secondary = pickDashboardSearchSecondary(item);
                                                        const inner = (
                                                            <>
                                                                <div className="min-w-0 flex-1 text-start">
                                                                    <p className="truncate font-medium text-[#333] dark:text-dark-text-primary">
                                                                        {primary}
                                                                    </p>
                                                                    {secondary && secondary !== primary ? (
                                                                        <p className="truncate text-xs text-[#666] dark:text-dark-text-secondary">
                                                                            {secondary}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                                {to ? (
                                                                    <ChevronRight
                                                                        className="size-4 shrink-0 text-khabeer-muted rtl:rotate-180"
                                                                        aria-hidden
                                                                    />
                                                                ) : null}
                                                            </>
                                                        );
                                                        return (
                                                            <li key={`${sec.key}-${item?.id ?? idx}`}>
                                                                {to ? (
                                                                    <Link
                                                                        to={to}
                                                                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-khabeer-stroke/80 bg-[#f9fafb] px-3 py-2.5 transition hover:border-khabeer-brand/40 hover:bg-khabeer-brand/5 dark:border-dark-border dark:bg-dark-bg-tertiary/60 dark:hover:bg-khabeer-brand/10"
                                                                    >
                                                                        {inner}
                                                                    </Link>
                                                                ) : (
                                                                    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-khabeer-stroke/50 bg-[#f9fafb] px-3 py-2.5 opacity-90 dark:border-dark-border dark:bg-dark-bg-tertiary/40">
                                                                        {inner}
                                                                    </div>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                )}
                        </section>
                    )}

                    <section dir={cardDir} className="flex flex-col gap-6">
                        <h1 className="text-start text-[32px] font-bold leading-normal text-[#333] dark:text-dark-text-primary">
                            {t('dashboard.home.overviewTitle')}
                        </h1>
                        <div
                            className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4"
                            /* إنجليزي: نفس ترتيب العرب (من يمين الكتلة) ← يُعكَس صف أعمدة ltr */
                            dir={language === 'en' ? 'rtl' : 'ltr'}
                        >
                            <KpiCard
                                contentDir={cardDir}
                                title={t('dashboard.home.coverageAreas')}
                                value={String(cov?.zonesTotal ?? '—')}
                                linkTo="/dashboard/locations"
                                linkLabel={t('dashboard.home.viewCoverage')}
                                illustrationSrc={IMG_COVERAGE}
                            />
                            <KpiCard
                                contentDir={cardDir}
                                title={t('dashboard.home.totalServices')}
                                value={String(orders?.ordersTotal ?? orders?.servicesTotal ?? '—')}
                                linkTo="/dashboard/service-orders"
                                linkLabel={t('dashboard.home.viewServicesList')}
                                illustrationSrc={IMG_SERVICES}
                            />
                            <KpiCard
                                contentDir={cardDir}
                                title={t('dashboard.home.totalExperts')}
                                value={String(exp?.total ?? '—')}
                                linkTo="/dashboard/submitted?view=all"
                                linkLabel={t('dashboard.home.viewExpertsList')}
                                illustrationSrc={IMG_EXPERT}
                            />
                            <KpiCard
                                contentDir={cardDir}
                                title={t('dashboard.home.totalClients')}
                                value={String(cust?.seekersTotal ?? '—')}
                                linkTo="/dashboard/users"
                                linkLabel={t('dashboard.home.viewClientsList')}
                                illustrationSrc={IMG_CLIENT}
                            />
                        </div>
                    </section>

                    <section
                        dir="ltr"
                        className={clsx('flex flex-col gap-6 lg:flex-row lg:items-stretch', language === 'en' && 'lg:flex-row-reverse')}
                    >
                        <div
                            dir={cardDir}
                            className="flex w-full shrink-0 flex-col gap-4 overflow-hidden rounded-[24px] bg-white p-4 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none lg:w-[362px]"
                        >
                            <div className="flex w-full items-center justify-between gap-4">
                                <h2 className="min-w-0 flex-1 text-start text-2xl font-bold leading-tight text-[#333] dark:text-dark-text-primary">
                                    {t('dashboard.home.newJoinRequests')}
                                </h2>
                                <Link
                                    to="/dashboard/submitted?view=all"
                                    className="shrink-0 text-sm text-[#999] hover:text-khabeer-brand dark:text-dark-text-muted dark:hover:text-dark-accent-blue"
                                >
                                    {t('dashboard.home.more')}
                                </Link>
                            </div>
                            <div className="flex flex-col gap-4">
                                {joinItems.length === 0 ? (
                                    <p className="text-center text-sm text-[#999] dark:text-dark-text-muted">{t('dashboard.home.noJoinRequests')}</p>
                                ) : (
                                    joinItems.map((row, idx) => (
                                        <div key={row.applicationId || idx}>
                                            <JoinRequestCard
                                                name={row.fullName || '—'}
                                                category={row.serviceLabel || row.status || '—'}
                                                daysAgo={daysAgoFromIso(row.submittedAt || row.createdAt)}
                                                avatarUrl={row.avatarUrl}
                                                reviewTo={joinRequestReviewPath(row)}
                                            />
                                            {idx < joinItems.length - 1 ? (
                                                <div className="my-4 h-px bg-khabeer-stroke dark:bg-dark-border" />
                                            ) : null}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="flex min-h-[462px] min-w-0 flex-1 flex-col rounded-[14px] bg-white p-4 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none">
                            <div
                                dir={cardDir}
                                className="mb-4 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                            >
                                <h2
                                    className="min-w-0 flex-1 text-start text-2xl font-bold text-[#333] dark:text-dark-text-primary"
                                    dir={cardDir}
                                >
                                    {t('dashboard.home.newUsers')}
                                </h2>
                                <DashboardPeriodSelect
                                    className="shrink-0"
                                    period={periodNewUsers}
                                    onPeriodChange={onPeriodNewUsersChange}
                                />
                            </div>
                            <NewUsersChart newUsers={home?.newUsers} period={periodNewUsers} loading={loadingNewUsersChart} />
                        </div>
                    </section>

                    <HomeServiceAnalyticsSection
                        cardDir={cardDir}
                        topServices={home?.topServices}
                        ordersSummary={home?.ordersSummary}
                        periodTopServices={periodTopServices}
                        onPeriodTopServicesChange={onPeriodTopServicesChange}
                        periodOrdersSummary={periodOrdersSummary}
                        onPeriodOrdersSummaryChange={onPeriodOrdersSummaryChange}
                        loadingTopServices={loadingTopServices}
                        loadingOrdersSummary={loadingOrdersSummary}
                    />

                    <section
                        dir="ltr"
                        className={clsx('flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-6', language === 'en' && 'lg:flex-row-reverse')}
                    >
                        <div className="flex w-full shrink-0 flex-col gap-4 rounded-[24px] bg-white p-4 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none lg:w-[362px]">
                            <h2
                                dir={cardDir}
                                className="w-full text-start text-2xl font-bold leading-normal text-[#333] dark:text-dark-text-primary"
                            >
                                {t('dashboard.home.featuredExperts')}
                            </h2>
                            <div className="flex flex-col gap-4">
                                {featuredItems.length > 0 ? (
                                    featuredItems.map((fe, i) => (
                                        <FeaturedExpertRow
                                            key={fe.providerId || fe.firebaseUid || i}
                                            listRtl={cardDir === 'rtl'}
                                            name={fe.fullName || '—'}
                                            category={fe.serviceLabel || '—'}
                                            orders={fe.ordersCount ?? 0}
                                            rating={fe.ratingAvg != null ? String(fe.ratingAvg) : '—'}
                                            avatarUrl={fe.avatarUrl}
                                        />
                                    ))
                                ) : (
                                    <p dir={cardDir} className="py-4 text-center text-sm text-[#999] dark:text-dark-text-muted">
                                        {t('dashboard.home.noFeaturedExperts')}
                                    </p>
                                )}
                            </div>
                        </div>
                        <ExpertsMapPanel contentDir={cardDir} mapPoints={home?.mapPoints} />
                    </section>

                    <HomeReviewsAndServicesSection
                        cardDir={cardDir}
                        recentOrdersPayload={home?.recentOrders}
                        recentReviews={home?.recentReviews}
                    />
                </>
            )}
        </div>
    );
}
