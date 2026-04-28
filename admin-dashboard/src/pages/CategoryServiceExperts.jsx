import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, MapPin, Star, FileText, ChevronLeft, ChevronRight, Search, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { catalogApi } from '../api/catalogApi';
import AvatarOrInitial from '../components/AvatarOrInitial';

const PAGE_SIZE = 8;

function tpl(str, vars) {
    if (!str) return '';
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

function serviceExpertsList(service) {
    if (Array.isArray(service?.experts)) return service.experts;
    if (Array.isArray(service?.providers)) return service.providers;
    return [];
}

/** Figma 470:6261 — pagination with optional ellipsis */
function buildPaginationSlots(totalPages, current) {
    if (totalPages <= 1) return [];
    if (totalPages <= 9) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = new Set([1, 2, 3, totalPages - 2, totalPages - 1, totalPages, current, current - 1, current + 1]);
    const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

    const out = [];
    for (let i = 0; i < sorted.length; i++) {
        const n = sorted[i];
        const prev = sorted[i - 1];
        if (prev !== undefined && n - prev > 1) {
            out.push('ellipsis');
        }
        out.push(n);
    }
    return out;
}

const CategoryServiceExperts = () => {
    const { subCategoryId, serviceId } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const { t, language } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [service, setService] = useState(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const isRTL = language === 'ar';
    const textDir = isRTL ? 'rtl' : 'ltr';

    const load = useCallback(async () => {
        if (!token || !subCategoryId || !serviceId) return;
        setLoading(true);
        try {
            const response = await catalogApi.getSubCategory(token, subCategoryId);
            if (response.data?.success) {
                const sub = response.data.data;
                const list = (sub.services || []).map((svc) => ({
                    ...svc,
                    id: svc.serviceId || svc.id
                }));
                const found = list.find((s) => String(s.id) === String(serviceId));
                setService(found || null);
            } else {
                setService(null);
            }
        } catch (e) {
            console.error(e);
            setService(null);
        } finally {
            setLoading(false);
        }
    }, [token, subCategoryId, serviceId]);

    useEffect(() => {
        load();
    }, [load]);

    const experts = useMemo(() => serviceExpertsList(service), [service]);

    const serviceTitle =
        service &&
        (language === 'ar' ? service.nameAr || service.name : service.nameEn || service.name || '');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return experts;
        return experts.filter((ex) => {
            const name = (
                ex.displayName ||
                [ex.first_name, ex.last_name].filter(Boolean).join(' ') ||
                ex.name ||
                ''
            ).toLowerCase();
            const loc = (ex.addressLine || ex.city || ex.region || '').toLowerCase();
            return name.includes(q) || loc.includes(q);
        });
    }, [experts, search]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageItems = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, currentPage]);

    const paginationSlots = useMemo(
        () => buildPaginationSlots(totalPages, currentPage),
        [totalPages, currentPage]
    );

    useEffect(() => {
        setPage(1);
    }, [search, experts.length]);

    if (loading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center" dir={textDir}>
                <Loader2 className="h-8 w-8 animate-spin text-khabeer-brand" />
            </div>
        );
    }

    if (!service) {
        return (
            <div
                className="rounded-xl border border-khabeer-stroke bg-white p-8 text-center dark:border-dark-border dark:bg-dark-bg-secondary"
                dir={textDir}
            >
                <p className="text-khabeer-muted">{t('categories.serviceExpertsNotFound')}</p>
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[#f1f3ff] px-5 py-2.5 text-sm font-medium text-khabeer-brand dark:bg-dark-bg-tertiary dark:text-dark-accent-blue"
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft className={clsx('size-4 shrink-0', isRTL && 'rotate-180')} aria-hidden />
                        {t('common.back')}
                    </button>
                    <button
                        type="button"
                        className="text-sm font-medium text-khabeer-muted underline-offset-2 hover:text-khabeer-brand hover:underline"
                        onClick={() => navigate('/dashboard/categories')}
                    >
                        {t('categories.serviceExpertsBack')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="mx-auto w-full max-w-[1256px] pb-8 text-[#333] dark:text-dark-text-primary"
            dir={textDir}
        >
            <button
                type="button"
                onClick={() => navigate(-1)}
                className="-ms-1 mb-6 inline-flex items-center gap-2 rounded-lg px-2 py-2 text-[16px] font-medium text-khabeer-brand transition hover:bg-black/[0.04] dark:text-dark-accent-blue dark:hover:bg-white/10"
            >
                <ArrowLeft className={clsx('size-5 shrink-0', isRTL && 'rotate-180')} aria-hidden />
                {t('common.back')}
            </button>

            <div className="space-y-10">
            {/* Figma 477:23656 — عنوان يمين + بحث يسار، gap 40px */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
                <h1 className="min-w-0 flex-1 text-start text-[32px] font-bold leading-none">
                    <span className="leading-normal">{t('categories.serviceExpertsTitlePrefix')}</span>
                    <span className="leading-normal text-[#0077b6] dark:text-dark-accent-blue"> {serviceTitle} </span>
                </h1>
                <div className="w-full shrink-0 lg:w-[358px]">
                    <label className="sr-only" htmlFor="service-experts-search">
                        {t('categories.serviceExpertsSearchPlaceholder')}
                    </label>
                    <div className="rounded-[16px] border border-khabeer-stroke p-px dark:border-dark-border">
                        <div className="relative flex h-12 items-center gap-2 rounded-[12px] bg-white px-4 dark:bg-dark-bg-secondary">
                            <input
                                id="service-experts-search"
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('categories.serviceExpertsSearchPlaceholder')}
                                className="min-w-0 flex-1 border-0 bg-transparent text-right text-[14px] text-[#333] placeholder:text-[#999] focus:outline-none focus:ring-0 dark:text-dark-text-primary"
                            />
                            <Search className="size-6 shrink-0 text-khabeer-muted" strokeWidth={1.5} aria-hidden />
                        </div>
                    </div>
                </div>
            </div>

            {pageItems.length === 0 ? (
                <p className="text-center text-khabeer-muted">{t('categories.expertsPanelEmpty')}</p>
            ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    {pageItems.map((ex, idx) => {
                        const name =
                            ex.displayName ||
                            [ex.first_name, ex.last_name].filter(Boolean).join(' ') ||
                            ex.name ||
                            '—';
                        const img = ex.avatarUrl || ex.avatar;
                        const years = ex.experienceYears ?? ex.experience_years;
                        const rating = ex.rating ?? ex.avgRating;
                        const completed = ex.completedServices ?? ex.completedServicesCount ?? ex.completed_count;
                        const loc =
                            ex.addressLine ||
                            [ex.city, ex.region].filter(Boolean).join(' ، ') ||
                            '—';
                        const yLabel = years === 1 ? t('categories.yearsExp') : t('categories.yearsExpPlural');

                        return (
                            <article
                                key={ex.id || ex.providerId || idx}
                                className="flex flex-col gap-3 overflow-hidden rounded-[12px] border-[0.5px] border-khabeer-stroke bg-white p-2 shadow-[0_1px_2px_0_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary"
                            >
                                <div className="flex flex-col items-end gap-2">
                                    <div className="relative aspect-[79/47] w-full overflow-hidden rounded-[12px] border-[0.5px] border-khabeer-stroke dark:border-dark-border">
                                        <AvatarOrInitial
                                            name={name}
                                            avatarUrl={img}
                                            className="bg-gray-100 text-2xl font-bold text-gray-500 dark:bg-dark-bg-tertiary dark:text-gray-300"
                                        />
                                    </div>
                                    <div className="flex w-full flex-col gap-2">
                                        <div className="flex flex-col items-end gap-0.5">
                                            <p className="w-full text-center text-[18px] font-medium leading-normal text-[#333] dark:text-dark-text-primary">
                                                {name}
                                            </p>
                                            <div className="flex w-full items-end justify-center gap-0.5 text-[14px] text-[#666] dark:text-dark-text-secondary">
                                                <p className="max-w-full truncate text-right leading-normal">{loc}</p>
                                                <MapPin className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                                            </div>
                                        </div>
                                        {/* Figma: سنوات الخبرة | التقييم | الخدمات — من اليمين لليسار */}
                                        <div className="flex w-full gap-1 pt-1">
                                            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                                <span className="text-center text-[12px] leading-normal text-[#999] dark:text-dark-text-muted">
                                                    {t('categories.serviceExpertsStatYears')}
                                                </span>
                                                <span className="text-[14px] font-medium leading-normal text-[#666] dark:text-dark-text-secondary">
                                                    {years != null ? `${years} ${yLabel}` : '—'}
                                                </span>
                                            </div>
                                            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                                <span className="text-center text-[12px] leading-normal text-[#999] dark:text-dark-text-muted">
                                                    {t('categories.serviceExpertsStatRating')}
                                                </span>
                                                <div className="flex items-center gap-0.5">
                                                    <span className="text-[14px] font-medium leading-normal text-[#666] dark:text-dark-text-secondary">
                                                        {rating != null ? rating : '—'}
                                                    </span>
                                                    <Star className="size-[18px] fill-amber-400 text-amber-400" aria-hidden />
                                                </div>
                                            </div>
                                            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                                <span className="text-center text-[12px] leading-normal text-[#999] dark:text-dark-text-muted">
                                                    {t('categories.serviceExpertsStatServices')}
                                                </span>
                                                <span className="text-[14px] font-medium leading-normal text-[#666] dark:text-dark-text-secondary">
                                                    {completed != null
                                                        ? tpl(t('categories.serviceExpertsServicesLine'), { n: completed })
                                                        : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="h-px w-full bg-khabeer-stroke dark:bg-dark-border" />
                                {/* Figma: النص ثم الأيقونة */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const pid = ex.id || ex.providerId || ex.userId;
                                        if (pid) navigate(`/dashboard/provider/${pid}`);
                                    }}
                                    className="flex min-h-11 w-full flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#f1f3ff] px-4 text-[14px] font-medium text-[#0077b6] transition hover:opacity-95 dark:bg-dark-bg-tertiary dark:text-dark-accent-blue"
                                >
                                    <span>{t('categories.viewDetails')}</span>
                                    <FileText className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                                </button>
                            </article>
                        );
                    })}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="flex size-10 items-center justify-center rounded-lg border border-khabeer-stroke bg-white text-khabeer-muted transition hover:bg-gray-50 disabled:opacity-40 dark:border-dark-border dark:bg-dark-bg-secondary dark:hover:bg-dark-bg-tertiary"
                        aria-label="Previous page"
                    >
                        <ChevronRight className={clsx('size-5', !isRTL && 'rotate-180')} />
                    </button>
                    {paginationSlots.map((slot, i) =>
                        slot === 'ellipsis' ? (
                            <span
                                key={`e-${i}`}
                                className="px-2 text-khabeer-muted"
                                aria-hidden
                            >
                                …
                            </span>
                        ) : (
                            <button
                                key={slot}
                                type="button"
                                onClick={() => setPage(slot)}
                                className={clsx(
                                    'min-h-10 min-w-10 rounded-lg px-3 text-sm font-medium transition',
                                    slot === currentPage
                                        ? 'bg-khabeer-brand text-white'
                                        : 'border border-transparent text-khabeer-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary'
                                )}
                            >
                                {slot}
                            </button>
                        )
                    )}
                    <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="flex size-10 items-center justify-center rounded-lg border border-khabeer-stroke bg-white text-khabeer-muted transition hover:bg-gray-50 disabled:opacity-40 dark:border-dark-border dark:bg-dark-bg-secondary dark:hover:bg-dark-bg-tertiary"
                        aria-label="Next page"
                    >
                        <ChevronLeft className={clsx('size-5', !isRTL && 'rotate-180')} />
                    </button>
                </div>
            )}
            </div>
        </div>
    );
};

export default CategoryServiceExperts;
