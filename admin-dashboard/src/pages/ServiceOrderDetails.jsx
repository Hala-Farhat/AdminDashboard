import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
    AlertCircle,
    Ban,
    Check,
    ChevronLeft,
    ClipboardList,
    ExternalLink,
    Loader2,
    MapPin,
    Star,
    User,
    X,
} from 'lucide-react';
import AvatarOrInitial from '../components/AvatarOrInitial';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { fetchDashboardServiceRequestDetails, unwrapDashboardEnvelope } from '../api/dashboardApi';
import { getApiErrorMessage } from '../utils/providerUserManagement';

const RIYADH_CENTER = [24.7136, 46.6753];

/** دبوس خريطة فقط — التسمية تُعرض عند hover عبر Tooltip */
function pinDivIcon(color) {
    const pinW = 36;
    const pinH = 46;
    const anchorX = pinW / 2;
    const anchorY = pinH;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pinW}" height="${pinH}" viewBox="0 0 36 46" aria-hidden="true">
  <path fill="${color}" stroke="#fff" stroke-width="1.25" stroke-linejoin="round" d="M18 1.5C10.04 1.5 3.5 8.04 3.5 16c0 8.2 14.5 27.8 14.5 27.8S32.5 24.2 32.5 16C32.5 8.04 26 1.5 18 1.5z"/>
  <circle cx="18" cy="15.5" r="5.25" fill="#fff"/>
</svg>`;
    return L.divIcon({
        className: '!bg-transparent !border-0',
        html: `<div style="pointer-events:auto">${svg}</div>`,
        iconSize: [pinW, pinH],
        iconAnchor: [anchorX, anchorY],
    });
}

const mapMarkerTooltipClass =
    '!rounded-lg !border !border-khabeer-stroke !bg-white !px-2.5 !py-1.5 !text-xs !font-bold !text-[#333] !shadow-md dark:!border-dark-border dark:!bg-dark-bg-elevated dark:!text-dark-text-primary';

const MAP_PIN_EXPERT = '#dc2626';
const MAP_PIN_CLIENT = '#2563eb';

/** @param {[number, number] | null} providerPoint @param {[number, number] | null} servicePoint */
function buildGoogleMapsUrl(providerPoint, servicePoint) {
    const hasExpert =
        providerPoint && Number.isFinite(providerPoint[0]) && Number.isFinite(providerPoint[1]);
    const hasClient =
        servicePoint && Number.isFinite(servicePoint[0]) && Number.isFinite(servicePoint[1]);
    if (hasExpert && hasClient) {
        const [plat, plng] = providerPoint;
        const [clat, clng] = servicePoint;
        return `https://www.google.com/maps/dir/${plat},${plng}/${clat},${clng}`;
    }
    if (hasClient) {
        const [lat, lng] = servicePoint;
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    }
    if (hasExpert) {
        const [lat, lng] = providerPoint;
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    }
    return null;
}

/** @param {'success'|'danger'|'warning'} tone */
function TimelineStepIcon({ tone }) {
    if (tone === 'danger') {
        return (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white dark:bg-rose-500">
                <X className="size-4" strokeWidth={2.5} />
            </div>
        );
    }
    if (tone === 'warning') {
        return (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white dark:bg-orange-600">
                <Ban className="size-4" strokeWidth={2.5} />
            </div>
        );
    }
    return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500">
            <Check className="size-4" strokeWidth={2.5} />
        </div>
    );
}

/** @param {string | undefined} stepId */
function stepTone(stepId) {
    if (stepId === 'expertRejected') return 'danger';
    if (stepId === 'orderCancelled') return 'warning';
    return 'success';
}

/**
 * @param {object} step
 * @param {'ar'|'en'} lang
 * @param {(k: string, p?: object) => string} t
 */
function pickStepLabel(step, lang, t) {
    if (!step || typeof step !== 'object') return '';
    if (step.label) return String(step.label);
    const direct = lang === 'ar' ? step.labelAr || step.labelEn : step.labelEn || step.labelAr;
    if (direct) return String(direct);
    const id = step.step;
    if (!id) return '';
    const map = {
        orderCreated: () => t('serviceOrdersPage.stepOrderCreated'),
        expertAccepted: () => t('serviceOrdersPage.stepExpertAccepted'),
        expertRejected: () => t('serviceOrdersPage.stepExpertRejected'),
        serviceFinished: () => t('serviceOrdersPage.stepServiceFinished'),
        orderCancelled: () => t('serviceOrdersPage.stepOrderCancelled'),
    };
    return map[id]?.() ?? '';
}

function formatScheduledAt(iso, lang) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** @param {string | undefined} bucket */
function uiBucketToVariant(bucket) {
    if (bucket === 'completed') return 'completed';
    if (bucket === 'cancelled') return 'cancelled';
    if (bucket === 'expertRejected' || bucket === 'rejected') return 'rejected';
    if (bucket === 'inProgress') return 'in_progress';
    if (bucket === 'pendingCompletion') return 'pending_completion';
    if (bucket === 'awaitingExpert') return 'pending';
    return 'pending';
}

function variantFromSearch(searchParams) {
    const s = (searchParams.get('status') || 'pending').toLowerCase();
    if (['pending', 'completed', 'cancelled', 'in_progress', 'rejected', 'pending_completion'].includes(s)) return s;
    return 'pending';
}

function ServiceTimeline({ steps, isRTL, t, language }) {
    if (!steps?.length) {
        return (
            <div className="rounded-2xl border border-khabeer-stroke bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
                <p className="mb-2 text-[18px] font-bold text-[#333] dark:text-dark-text-primary">{t('serviceOrdersPage.timelineTitle')}</p>
                <p className="text-[14px] text-khabeer-muted dark:text-dark-text-muted">{t('serviceOrdersPage.timelineEmpty')}</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-khabeer-stroke bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
            <p className="mb-4 text-[18px] font-bold text-[#333] dark:text-dark-text-primary">{t('serviceOrdersPage.timelineTitle')}</p>
            <div className="relative flex flex-col">
                {steps.map((step, idx) => (
                    <div key={`${step.stepKey || step.step || idx}-${idx}`} className="relative flex gap-3 pb-6 last:pb-0">
                        {idx < steps.length - 1 ? (
                            <div
                                className={clsx(
                                    'absolute top-8 w-0.5 bg-emerald-600 dark:bg-emerald-500',
                                    isRTL ? 'right-[15px]' : 'left-[15px]',
                                    'h-[calc(100%-0.25rem)]'
                                )}
                                aria-hidden
                            />
                        ) : null}
                        <TimelineStepIcon tone={step.tone || 'success'} />
                        <div className="min-w-0 pt-0.5">
                            <p className="text-[14px] font-bold text-[#333] dark:text-dark-text-primary">{step.title}</p>
                            {step.at ? (
                                <p className="mt-1 text-[12px] text-khabeer-muted dark:text-dark-text-muted">
                                    {formatScheduledAt(step.at, language)}
                                </p>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** @param {{ t: function, isRTL: boolean, bodyText?: string, title?: string, tone?: 'cancel'|'reject' }} props */
function CancellationBlock({ t, isRTL, bodyText, title, tone = 'cancel' }) {
    const isReject = tone === 'reject';
    return (
        <div
            dir={isRTL ? 'rtl' : 'ltr'}
            className={clsx(
                'rounded-2xl border p-4 text-start',
                isReject
                    ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/20'
                    : 'border-orange-200 bg-orange-50/90 dark:border-orange-900/40 dark:bg-orange-950/25'
            )}
        >
            <p
                className={clsx(
                    'mb-2 text-[18px] font-bold',
                    isReject ? 'text-rose-900 dark:text-rose-200' : 'text-orange-950 dark:text-orange-100'
                )}
            >
                {title || t('serviceOrdersPage.cancelTitle')}
            </p>
            <p
                className={clsx(
                    'text-[14px] leading-relaxed',
                    isReject ? 'text-rose-900/90 dark:text-rose-100/90' : 'text-orange-950/90 dark:text-orange-100/90'
                )}
            >
                {bodyText?.trim() ? bodyText.trim() : '—'}
            </p>
        </div>
    );
}

function isPartyPresent(party) {
    return party != null && typeof party === 'object' && !Array.isArray(party);
}

/** @param {{ roleLabel: string, party?: object | null, showRating: boolean, t: (k: string) => string }} props */
function PartyCard({ roleLabel, party, showRating, t }) {
    const present = isPartyPresent(party);

    if (!present) {
        return (
            <div className="rounded-2xl border border-khabeer-stroke bg-[#f7f7f7] p-4 dark:border-dark-border dark:bg-dark-bg-tertiary">
                <div className="mb-3 flex min-h-[1.25rem] items-center justify-between gap-2">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-khabeer-muted dark:text-dark-text-muted">
                        {roleLabel}
                    </p>
                </div>
                <div className="flex items-start gap-3">
                    <div
                        className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-khabeer-stroke bg-slate-200 dark:border-dark-border dark:bg-slate-700/50"
                        aria-hidden
                    >
                        <User className="size-6 text-slate-500 dark:text-slate-400" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-khabeer-muted dark:text-dark-text-muted">
                            {t('serviceOrdersPage.deletedAccount')}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const name = party.displayName || party.name || party.fullName || party.email || '—';
    const emailRaw = party.email ?? party.userEmail ?? party.contactEmail;
    const emailLine =
        emailRaw != null && String(emailRaw).trim() !== '' ? String(emailRaw).trim() : '';
    const rawRating = party.rating ?? party.averageRating ?? party.expertRating;
    const ratingNum = Number(rawRating);
    const avatarUrl = party.avatarUrl || party.avatar || party.profileImageUrl;
    const showRatingPill = showRating && Number.isFinite(ratingNum);

    return (
        <div className="rounded-2xl border border-khabeer-stroke bg-[#f7f7f7] p-4 dark:border-dark-border dark:bg-dark-bg-tertiary">
            <div className="mb-3 flex min-h-[1.25rem] items-center justify-between gap-2">
                <p className="text-[12px] font-bold uppercase tracking-wide text-khabeer-muted dark:text-dark-text-muted">
                    {roleLabel}
                </p>
                {showRatingPill ? (
                    <p className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-amber-700 dark:text-amber-300">
                        {ratingNum.toFixed(1)}
                        <Star className="size-4 fill-amber-400 text-amber-500" aria-hidden />
                    </p>
                ) : null}
            </div>
            <div className="flex items-start gap-3">
                <div className="size-11 shrink-0 overflow-hidden rounded-full border border-khabeer-stroke bg-white dark:border-dark-border dark:bg-dark-bg-secondary">
                    <AvatarOrInitial name={name} avatarUrl={avatarUrl} className="text-[15px]" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-[#333] dark:text-dark-text-primary">{name}</p>
                    {emailLine ? (
                        <p className="mt-1 break-all text-[12px] leading-snug text-[#666] dark:text-dark-text-secondary">
                            {emailLine}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function attachmentUrl(a) {
    if (!a) return null;
    if (typeof a === 'string') return a;
    return a.url || a.fileUrl || a.path || null;
}

function MapSection({ t, address, providerAddress, servicePoint, providerPoint }) {
    /** Leaflet + react-leaflet: mount بعد أول paint يقلّل تعارض React 18 StrictMode مع تهيئة الخريطة */
    const [mapReady, setMapReady] = useState(false);
    useEffect(() => {
        setMapReady(true);
    }, []);

    const hasClient = servicePoint && Number.isFinite(servicePoint[0]) && Number.isFinite(servicePoint[1]);
    const hasExpert = providerPoint && Number.isFinite(providerPoint[0]) && Number.isFinite(providerPoint[1]);
    const line = hasClient && hasExpert ? [providerPoint, servicePoint] : null;
    const center =
        hasClient && hasExpert
            ? [(servicePoint[0] + providerPoint[0]) / 2, (servicePoint[1] + providerPoint[1]) / 2]
            : hasClient
              ? servicePoint
              : hasExpert
                ? providerPoint
                : RIYADH_CENTER;
    const zoom = hasClient && hasExpert ? 11 : hasClient || hasExpert ? 13 : 12;

    const expertLabel = t('serviceOrdersPage.expertLocationHeading');
    const clientLabel = t('serviceOrdersPage.clientLocationHeading');
    const googleMapsUrl = buildGoogleMapsUrl(providerPoint, servicePoint);

    return (
        <div className="rounded-2xl border border-khabeer-stroke bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
            <div className="mb-4 flex items-center gap-2 text-[16px] font-bold text-[#333] dark:text-dark-text-primary">
                <MapPin className="size-5 shrink-0 text-khabeer-brand dark:text-dark-accent-blue" strokeWidth={1.75} />
                {t('serviceOrdersPage.serviceAddressTitle')}
            </div>

            <div className="mb-3 space-y-1">
                <p className="text-[15px] font-bold text-[#333] dark:text-dark-text-primary">{expertLabel}</p>
                <p className="text-[14px] leading-relaxed text-[#666] dark:text-dark-text-secondary">
                    {providerAddress?.trim() || '—'}
                </p>
            </div>
            <div className="mb-4 space-y-1">
                <p className="text-[15px] font-bold text-[#333] dark:text-dark-text-primary">{clientLabel}</p>
                <p className="text-[14px] leading-relaxed text-[#666] dark:text-dark-text-secondary">
                    {address?.trim() || '—'}
                </p>
            </div>

            {!hasClient && !hasExpert ? (
                <p className="text-[14px] text-khabeer-muted dark:text-dark-text-muted">{t('serviceOrdersPage.mapNoLocation')}</p>
            ) : !mapReady ? (
                <div className="relative z-0 flex h-[300px] items-center justify-center overflow-hidden rounded-xl border border-khabeer-stroke dark:border-dark-border">
                    <Loader2 className="size-8 animate-spin text-khabeer-brand dark:text-dark-accent-blue" />
                </div>
            ) : (
                <div className="relative z-0 h-[300px] overflow-hidden rounded-xl border border-khabeer-stroke dark:border-dark-border">
                    <MapContainer center={center} zoom={zoom} className="size-full" scrollWheelZoom={false}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                        {line && line.length === 2 ? (
                            <Polyline
                                positions={line}
                                pathOptions={{ color: '#64748b', dashArray: '8 8', weight: 2.5, opacity: 0.85 }}
                            />
                        ) : null}
                        {hasExpert ? (
                            <Marker position={providerPoint} icon={pinDivIcon(MAP_PIN_EXPERT)}>
                                <Tooltip
                                    direction="top"
                                    offset={[0, -8]}
                                    opacity={1}
                                    permanent={false}
                                    className={mapMarkerTooltipClass}
                                >
                                    {expertLabel}
                                </Tooltip>
                            </Marker>
                        ) : null}
                        {hasClient ? (
                            <Marker position={servicePoint} icon={pinDivIcon(MAP_PIN_CLIENT)}>
                                <Tooltip
                                    direction="top"
                                    offset={[0, -8]}
                                    opacity={1}
                                    permanent={false}
                                    className={mapMarkerTooltipClass}
                                >
                                    {clientLabel}
                                </Tooltip>
                            </Marker>
                        ) : null}
                    </MapContainer>
                </div>
            )}
            {googleMapsUrl ? (
                <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-khabeer-stroke bg-white px-4 py-3 text-[14px] font-semibold text-khabeer-brand shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors hover:bg-slate-50 dark:border-dark-border dark:bg-dark-bg-secondary dark:text-dark-accent-blue dark:hover:bg-dark-bg-tertiary"
                >
                    <ExternalLink className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                    {t('serviceOrdersPage.openDetailsOnGoogleMaps')}
                </a>
            ) : null}
        </div>
    );
}

export default function ServiceOrderDetails() {
    const { orderId } = useParams();
    const [searchParams] = useSearchParams();
    const { token } = useAuth();
    const { language, t } = useLanguage();
    const toast = useToast();
    const isRTL = language === 'ar';

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async (opts = {}) => {
        const silent = Boolean(opts.silent);
        if (!token || !orderId) {
            setDetail(null);
            setLoading(false);
            setError(!orderId ? t('common.error') : null);
            return;
        }
        if (!silent) {
            setLoading(true);
        }
        setError(null);
        try {
            const res = await fetchDashboardServiceRequestDetails(token, orderId, { lang: language });
            const data = unwrapDashboardEnvelope(res);
            setDetail(data && typeof data === 'object' ? data : null);
        } catch (err) {
            console.error(err);
            if (silent) return;
            const msg = getApiErrorMessage(err) || t('common.error');
            setError(msg);
            setDetail(null);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, [token, orderId, language, t, toast]);

    useEffect(() => {
        load();
    }, [load]);

    /** إشعار FCM يحدّث قائمة الطلبات عبر React Query؛ هذه الصفحة كانت تبقى على لقطة قديمة — نعيد الجلب عند تطابق الطلب. */
    useEffect(() => {
        const onDataRefresh = (e) => {
            const scopes = e?.detail?.scopes;
            if (!Array.isArray(scopes) || !scopes.includes('serviceRequests')) return;
            const notifiedId = e?.detail?.orderId != null ? String(e.detail.orderId).trim() : '';
            const currentId = orderId != null ? String(orderId).trim() : '';
            if (notifiedId && currentId && notifiedId !== currentId) return;
            void load({ silent: true });
        };
        window.addEventListener('admin-dashboard-data-refresh', onDataRefresh);
        return () => window.removeEventListener('admin-dashboard-data-refresh', onDataRefresh);
    }, [load, orderId]);

    const variant = useMemo(() => {
        if (detail?.uiBucket) return uiBucketToVariant(detail.uiBucket);
        return variantFromSearch(searchParams);
    }, [detail, searchParams]);

    const statusLabelDisplay = useMemo(() => {
        if (!detail) return '';
        if (detail.statusLabel) return String(detail.statusLabel);
        return language === 'ar' ? detail.statusLabelAr || detail.statusLabelEn : detail.statusLabelEn || detail.statusLabelAr;
    }, [detail, language]);

    const statusBadge = useMemo(() => {
        const map = {
            pending: {
                label: t('serviceOrdersPage.statusAwaitingExpert'),
                class: 'bg-[#0077b6] text-white dark:bg-khabeer-brand dark:text-white',
            },
            in_progress: {
                label: t('serviceOrdersPage.statusInProgress'),
                class: 'bg-amber-500 text-white dark:bg-amber-600 dark:text-white',
            },
            pending_completion: {
                label: t('serviceOrdersPage.statusPendingCompletion'),
                class: 'bg-sky-600 text-white dark:bg-sky-600 dark:text-white',
            },
            completed: {
                label: t('serviceOrdersPage.statusCompleted'),
                class: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
            },
            cancelled: {
                label: t('serviceOrdersPage.statusCancelled'),
                class: 'bg-orange-500 text-white dark:bg-orange-600 dark:text-white',
            },
            rejected: {
                label: t('serviceOrdersPage.statusRejectedExpert'),
                class: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-white',
            },
        };
        const base = map[variant] || map.pending;
        if (statusLabelDisplay) {
            return { ...base, label: statusLabelDisplay };
        }
        return base;
    }, [t, variant, statusLabelDisplay]);

    const scheduledFormatted = useMemo(
        () => (detail?.scheduledAt ? formatScheduledAt(detail.scheduledAt, language) : '—'),
        [detail, language]
    );

    const specializationDisplay = useMemo(() => {
        const spec = detail?.specialization;
        if (!spec) return '';
        if (typeof spec === 'string') return spec.trim();
        if (typeof spec === 'object') {
            return language === 'ar'
                ? spec.nameAr || spec.label || spec.nameEn || ''
                : spec.nameEn || spec.label || spec.nameAr || '';
        }
        return '';
    }, [detail, language]);

    const cancelReasonText = useMemo(() => {
        const r = detail?.cancelReason;
        return typeof r === 'string' && r.trim() ? r.trim() : '';
    }, [detail]);

    const timelineSteps = useMemo(() => {
        const raw = detail?.completedSteps;
        if (!Array.isArray(raw)) return [];
        return raw.map((s) => ({
            stepKey: s.step,
            title: pickStepLabel(s, language, t),
            at: s.at,
            tone: stepTone(s.step),
        }));
    }, [detail, language, t]);

    const servicePoint = useMemo(() => {
        const lat = detail?.location?.lat;
        const lng = detail?.location?.lng;
        if (lat == null || lng == null) return null;
        const la = Number(lat);
        const ln = Number(lng);
        if (Number.isNaN(la) || Number.isNaN(ln)) return null;
        return [la, ln];
    }, [detail]);

    const providerPoint = useMemo(() => {
        const lat = detail?.providerLocation?.lat;
        const lng = detail?.providerLocation?.lng;
        if (lat == null || lng == null) return null;
        const la = Number(lat);
        const ln = Number(lng);
        if (Number.isNaN(la) || Number.isNaN(ln)) return null;
        return [la, ln];
    }, [detail]);

    const attachments = useMemo(() => {
        const raw = detail?.attachments;
        if (!Array.isArray(raw)) return [];
        return raw.map(attachmentUrl).filter(Boolean);
    }, [detail]);

    /** رقم الخدمة المعروض في العنوان — من الحقل orderNumber فقط (بدون UUID) */
    const headingOrderNumber = useMemo(() => {
        const n = detail?.orderNumber;
        if (n == null) return '—';
        const s = String(n).trim();
        return s || '—';
    }, [detail]);

    const descriptionText =
        typeof detail?.description === 'string' && detail.description.trim() ? detail.description.trim() : '—';

    if (loading) {
        return (
            <div dir={isRTL ? 'rtl' : 'ltr'} className="flex min-h-[40vh] w-full max-w-6xl items-center justify-center">
                <Loader2 className="size-10 animate-spin text-khabeer-brand dark:text-dark-accent-blue" />
            </div>
        );
    }

    if (error || !detail) {
        return (
            <div dir={isRTL ? 'rtl' : 'ltr'} className="flex w-full max-w-6xl flex-col gap-4">
                <Link
                    to="/dashboard/service-orders"
                    className="inline-flex w-fit items-center gap-2 text-[14px] font-medium text-khabeer-brand hover:underline dark:text-dark-accent-blue"
                >
                    <ChevronLeft className={clsx('size-4', isRTL && 'rotate-180')} />
                    {t('dashboard.breadcrumb.serviceOrders')}
                </Link>
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50/80 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                    <AlertCircle className="size-5 shrink-0" />
                    {error || t('common.noData')}
                </div>
            </div>
        );
    }

    return (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="flex w-full max-w-6xl flex-col gap-6">
            <Link
                to="/dashboard/service-orders"
                className="inline-flex w-fit items-center gap-2 text-[14px] font-medium text-khabeer-brand hover:underline dark:text-dark-accent-blue"
            >
                <ChevronLeft className={clsx('size-4', isRTL && 'rotate-180')} />
                {t('dashboard.breadcrumb.serviceOrders')}
            </Link>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-[32px] font-bold text-khabeer-brand dark:text-dark-accent-blue">
                        {t('serviceOrdersPage.detailPageHeading', { value: headingOrderNumber })}
                    </h1>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {specializationDisplay ? (
                            <span className="rounded-full bg-[#f0f0f0] px-3 py-1.5 text-[14px] text-[#333] dark:bg-dark-bg-tertiary dark:text-dark-text-primary">
                                {t('serviceOrdersPage.metaSpecialty', { value: specializationDisplay })}
                            </span>
                        ) : null}
                        <span className="rounded-full bg-[#f0f0f0] px-3 py-1.5 text-[14px] text-[#333] dark:bg-dark-bg-tertiary dark:text-dark-text-primary">
                            {t('serviceOrdersPage.metaStart', { value: scheduledFormatted })}
                        </span>
                    </div>
                </div>
                <span
                    className={clsx(
                        'inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[14px] font-semibold',
                        statusBadge.class
                    )}
                >
                    {statusBadge.label}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PartyCard
                    t={t}
                    roleLabel={t('serviceOrdersPage.labelClient')}
                    party={detail?.client}
                    showRating={false}
                />
                <PartyCard t={t} roleLabel={t('serviceOrdersPage.labelExpert')} party={detail?.expert} showRating />
            </div>

            <div className="rounded-2xl border border-khabeer-stroke bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
                <div className="mb-3 flex items-center gap-2 text-[18px] font-bold text-[#333] dark:text-dark-text-primary">
                    <ClipboardList className="size-5 text-khabeer-brand dark:text-dark-accent-blue" strokeWidth={1.75} />
                    {t('serviceOrdersPage.problemTitle')}
                </div>
                <div className="rounded-xl bg-[#f7f7f7] p-4 text-[14px] leading-relaxed text-[#666] dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
                    {descriptionText}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="flex flex-col gap-4 lg:col-span-4">
                    <ServiceTimeline steps={timelineSteps} isRTL={isRTL} t={t} language={language} />
                    {variant === 'rejected' ? (
                        <CancellationBlock
                            t={t}
                            isRTL={isRTL}
                            tone="reject"
                            title={t('serviceOrdersPage.expertRejectedTitle')}
                            bodyText={cancelReasonText}
                        />
                    ) : null}
                    {variant === 'cancelled' ? (
                        <CancellationBlock t={t} isRTL={isRTL} bodyText={cancelReasonText} />
                    ) : null}
                </div>
                <div className="flex flex-col gap-4 lg:col-span-8">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <MapSection
                            t={t}
                            address={detail.address}
                            providerAddress={detail.providerAddress}
                            servicePoint={servicePoint}
                            providerPoint={providerPoint}
                        />
                        <div className="rounded-2xl border border-khabeer-stroke bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
                            <p className="mb-3 text-[18px] font-bold text-[#333] dark:text-dark-text-primary">
                                {t('serviceOrdersPage.photosTitle')}
                            </p>
                            {attachments.length === 0 ? (
                                <p className="text-[14px] text-khabeer-muted dark:text-dark-text-muted">{t('serviceOrdersPage.noAttachments')}</p>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {attachments.map((src) => (
                                        <a
                                            key={src}
                                            href={src}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="aspect-square overflow-hidden rounded-xl border border-khabeer-stroke dark:border-dark-border"
                                        >
                                            <img src={src} alt="" className="size-full object-cover" />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
