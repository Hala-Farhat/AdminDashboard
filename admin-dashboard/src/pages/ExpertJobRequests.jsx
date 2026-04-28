import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
    fetchDashboardCatalog,
    fetchDashboardJobs,
    mapJobsCreatedPeriod,
    parseDashboardCatalogResponse,
    parseJoinRequestsListResponse,
    patchDashboardJobRead,
} from '../api/dashboardApi';
import { useToast } from '../context/ToastContext';
import { listQueryDefaults } from '../lib/liveRefresh';
import { queryClient } from '../lib/queryClient';
import { getApiErrorMessage } from '../utils/providerUserManagement';
import { Calendar, ChevronDown, Eye, Loader2, Search } from 'lucide-react';
import clsx from 'clsx';
function mapApiSpecializationsToOptions(items, language) {
    if (!Array.isArray(items)) return [];
    return items
        .map((s) => {
            const id = s.id ?? s.subCategoryId;
            if (id == null || id === '') return null;
            const label =
                language === 'ar'
                    ? (s.nameAr ?? s.nameEn ?? s.name ?? '')
                    : (s.nameEn ?? s.nameAr ?? s.name ?? '');
            return { id: String(id), label: label || '—' };
        })
        .filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label, language === 'ar' ? 'ar' : 'en'));
}

/** تطبيع GET /manage/dashboard/jobs → شكل mapDashboardExpert */
function jobListItemToRow(item, language) {
    if (!item || typeof item !== 'object') {
        return { ...mapDashboardExpert({ providerId: '', applicationId: '' }, language), raw: item };
    }
    const c = item.city;
    const cityStr =
        c && typeof c === 'object' && c.label != null
            ? String(c.label).trim()
            : typeof c === 'string'
              ? c.trim()
              : '';
    const n = {
        ...item,
        fullName: item.fullName,
        displayName: (item.displayName || item.fullName || '').trim(),
        joinedAt: item.createdAt ?? item.joinedAt,
        applicationId: item.id ?? item.applicationId,
        providerId: (() => {
            if (item.providerId != null) return String(item.providerId);
            if (item.provider_id != null) return String(item.provider_id);
            if (item.expertId != null) return String(item.expertId);
            if (item.expert_id != null) return String(item.expert_id);
            if (item.id != null) return String(item.id);
            return '';
        })(),
        addressLabel: cityStr || '—',
        city: cityStr,
    };
    return { ...mapDashboardExpert(n, language), raw: item };
}

/**
 * @param {object[]} data — data من /jobs
 * @returns {object[]}
 */
function buildSpecializationsFromJobData(data) {
    if (!Array.isArray(data)) return [];
    const m = new Map();
    for (const row of data) {
        const s = row && row.specialization;
        if (!s || s.id == null) continue;
        const id = String(s.id);
        if (!m.has(id)) m.set(id, s);
    }
    return Array.from(m.values());
}

/** @param {object[]} prev
 *  @param {object[]} incoming */
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

function subCategoriesFromCatalogItems(items) {
    const out = [];
    for (const raw of Array.isArray(items) ? items : []) {
        const subs = raw.subCategories ?? raw.sub_categories ?? [];
        for (const s of subs) {
            const sid = s.subCategoryId ?? s.id;
            if (sid == null || sid === '') continue;
            out.push({
                id: sid,
                subCategoryId: sid,
                nameAr: s.nameAr ?? s.name ?? '',
                nameEn: s.nameEn ?? s.name ?? '',
            });
        }
    }
    return out;
}

/** يُعاد استخدامه من mapDashboardExpert عبر re-export */
function mapDashboardExpert(item, language) {
    const spec = item.specialization;
    const serviceLabel = typeof item.serviceLabel === 'string' ? item.serviceLabel.trim() : '';
    const specialtyLabel = spec
        ? (language === 'ar' ? spec.nameAr : spec.nameEn) || spec.nameAr || spec.nameEn || '—'
        : serviceLabel || '—';
    const statusRaw = item.applicationStatus ?? item.status;
    let statusKey = 'submitted';
    if (statusRaw != null && statusRaw !== '') {
        const u = String(statusRaw).toUpperCase().replace(/-/g, '_');
        if (u === 'DRAFT') statusKey = 'draft';
        else if (u === 'SUBMITTED') statusKey = 'submitted';
        else if (u === 'UNDER_REVIEW') statusKey = 'underReview';
        else if (u === 'APPROVED') statusKey = 'approved';
        else if (u === 'REJECTED') statusKey = 'rejected';
    }
    const displayName = (item.displayName || item.fullName || '').trim();
    const parts = displayName.split(/\s+/).filter(Boolean);
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ') || '';
    return {
        id: item.providerId,
        providerId: item.providerId,
        applicationId: item.applicationId || item.providerId,
        first_name,
        last_name,
        displayName: displayName || item.displayName || item.fullName || '',
        email: item.email,
        phone: item.phone || '',
        avatarUrl: item.avatarUrl,
        createdAt: item.joinedAt,
        status: statusKey,
        specialtyLabel,
        addressLabel: item.addressLabel || item.city || '—',
        raw: item,
    };
}

function joinPeriodFromPreset(preset) {
    if (!preset || preset === 'all') return 'all';
    if (['day', 'week', 'month', 'year'].includes(preset)) return preset;
    return 'all';
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {'full'|'part'|'none'|'freelance'|'other'}
 */
function workTypeKeyFromRaw(raw) {
    if (!raw || typeof raw !== 'object') return 'other';
    const v = (
        raw.employmentType ||
        raw.workType ||
        raw.jobType ||
        raw.employment_type ||
        ''
    );
    const s = String(v).toLowerCase();
    if (!s) return 'other';
    if (/full|دوام.*كامل|permanent|full-?time/i.test(s) || s.includes('كامل')) return 'full';
    if (/part|جزئي|part-?time/i.test(s) || s.includes('جزئ')) return 'part';
    if (/free|lanc|self|مستقل|حُر|حر|freelance/i.test(s) || s.includes('عمل حر')) return 'freelance';
    if (/unemploy|not.*work|لا.*عمل|لايعمل|retired|student/i.test(s) || s.includes('لا يعمل')) return 'none';
    if (/[\u0600-\u06FF]/.test(String(v))) {
        if (s.includes('كامل')) return 'full';
        if (s.includes('جزئ') || s.includes('جزء')) return 'part';
    }
    return 'other';
}

function formatJoinDateAt(iso, locale) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    try {
        return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }).format(d);
    } catch {
        return d.toLocaleDateString();
    }
}

const PAGE_SIZE = 15;

const ExpertJobRequests = () => {
    const { token } = useAuth();
    const { language, t } = useLanguage();
    const toast = useToast();
    const navigate = useNavigate();
    const isRTL = language === 'ar';
    const locale = isRTL ? 'ar' : 'en';

    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [subCategoryId, setSubCategoryId] = useState('all');
    const [joinPreset, setJoinPreset] = useState('all');
    const [cityFilter, setCityFilter] = useState('all');
    const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
    const [cityMenuOpen, setCityMenuOpen] = useState(false);
    const [joinMenuOpen, setJoinMenuOpen] = useState(false);
    /** تخصصات شجرة الكتالوج — تظهر كل التخصصات في الفلتر (مثلاً الأربعة) حتى لو الصف الحالي لا يحتوي عليها */
    const [catalogSpecializations, setCatalogSpecializations] = useState([]);
    const [waByAppId, setWaByAppId] = useState(() => ({}));
    const [confirmFollowOpen, setConfirmFollowOpen] = useState(false);
    const [pendingJobId, setPendingJobId] = useState(/** @type {string | null} */ (null));
    /** مفتاح يطابق `row.applicationId` لتحديث `waByAppId` للصف */
    const [pendingWaKey, setPendingWaKey] = useState(/** @type {string | null} */ (null));
    const [markReadLoading, setMarkReadLoading] = useState(false);

    const joinPeriod = useMemo(() => joinPeriodFromPreset(joinPreset), [joinPreset]);

    const workTypeLabels = useMemo(
        () => ({
            all: t('jobsPage.workTypeAll'),
            full: t('jobsPage.workTypeFull'),
            part: t('jobsPage.workTypePart'),
            none: t('jobsPage.workTypeNotWorking'),
            freelance: t('jobsPage.workTypeFreelance'),
            other: t('jobsPage.workTypeOther'),
        }),
        [t]
    );

    const workTypeKeyLabel = useCallback(
        (key) => {
            if (key === 'full' || key === 'part' || key === 'none' || key === 'freelance' || key === 'other') {
                return workTypeLabels[key] ?? workTypeLabels.other;
            }
            return workTypeLabels.other;
        },
        [workTypeLabels]
    );

    const joinPresets = useMemo(
        () => [
            { key: 'all', label: t('providers.filterAll') },
            { key: 'day', label: t('providers.joinDateToday') },
            { key: 'week', label: t('providers.joinDateWeek') },
            { key: 'month', label: t('providers.joinDateMonth') },
            { key: 'year', label: t('providers.joinDateYear') },
        ],
        [t]
    );

    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
        return () => clearTimeout(id);
    }, [searchQuery]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!token) {
                setCatalogSpecializations([]);
                return;
            }
            try {
                const res = await fetchDashboardCatalog(token, { lang: language });
                if (cancelled) return;
                const { items } = parseDashboardCatalogResponse(res);
                setCatalogSpecializations(subCategoriesFromCatalogItems(items));
            } catch {
                if (!cancelled) setCatalogSpecializations([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, language]);

    const jobsListQuery = useQuery({
        queryKey: [
            'dashboard',
            'jobs',
            token,
            language,
            page,
            joinPeriod,
            subCategoryId,
            debouncedSearch,
            cityFilter,
        ],
        queryFn: async () => {
            const res = await fetchDashboardJobs(token, {
                lang: language,
                page,
                limit: PAGE_SIZE,
                createdPeriod: mapJobsCreatedPeriod(joinPeriod),
                cityMode:
                    cityFilter === 'all' ? 'all' : cityFilter === 'riyadh' ? 'RIYADH' : 'OTHER',
                readStatus: 'all',
                subCategoryId: subCategoryId !== 'all' ? subCategoryId : undefined,
                search: debouncedSearch || undefined,
            });
            return parseJoinRequestsListResponse(res);
        },
        enabled: Boolean(token),
        placeholderData: keepPreviousData,
        ...listQueryDefaults,
    });

    const jobsParsed = jobsListQuery.data;
    const rows = useMemo(() => {
        const list = Array.isArray(jobsParsed?.data) ? jobsParsed.data : [];
        return list.map((it) => jobListItemToRow(it, language));
    }, [jobsParsed, language]);

    const listJobSpecializations = useMemo(() => {
        const list = Array.isArray(jobsParsed?.data) ? jobsParsed.data : [];
        const spec = jobsParsed?.specializations;
        const specSource =
            Array.isArray(spec) && spec.length ? spec : buildSpecializationsFromJobData(list);
        return specSource;
    }, [jobsParsed]);

    const listMeta = useMemo(() => {
        const meta = jobsParsed?.meta || {};
        const list = Array.isArray(jobsParsed?.data) ? jobsParsed.data : [];
        const totalPages = Math.max(1, Number(meta.totalPages) || 1);
        const currentPage = Math.max(1, Number(meta.page) || page);
        return {
            total:
                Number(meta.total) != null && Number.isFinite(Number(meta.total))
                    ? Number(meta.total)
                    : list.length,
            totalPages,
            page: currentPage,
            hasNext: meta.hasNextPage === true || currentPage < totalPages,
            hasPrev: meta.hasPreviousPage === true || currentPage > 1,
        };
    }, [jobsParsed, page]);

    const loading = Boolean(token) && jobsListQuery.isPending;
    const error = jobsListQuery.isError ? t('jobsPage.loadError') : '';

    const enriched = useMemo(() => {
        return (rows || []).map((r) => {
            const raw = r.raw || r;
            const wk = workTypeKeyFromRaw(raw);
            return {
                ...r,
                workTypeKey: wk,
                workTypeDisplay: workTypeKeyLabel(wk),
                cityLabel: (() => {
                    if (raw.city && typeof raw.city === 'object' && raw.city.label != null) {
                        return String(raw.city.label);
                    }
                    if (raw.city && typeof raw.city === 'string') return raw.city;
                    if (raw.district && String(raw.district)) return String(raw.district);
                    if (raw.address && typeof raw.address === 'string') return raw.address;
                    if (raw.address && raw.address?.label) return String(raw.address.label);
                    return r.addressLabel || '—';
                })(),
            };
        });
    }, [rows, workTypeKeyLabel]);

    const joinPresetLabel = useMemo(
        () => joinPresets.find((x) => x.key === joinPreset)?.label || joinPresets[0].label,
        [joinPresets, joinPreset]
    );

    const specOptions = useMemo(() => {
        const merged = mergeSpecializationRecords(catalogSpecializations, listJobSpecializations);
        const opts = mapApiSpecializationsToOptions(merged, language);
        if (opts.length > 0) return opts;
        const m = new Map();
        for (const r of rows) {
            const s = r.raw?.specialization;
            const id = s?.id != null ? String(s.id) : s?.subCategoryId != null ? String(s.subCategoryId) : null;
            if (id == null) continue;
            const lab = r.specialtyLabel;
            if (lab && lab !== '—') m.set(id, { id, label: lab });
        }
        return Array.from(m.values())
            .sort((a, b) => a.label.localeCompare(b.label, language === 'ar' ? 'ar' : 'en'));
    }, [catalogSpecializations, listJobSpecializations, language, rows]);

    const specLabel = useMemo(() => {
        if (subCategoryId === 'all') return t('jobsPage.fieldAll');
        const f = specOptions.find((o) => o.id === subCategoryId);
        return f?.label || t('jobsPage.fieldAll');
    }, [subCategoryId, specOptions, t]);

    useEffect(() => {
        setPage(1);
    }, [joinPeriod, subCategoryId, debouncedSearch, cityFilter]);

    const pageCount = useMemo(
        () => Math.max(1, listMeta.totalPages || 1),
        [listMeta.totalPages]
    );
    const pageSafe = useMemo(() => Math.min(page, pageCount), [page, pageCount]);

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

    useEffect(() => {
        const maxPage = Math.max(1, listMeta.totalPages || 1);
        if (page > maxPage) setPage(maxPage);
    }, [listMeta.totalPages, page]);

    const setFollowRead = useCallback((id, on) => {
        setWaByAppId((prev) => ({ ...prev, [id]: on }));
    }, []);

    const openFollowConfirm = useCallback((apiJobId, waKey) => {
        if (!apiJobId) return;
        setPendingJobId(String(apiJobId));
        setPendingWaKey(waKey != null && String(waKey).trim() !== '' ? String(waKey) : String(apiJobId));
        setConfirmFollowOpen(true);
    }, []);

    const closeFollowConfirm = useCallback(() => {
        if (markReadLoading) return;
        setConfirmFollowOpen(false);
        setPendingJobId(null);
        setPendingWaKey(null);
    }, [markReadLoading]);

    const handleMarkRead = useCallback(async () => {
        if (!token || !pendingJobId) return;
        setMarkReadLoading(true);
        try {
            await patchDashboardJobRead(token, pendingJobId, { lang: language });
            const key = pendingWaKey || pendingJobId;
            if (key) setFollowRead(key, true);
            void queryClient.invalidateQueries({ queryKey: ['dashboard', 'jobs'] });
            toast.success(t('jobRequestDetail.followJobSuccess'));
            setConfirmFollowOpen(false);
            setPendingJobId(null);
            setPendingWaKey(null);
        } catch (e) {
            toast.error(getApiErrorMessage(e) || t('jobRequestDetail.followJobError'));
        } finally {
            setMarkReadLoading(false);
        }
    }, [token, pendingJobId, pendingWaKey, language, t, toast, setFollowRead]);

    const openDetails = (r) => {
        const jobId = r.raw?.id ?? r.applicationId;
        if (jobId != null && String(jobId).trim() !== '') {
            navigate(`/dashboard/jobs/${encodeURIComponent(String(jobId))}`);
        }
    };

    const clearFilterMenus = () => {
        setFieldMenuOpen(false);
        setCityMenuOpen(false);
        setJoinMenuOpen(false);
    };

    const filterRegDate = (
        <div className="relative w-full min-w-0 sm:w-[min(100%,14rem)]" key="reg">
            <span className="text-xs font-medium text-khabeer-muted">
                {t('jobsPage.registrationDateLabel')}
            </span>
            <div className="relative mt-1">
                <button
                    type="button"
                    onClick={() => {
                        setJoinMenuOpen((o) => !o);
                        setFieldMenuOpen(false);
                        setCityMenuOpen(false);
                    }}
                    className="inline-flex h-12 w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-khabeer-stroke/90 bg-white ps-3 pe-3 text-start text-[15px] font-medium"
                >
                    <Calendar className="size-5 shrink-0 text-khabeer-muted" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate text-start">
                        {joinPreset === 'all' ? t('providers.filterAll') : joinPresetLabel}
                    </span>
                    <ChevronDown className="size-4 shrink-0" />
                </button>
                {joinMenuOpen ? (
                    <div className="absolute end-0 z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-khabeer-stroke bg-white py-1 shadow-lg">
                        {joinPresets.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => {
                                    setJoinPreset(p.key);
                                    setJoinMenuOpen(false);
                                }}
                                className="w-full px-3 py-2.5 text-start text-sm hover:bg-gray-50"
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );

    const filterCity = (
        <div className="relative w-full min-w-0 sm:w-[min(100%,10.5rem)]" key="city">
            <span className="text-xs font-medium text-khabeer-muted">{t('jobsPage.cityLabel')}</span>
            <div className="relative mt-1">
                <button
                    type="button"
                    onClick={() => {
                        setCityMenuOpen((o) => !o);
                        setFieldMenuOpen(false);
                        setJoinMenuOpen(false);
                    }}
                    className="flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-khabeer-stroke/90 bg-white px-4 text-start text-[15px] font-medium"
                >
                    <span>
                        {cityFilter === 'all' && t('jobsPage.cityAll')}
                        {cityFilter === 'riyadh' && t('jobsPage.cityRiyadh')}
                        {cityFilter === 'other' && t('jobsPage.cityOther')}
                    </span>
                    <ChevronDown className="size-4 shrink-0" />
                </button>
                {cityMenuOpen ? (
                    <div className="absolute end-0 z-30 mt-1 w-full rounded-xl border border-khabeer-stroke bg-white py-1 shadow-lg">
                        {['all', 'riyadh', 'other'].map((k) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => {
                                    setCityFilter(k);
                                    setCityMenuOpen(false);
                                }}
                                className="w-full px-3 py-2.5 text-start text-sm hover:bg-gray-50"
                            >
                                {k === 'all' && t('jobsPage.cityAll')}
                                {k === 'riyadh' && t('jobsPage.cityRiyadh')}
                                {k === 'other' && t('jobsPage.cityOther')}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );

    const filterSpecialization = (
        <div
            className="relative w-[220px] min-w-[180px] max-w-[260px] shrink-0"
            key="spec"
        >
            <span className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                {t('jobsPage.specializationLabel')}
            </span>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => {
                        setFieldMenuOpen((o) => !o);
                        setCityMenuOpen(false);
                        setJoinMenuOpen(false);
                    }}
                    className={clsx(
                        'flex min-h-[40px] w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-white py-2.5 ps-3 pe-2 text-start text-[14px] font-medium text-[#333] transition-[border-color,box-shadow] dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary',
                        fieldMenuOpen
                            ? 'border-khabeer-brand ring-1 ring-khabeer-brand/25 dark:border-dark-accent-blue dark:ring-dark-accent-blue/30'
                            : 'border-khabeer-stroke dark:border-dark-border'
                    )}
                >
                    <span className="min-w-0 flex-1 truncate text-start leading-normal">
                        {specLabel}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-khabeer-muted" />
                </button>
                {fieldMenuOpen ? (
                    <div className="absolute end-0 z-30 mt-1 max-h-60 w-full min-w-0 max-w-full overflow-y-auto overflow-x-auto rounded-xl border border-khabeer-stroke/90 bg-white py-1 shadow-lg dark:border-dark-border dark:bg-dark-bg-secondary">
                        <button
                            type="button"
                            onClick={() => {
                                setSubCategoryId('all');
                                setFieldMenuOpen(false);
                            }}
                            className={clsx(
                                'w-max min-w-full max-w-full whitespace-nowrap px-3 py-2.5 text-start text-sm transition-colors',
                                subCategoryId === 'all'
                                    ? 'bg-khabeer-brand font-medium text-white dark:bg-dark-accent-blue'
                                    : 'text-[#1a1a1a] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary'
                            )}
                        >
                            {t('jobsPage.fieldAll')}
                        </button>
                        {specOptions.map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => {
                                    setSubCategoryId(String(o.id));
                                    setFieldMenuOpen(false);
                                }}
                                className={clsx(
                                    'w-max min-w-full max-w-full whitespace-nowrap px-3 py-2.5 text-start text-sm transition-colors',
                                    subCategoryId === String(o.id)
                                        ? 'bg-khabeer-brand font-medium text-white dark:bg-dark-accent-blue'
                                        : 'text-[#1a1a1a] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary'
                                )}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );

    const filterSearch = (
        <div
            className="min-w-[145px] max-w-[240px] flex-1 basis-[175px]"
            key="search"
        >
            <span className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                {t('jobsPage.searchLabel')}
            </span>
            <div className="relative">
                <Search
                    className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-khabeer-muted"
                    strokeWidth={1.5}
                    aria-hidden
                />
                <input
                    id="expert-jobs-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isRTL ? 'بحث...' : `${t('common.search')}...`}
                    autoComplete="off"
                    className="w-full rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none placeholder:text-[#999] focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    type="search"
                />
            </div>
        </div>
    );

    return (
        <div
            className="space-y-6 text-start"
            dir={isRTL ? 'rtl' : 'ltr'}
        >
            <div>
                <h1 className="text-3xl font-bold leading-tight text-[#1a1a1a] dark:text-dark-text-primary sm:text-[32px]">
                    {t('jobsPage.title')}
                </h1>
                <p className="mt-2 max-w-3xl text-base text-[#666] dark:text-dark-text-secondary">
                    {t('jobsPage.subtitle')}
                </p>
            </div>

            <div
                className="flex flex-col gap-4 rounded-2xl border border-khabeer-stroke/60 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 lg:p-5"
                dir={isRTL ? 'rtl' : 'ltr'}
                onMouseLeave={clearFilterMenus}
            >
                <>
                    {filterRegDate}
                    {filterCity}
                    {filterSpecialization}
                    {filterSearch}
                </>
            </div>

            {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="overflow-hidden rounded-2xl border border-khabeer-stroke/50 bg-white shadow-sm dark:border-dark-border dark:bg-dark-bg-secondary">
                <div className="overflow-x-auto">
                <table
                    className="w-full min-w-[64rem] border-separate border-spacing-0"
                >
                    <thead>
                        <tr
                            className="text-[15px] text-[#1a1a1a] dark:text-dark-text-primary"
                        >
                            {(
                                [
                                    t('jobsPage.colFullName'),
                                    t('jobsPage.colPhone'),
                                    t('jobsPage.colCity'),
                                    t('jobsPage.colField'),
                                    t('jobsPage.colWorkType'),
                                    t('jobsPage.colJoinDate'),
                                    t('jobsPage.colWhatsapp'),
                                    t('jobsPage.colActions'),
                                ] 
                            ).map((label, i, arr) => {
                                const isActions = i === arr.length - 1;
                                return (
                                <th
                                    key={label}
                                    className={clsx(
                                        'border-b border-khabeer-stroke/60 bg-[#f3f3f3] px-3 py-3 text-center text-[15px] font-bold text-[#1a1a1a] dark:border-dark-border dark:bg-dark-bg-tertiary dark:font-bold dark:text-dark-text-primary',
                                        isActions
                                            ? clsx(
                                                  'w-16 min-w-16',
                                                  isRTL ? 'rounded-tl-md' : 'rounded-tr-md'
                                              )
                                            : null
                                    )}
                                >
                                    {label}
                                </th>
                            );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="p-12 text-center text-khabeer-muted">
                                    <Loader2 className="mx-auto size-8 animate-spin" />
                                </td>
                            </tr>
                        ) : (
                            enriched.map((row) => (
                                <tr
                                    key={row.applicationId}
                                    className="border-b border-khabeer-stroke/30 text-[15px] dark:border-dark-border/40"
                                >
                                    <td className="max-w-[14rem] p-2 text-center">
                                        <span className="block min-w-0 break-words font-medium">
                                            {row.displayName || '—'}
                                        </span>
                                    </td>
                                    <td className="p-2 text-center whitespace-nowrap" dir="ltr">
                                        {row.phone || '—'}
                                    </td>
                                    <td className="max-w-[9rem] truncate p-2 text-center" title={row.cityLabel}>
                                        {row.cityLabel}
                                    </td>
                                    <td className="max-w-[12rem] p-2 text-center align-top">
                                        <span
                                            className="mx-auto inline-block max-w-full whitespace-normal break-words rounded-2xl bg-khabeer-stroke/30 px-2.5 py-1 text-sm leading-snug text-center dark:bg-dark-bg-tertiary"
                                        >
                                            {row.specialtyLabel}
                                        </span>
                                    </td>
                                    <td className="p-2 text-center whitespace-nowrap">
                                        {row.workTypeDisplay}
                                    </td>
                                    <td className="whitespace-nowrap p-2 text-center text-[#444]">
                                        {formatJoinDateAt(row.createdAt, locale)}
                                    </td>
                                    <td className="p-2 text-center">
                                        {(() => {
                                            const raw = row.raw || row;
                                            const wOn =
                                                waByAppId[row.applicationId] !== undefined
                                                    ? waByAppId[row.applicationId] === true
                                                    : raw?.isRead === true;
                                            return (
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={wOn}
                                            onClick={() => {
                                                if (wOn) return;
                                                const jid = row.raw?.id ?? row.applicationId;
                                                if (jid != null && String(jid).trim() !== '') {
                                                    openFollowConfirm(String(jid), row.applicationId);
                                                }
                                            }}
                                            aria-label={t('jobsPage.colWhatsapp')}
                                            className={clsx(
                                                'relative h-6 w-11 rounded-full transition-colors',
                                                wOn
                                                    ? 'bg-emerald-500'
                                                    : 'bg-gray-200 dark:bg-gray-600',
                                                wOn ? 'cursor-default' : 'cursor-pointer'
                                            )}
                                        >
                                            <span
                                                className={clsx(
                                                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                                                    isRTL
                                                        ? wOn
                                                            ? 'end-0.5'
                                                            : 'start-0.5'
                                                        : wOn
                                                            ? 'end-0.5'
                                                            : 'start-0.5'
                                                )}
                                            />
                                        </button>
                                            );
                                        })()}
                                    </td>
                                    <td className="w-16 min-w-16 bg-white p-2 text-center align-middle dark:bg-dark-bg-secondary">
                                        <button
                                            type="button"
                                            onClick={() => openDetails(row)}
                                            className="inline-flex size-8 items-center justify-center rounded text-[#333] transition-colors hover:text-khabeer-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-khabeer-brand/30 dark:text-dark-text-secondary dark:hover:text-dark-accent-blue"
                                            title={t('jobsPage.view')}
                                            aria-label={t('jobsPage.view')}
                                        >
                                            <Eye
                                                className="size-5 shrink-0"
                                                strokeWidth={1.5}
                                                aria-hidden
                                            />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                </div>
                {!loading ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-khabeer-stroke/60 px-4 py-4 dark:border-dark-border sm:px-5">
                        <p className="text-[14px] text-khabeer-muted dark:text-dark-text-muted">
                            {listMeta.total} {isRTL ? 'سجل' : 'records'}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={pageSafe <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                className="flex size-9 items-center justify-center rounded-lg border border-khabeer-stroke bg-white text-khabeer-muted disabled:opacity-40 dark:border-dark-border dark:bg-dark-bg-tertiary"
                            >
                                <span className="sr-only">{t('providers.paginationPrev')}</span>
                                {isRTL ? '›' : '‹'}
                            </button>
                            {paginationNums.map((n, i) =>
                                n === '…' ? (
                                    <span key={`e${i}`} className="px-2 text-khabeer-muted">
                                        …
                                    </span>
                                ) : (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setPage(n)}
                                        className={clsx(
                                            'flex min-w-[36px] items-center justify-center rounded-lg border px-2 py-1.5 text-[14px] font-medium transition-colors',
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
                                className="flex size-9 items-center justify-center rounded-lg border border-khabeer-stroke bg-white text-khabeer-muted disabled:opacity-40 dark:border-dark-border dark:bg-dark-bg-tertiary"
                            >
                                <span className="sr-only">{t('providers.paginationNext')}</span>
                                {isRTL ? '‹' : '›'}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            {!loading && !enriched.length ? (
                <p className="text-center text-khabeer-muted">{t('jobsPage.noRows')}</p>
            ) : null}

            {confirmFollowOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/60"
                    role="presentation"
                    onClick={closeFollowConfirm}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="follow-job-list-dialog-title"
                        className="w-full max-w-md rounded-2xl border border-khabeer-stroke/60 bg-white p-5 shadow-xl dark:border-dark-border dark:bg-dark-bg-secondary"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p
                            id="follow-job-list-dialog-title"
                            className="text-center text-base font-medium leading-relaxed text-[#1a1a1a] dark:text-dark-text-primary"
                        >
                            {t('jobRequestDetail.followJobConfirm')}
                        </p>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                            <button
                                type="button"
                                onClick={closeFollowConfirm}
                                disabled={markReadLoading}
                                className="h-11 rounded-xl border border-khabeer-stroke/80 bg-white px-4 text-sm font-medium text-[#333] transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary dark:hover:bg-dark-bg-elevated"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleMarkRead()}
                                disabled={markReadLoading}
                                className="inline-flex h-11 min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-khabeer-brand px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50 dark:bg-dark-accent-blue"
                            >
                                {markReadLoading ? (
                                    <Loader2 className="size-5 animate-spin" aria-hidden />
                                ) : null}
                                {t('common.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ExpertJobRequests;
