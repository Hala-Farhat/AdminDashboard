import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    ChevronDown,
    Eye,
    FileText,
    Hourglass,
    Loader2,
    Search,
    XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { fetchDashboardServiceRequests, parseServiceRequestsListResponse } from '../api/dashboardApi';
import { catalogApi } from '../api/catalogApi';
import { listQueryDefaults } from '../lib/liveRefresh';
import { getApiErrorMessage } from '../utils/providerUserManagement';

const PAGE_SIZE = 10;

/** دمج تخصصات من عدة مصادر (نفس منطق Providers) */
function mergeSpecializationRecords(prev, incoming) {
    const base = Array.isArray(prev) ? prev : [];
    if (!Array.isArray(incoming) || incoming.length === 0) return base;
    const map = new Map();
    for (const s of base) {
        const id = s?.id ?? s?.subCategoryId;
        if (id != null && id !== '') map.set(String(id), s);
    }
    for (const s of incoming) {
        const id = s?.id ?? s?.subCategoryId;
        if (id == null || id === '') continue;
        const key = String(id);
        const existing = map.get(key);
        map.set(key, existing && typeof existing === 'object' ? { ...existing, ...s } : s);
    }
    return Array.from(map.values());
}

function mapSpecializationsToFilterOptions(items, language) {
    if (!Array.isArray(items)) return [];
    return items
        .map((s) => {
            const id = s.id ?? s.subCategoryId;
            if (id == null || id === '') return null;
            const label =
                language === 'ar'
                    ? s.nameAr ?? s.nameEn ?? s.name ?? s.label ?? String(id)
                    : s.nameEn ?? s.nameAr ?? s.name ?? s.label ?? String(id);
            return { id: String(id), label: label || '—' };
        })
        .filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label, language === 'ar' ? 'ar' : 'en'));
}

function StatusPill({ type, label }) {
    const styles = {
        awaiting: 'bg-[#0077b6] text-white dark:bg-khabeer-brand dark:text-white',
        in_progress: 'bg-amber-500 text-white dark:bg-amber-600 dark:text-white',
        pending_completion: 'bg-sky-600 text-white dark:bg-sky-600 dark:text-white',
        completed: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
        cancelled: 'bg-orange-500 text-white dark:bg-orange-600 dark:text-white',
        rejected: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-white',
    };
    return (
        <span
            className={clsx(
                'inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[12px] font-medium leading-tight',
                styles[type] || styles.awaiting
            )}
        >
            <span className="truncate">{label}</span>
        </span>
    );
}

/** @param {string | undefined} bucket */
function uiBucketToPillType(bucket) {
    if (bucket === 'awaitingExpert') return 'awaiting';
    if (bucket === 'inProgress') return 'in_progress';
    if (bucket === 'pendingCompletion') return 'pending_completion';
    if (bucket === 'completed') return 'completed';
    if (bucket === 'cancelled') return 'cancelled';
    if (bucket === 'expertRejected' || bucket === 'rejected') return 'rejected';
    return 'awaiting';
}

/** Query param for detail page (pending | in_progress | completed | cancelled | rejected) */
function detailStatusParamFromBucket(bucket) {
    if (bucket === 'awaitingExpert') return 'pending';
    if (bucket === 'inProgress') return 'in_progress';
    if (bucket === 'pendingCompletion') return 'pending_completion';
    if (bucket === 'completed') return 'completed';
    if (bucket === 'cancelled') return 'cancelled';
    if (bucket === 'expertRejected' || bucket === 'rejected') return 'rejected';
    return 'pending';
}

function formatScheduledAt(iso, lang) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export default function ServiceOrders() {
    const { token } = useAuth();
    const { language, t } = useLanguage();
    const toast = useToast();
    const isRTL = language === 'ar';

    const [page, setPage] = useState(1);
    const [statusGroup, setStatusGroup] = useState('all');
    const [bookingPreset, setBookingPreset] = useState('all');
    const [specialtyFilter, setSpecialtyFilter] = useState('all');
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    /** فلتر التخصص: إن لم يُرسل الباكند `specializations` في رد طلبات الخدمة، نملأ من الكتالوج مثل Providers */
    const [catalogSpecializations, setCatalogSpecializations] = useState([]);

    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
        return () => clearTimeout(id);
    }, [searchInput]);

    /** تخصصات الفلتر من الكتالوج (مثل Providers) إذا رد طلبات الخدمة لا يحتوي `specializations` */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!token) {
                setCatalogSpecializations([]);
                return;
            }
            try {
                const res = await catalogApi.getCategories(token);
                const body = res?.data;
                if (!body?.success || cancelled) return;
                const raw = body.data;
                const categoriesList = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
                const collected = [];
                await Promise.all(
                    categoriesList.map(async (cat) => {
                        const catId = cat.categoryId ?? cat.id;
                        if (!catId) return;
                        try {
                            const subRes = await catalogApi.getCategory(token, catId);
                            const subBody = subRes?.data;
                            if (!subBody?.success || !subBody.data) return;
                            const subs = subBody.data.subCategories ?? [];
                            for (const sub of subs) {
                                const sid = sub.subCategoryId ?? sub.id;
                                if (sid == null || sid === '') continue;
                                collected.push({
                                    id: sid,
                                    subCategoryId: sid,
                                    nameAr: sub.nameAr ?? sub.name ?? '',
                                    nameEn: sub.nameEn ?? sub.name ?? '',
                                });
                            }
                        } catch {
                            /* تجاهل فئة فاشلة */
                        }
                    })
                );
                if (!cancelled) setCatalogSpecializations(collected);
            } catch {
                if (!cancelled) setCatalogSpecializations([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const bookingPresets = useMemo(
        () => [
            { key: 'all', label: t('providers.filterAll') },
            { key: 'day', label: t('providers.joinDateToday') },
            { key: 'week', label: t('providers.joinDateWeek') },
            { key: 'month', label: t('providers.joinDateMonth') },
            { key: 'year', label: t('providers.joinDateYear') },
        ],
        [t]
    );

    const mapApiRow = useCallback(
        (item) => {
            const spec = item.specialization;
            const specialtyLabel =
                spec?.label ||
                (language === 'ar' ? spec?.nameAr : spec?.nameEn) ||
                spec?.nameAr ||
                spec?.nameEn ||
                '—';
            return {
                orderId: item.orderId,
                orderNumber: item.orderNumber || item.orderId,
                address: item.serviceExecutionAddress || '—',
                specialty: specialtyLabel,
                specialtyId: item.subCategoryId ?? spec?.id ?? spec?.subCategoryId ?? null,
                scheduledAt: item.scheduledAt,
                date: formatScheduledAt(item.scheduledAt, language),
                uiBucket: item.uiBucket,
                pillType: uiBucketToPillType(item.uiBucket),
                statusLabel:
                    item.statusLabel ||
                    (language === 'ar' ? item.statusLabelAr : item.statusLabelEn) ||
                    item.statusLabelAr ||
                    item.statusLabelEn ||
                    '—',
            };
        },
        [language]
    );

    const listQuery = useQuery({
        queryKey: [
            'dashboard',
            'serviceRequests',
            token,
            language,
            page,
            bookingPreset,
            statusGroup,
            specialtyFilter,
            debouncedSearch,
        ],
        queryFn: async () => {
            const res = await fetchDashboardServiceRequests(token, {
                lang: language,
                page,
                limit: PAGE_SIZE,
                bookingPeriod: bookingPreset,
                statusGroup,
                subCategoryId: specialtyFilter !== 'all' ? specialtyFilter : undefined,
                search: debouncedSearch || undefined,
            });
            return parseServiceRequestsListResponse(res);
        },
        enabled: Boolean(token),
        placeholderData: keepPreviousData,
        ...listQueryDefaults,
    });

    const parsed = listQuery.data;
    const rows = useMemo(
        () => (parsed?.data || []).map(mapApiRow),
        [parsed, mapApiRow]
    );
    const specializations = parsed?.specializations || [];
    const summary =
        parsed?.summary && typeof parsed.summary === 'object' ? parsed.summary : {};
    const listMeta = useMemo(() => {
        const meta = parsed?.meta || {};
        const totalPages = Math.max(1, Number(meta.totalPages) || 1);
        const hasNext =
            meta.hasNextPage !== undefined && meta.hasNextPage !== null
                ? Boolean(meta.hasNextPage)
                : page < totalPages;
        const hasPrev =
            meta.hasPreviousPage !== undefined && meta.hasPreviousPage !== null
                ? Boolean(meta.hasPreviousPage)
                : page > 1;
        return {
            total: Number(meta.total) || 0,
            totalPages,
            hasNextPage: hasNext,
            hasPreviousPage: hasPrev,
        };
    }, [parsed, page]);

    const specialtyOptions = useMemo(() => {
        const merged = mergeSpecializationRecords(catalogSpecializations, specializations);
        const opts = mapSpecializationsToFilterOptions(merged, language);
        if (opts.length > 0) return opts;
        const map = new Map();
        rows.forEach((r) => {
            if (r.specialtyId && r.specialty && r.specialty !== '—') {
                map.set(String(r.specialtyId), r.specialty);
            }
        });
        return Array.from(map.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label, language === 'ar' ? 'ar' : 'en'));
    }, [catalogSpecializations, specializations, rows, language]);

    const loading = Boolean(token) && listQuery.isPending;
    const error =
        listQuery.isError && listQuery.error
            ? getApiErrorMessage(listQuery.error) || t('common.error')
            : null;

    useEffect(() => {
        if (!listQuery.isError || !listQuery.error) return;
        if (listQuery.data != null) return;
        toast.error(getApiErrorMessage(listQuery.error) || t('common.error'));
    }, [listQuery.isError, listQuery.error, listQuery.data, t]);

    useEffect(() => {
        setPage(1);
    }, [bookingPreset, statusGroup, specialtyFilter, debouncedSearch]);

    useEffect(() => {
        const tp = listMeta.totalPages || 1;
        if (page > tp) setPage(tp);
    }, [listMeta.totalPages, page]);

    useEffect(() => {
        if (specialtyFilter === 'all') return;
        if (!specialtyOptions.some((o) => o.id === specialtyFilter)) {
            setSpecialtyFilter('all');
        }
    }, [specialtyOptions, specialtyFilter]);

    const pageCount = Math.max(1, listMeta.totalPages || 1);
    const pageSafe = Math.min(page, pageCount);

    const paginationNums = useMemo(() => {
        const total = pageCount;
        const cur = pageSafe;
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        const nums = new Set([1, total, cur, cur - 1, cur + 1]);
        const sorted = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
        const out = [];
        let prev = 0;
        sorted.forEach((n) => {
            if (prev && n - prev > 1) out.push('…');
            out.push(n);
            prev = n;
        });
        return out;
    }, [pageCount, pageSafe]);

    const stats = useMemo(
        () => [
            {
                label: t('serviceOrdersPage.statTotal'),
                value: String(summary.total ?? summary.Total ?? 0),
                icon: FileText,
                iconWrap: 'bg-[#0077b6] text-white dark:bg-khabeer-brand dark:text-white',
            },
            {
                label: t('serviceOrdersPage.statCompleted'),
                value: String(summary.completed ?? summary.Completed ?? 0),
                icon: CheckCircle2,
                iconWrap: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
            },
            {
                label: t('serviceOrdersPage.statInProgress'),
                value: String(summary.inProgress ?? summary.in_progress ?? 0),
                icon: Hourglass,
                iconWrap: 'bg-amber-500 text-white dark:bg-amber-600 dark:text-white',
            },
            {
                label: t('serviceOrdersPage.statCancelled'),
                value: String(summary.cancelled ?? summary.canceled ?? 0),
                icon: XCircle,
                iconWrap: 'bg-orange-500 text-white dark:bg-orange-600 dark:text-white',
            },
        ],
        [summary, t]
    );

    return (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="flex w-full flex-col gap-6">
            <div>
                <h1 className="text-[32px] font-bold leading-tight text-khabeer-brand dark:text-dark-accent-blue">
                    {t('serviceOrdersPage.title')}
                </h1>
                <p className="mt-1 text-[16px] text-khabeer-muted dark:text-dark-text-secondary">
                    {t('serviceOrdersPage.subtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((s) => (
                    <div
                        key={s.label}
                        className={clsx(
                            'flex items-center gap-4 rounded-2xl border border-khabeer-stroke bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary',
                            isRTL && 'flex-row-reverse'
                        )}
                    >
                        <div
                            className={clsx(
                                'flex size-12 shrink-0 items-center justify-center rounded-2xl',
                                s.iconWrap
                            )}
                        >
                            <s.icon className="size-6" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1 text-start">
                            <p className="text-[14px] text-khabeer-muted dark:text-dark-text-secondary">{s.label}</p>
                            <p className="text-[24px] font-bold leading-tight text-[#333] dark:text-dark-text-primary">
                                {s.value}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="overflow-visible rounded-2xl border border-khabeer-stroke/80 bg-white shadow-[0_1px_2px_0_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
                <div className="relative z-20 flex flex-wrap items-start gap-3 p-4 dark:border-dark-border lg:gap-4 lg:p-5">
                    <div className="w-[150px] min-w-[130px] max-w-[170px] shrink-0">
                        <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                            {t('serviceOrdersPage.filterBookingDate')}
                        </label>
                        <div className="relative">
                            <select
                                value={bookingPreset}
                                onChange={(e) => {
                                    setBookingPreset(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full appearance-none rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                            >
                                {bookingPresets.map((o) => (
                                    <option key={o.key} value={o.key}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                            <Calendar className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-khabeer-muted" />
                        </div>
                    </div>
                    <div className="w-[220px] min-w-[180px] max-w-[260px] shrink-0">
                        <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                            {t('serviceOrdersPage.filterSpecialty')}
                        </label>
                        <div className="relative">
                            <select
                                value={specialtyFilter}
                                onChange={(e) => {
                                    setSpecialtyFilter(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full appearance-none rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                            >
                                <option value="all">{t('providers.filterAll')}</option>
                                {specialtyOptions.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown
                                className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-khabeer-muted"
                                strokeWidth={1.5}
                            />
                        </div>
                    </div>
                    <div className="min-w-[140px] max-w-[160px] shrink-0 flex-none">
                        <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                            {t('serviceOrdersPage.filterServiceStatus')}
                        </label>
                        <div className="relative">
                            <select
                                value={statusGroup}
                                onChange={(e) => {
                                    setStatusGroup(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full appearance-none rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                            >
                                <option value="all">{t('serviceOrdersPage.statusAll')}</option>
                                <option value="awaitingExpert">{t('serviceOrdersPage.statusAwaitingExpert')}</option>
                                <option value="inProgress">{t('serviceOrdersPage.statusInProgress')}</option>
                                <option value="pendingCompletion">{t('serviceOrdersPage.statusPendingCompletion')}</option>
                                <option value="completed">{t('serviceOrdersPage.statusCompleted')}</option>
                                <option value="cancelled">{t('serviceOrdersPage.statusCancelled')}</option>
                                <option value="rejected">{t('serviceOrdersPage.statusRejected')}</option>
                            </select>
                            <ChevronDown
                                className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-khabeer-muted"
                                strokeWidth={1.5}
                            />
                        </div>
                    </div>
                    <div className="min-w-[145px] max-w-[240px] flex-1 basis-[175px]">
                        <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                            {t('common.search')}
                        </label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-khabeer-muted" strokeWidth={1.5} />
                            <input
                                type="search"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder={`${t('common.search')}...`}
                                className="w-full rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                                aria-label={t('common.search')}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-khabeer-stroke bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex h-64 items-center justify-center">
                            <Loader2 className="size-8 animate-spin text-khabeer-brand dark:text-dark-accent-blue" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 p-6 text-red-600 dark:text-red-400">
                            <AlertCircle className="size-5 shrink-0" />
                            {error}
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="p-10 text-center text-khabeer-muted dark:text-dark-text-muted">
                            {t('serviceOrdersPage.noResults')}
                        </div>
                    ) : (
                        <table className="w-full min-w-[640px] border-collapse text-[14px]">
                            <thead>
                                <tr className="bg-[#e7e7e7] text-center text-[16px] font-bold text-[#333] dark:bg-dark-bg-tertiary dark:text-dark-text-primary">
                                    <th className="px-2 py-3">{t('serviceOrdersPage.tableId')}</th>
                                    <th className="min-w-[160px] px-2 py-3">{t('serviceOrdersPage.tableAddress')}</th>
                                    <th className="px-2 py-3">{t('serviceOrdersPage.tableSpecialty')}</th>
                                    <th className="px-2 py-3">{t('serviceOrdersPage.tableBookingDate')}</th>
                                    <th className="px-2 py-3">{t('serviceOrdersPage.tableStatus')}</th>
                                    <th className="w-24 px-2 py-3">{t('serviceOrdersPage.tableActions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <tr
                                        key={row.orderId || `${row.orderNumber}-${i}`}
                                        className={clsx(
                                            'border-b border-khabeer-stroke dark:border-dark-border',
                                            i % 2 === 1 ? 'bg-[#f7f7f7] dark:bg-dark-bg-tertiary/50' : 'bg-white dark:bg-dark-bg-secondary'
                                        )}
                                    >
                                        <td className="px-2 py-3 text-center align-middle font-medium text-[#333] dark:text-dark-text-primary">
                                            {row.orderNumber}
                                        </td>
                                        <td className="px-2 py-3 text-center align-middle font-medium text-[#333] dark:text-dark-text-primary">
                                            <div className="flex justify-center">
                                                <span
                                                    className="max-w-[min(280px,40vw)] truncate whitespace-nowrap"
                                                    title={row.address}
                                                >
                                                    {row.address}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center align-middle text-[#333] dark:text-dark-text-primary">
                                            {row.specialty}
                                        </td>
                                        <td className="px-2 py-3 text-center align-middle text-[#333] dark:text-dark-text-primary">
                                            {row.date}
                                        </td>
                                        <td className="px-2 py-3 text-center align-middle">
                                            <div className="flex justify-center">
                                                <StatusPill type={row.pillType} label={row.statusLabel} />
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center align-middle">
                                            <div className="flex justify-center">
                                                <Link
                                                    to={`/dashboard/service-orders/${encodeURIComponent(row.orderId)}?status=${detailStatusParamFromBucket(row.uiBucket)}`}
                                                    className="inline-flex size-9 items-center justify-center rounded-lg text-khabeer-muted transition-colors hover:bg-gray-100 hover:text-khabeer-brand dark:hover:bg-dark-bg-tertiary dark:hover:text-dark-accent-blue"
                                                    title={t('serviceOrdersPage.viewDetails')}
                                                    aria-label={t('serviceOrdersPage.viewDetails')}
                                                >
                                                    <Eye className="size-5" strokeWidth={1.75} />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {!loading && !error && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-khabeer-stroke px-4 py-4 dark:border-dark-border sm:px-5">
                        <p className="text-[14px] text-khabeer-muted dark:text-dark-text-muted">
                            {listMeta.total} {isRTL ? 'سجل' : 'records'}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={pageSafe <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-khabeer-stroke bg-white text-[18px] font-medium leading-none text-khabeer-brand transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-accent-blue dark:hover:bg-dark-bg-elevated"
                                aria-label={t('serviceOrdersPage.paginationPrev')}
                            >
                                <span className="sr-only">{t('serviceOrdersPage.paginationPrev')}</span>
                                {isRTL ? '›' : '‹'}
                            </button>
                            {paginationNums.map((n, i) =>
                                n === '…' ? (
                                    <span key={`e-${i}`} className="px-2 text-[14px] text-khabeer-muted dark:text-dark-text-muted">
                                        …
                                    </span>
                                ) : (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => typeof n === 'number' && setPage(n)}
                                        className={clsx(
                                            'flex min-w-[36px] shrink-0 items-center justify-center rounded-lg border px-2 py-2 text-[14px] font-medium transition-colors',
                                            n === pageSafe
                                                ? 'border-khabeer-brand bg-khabeer-brand text-white dark:border-dark-accent-blue dark:bg-dark-accent-blue'
                                                : 'border-khabeer-stroke bg-white text-[#333] hover:bg-gray-50 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary dark:hover:bg-dark-bg-elevated'
                                        )}
                                    >
                                        {n}
                                    </button>
                                )
                            )}
                            <button
                                type="button"
                                disabled={pageSafe >= pageCount}
                                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-khabeer-stroke bg-white text-[18px] font-medium leading-none text-khabeer-brand transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-accent-blue dark:hover:bg-dark-bg-elevated"
                                aria-label={t('serviceOrdersPage.paginationNext')}
                            >
                                <span className="sr-only">{t('serviceOrdersPage.paginationNext')}</span>
                                {isRTL ? '‹' : '›'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
