import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Briefcase,
    Calendar,
    Clock,
    File,
    FileText,
    Image as ImageIcon,
    Loader2,
    MapPin,
    MessageCircle,
    Package,
    Phone,
    Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { fetchDashboardJobById, patchDashboardJobRead, unwrapDashboardEnvelope } from '../api/dashboardApi';
import { getApiErrorMessage } from '../utils/providerUserManagement';

/** @param {object} city @param {'ar'|'en'} language */
function cityDisplay(city, language) {
    if (!city || typeof city !== 'object') return '—';
    if (city.label != null && String(city.label).trim()) return String(city.label).trim();
    if (typeof city === 'string') return city;
    if (city.otherText != null && String(city.otherText).trim()) return String(city.otherText).trim();
    return '—';
}

/**
 * @param {object} spec
 * @param {'ar'|'en'} language
 */
function specDisplay(spec, language) {
    if (!spec || typeof spec !== 'object') return '—';
    if (spec.label && String(spec.label).trim()) return String(spec.label).trim();
    if (language === 'ar') {
        return (spec.nameAr || spec.nameEn || spec.name || '—').trim() || '—';
    }
    return (spec.nameEn || spec.nameAr || spec.name || '—').trim() || '—';
}

function Section({ title, icon: Icon, children, className }) {
    return (
        <section
            className={clsx(
                'rounded-2xl border border-khabeer-stroke/60 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-bg-secondary',
                className
            )}
        >
            <div className="mb-4 flex items-center gap-2.5">
                {Icon ? (
                    <div className="flex size-9 items-center justify-center rounded-xl bg-[#0077b6]/10 text-khabeer-brand dark:bg-dark-accent-blue/15 dark:text-dark-accent-blue">
                        <Icon className="size-4" strokeWidth={1.75} />
                    </div>
                ) : null}
                <h2 className="text-lg font-bold text-[#1a1a1a] dark:text-dark-text-primary">{title}</h2>
            </div>
            {children}
        </section>
    );
}

/** عناوين داخلية داخل نفس كرت (أيقونة + نص) */
const DOC_EXTS = /\.(pdf|docx?|xls[xm]?|pptx?|zip|rar|7z|txt|csv|rtf|od[dtsp]|key|pages)(\?|#|$)/i;

/** @param {string} u */
function isDocumentUrl(u) {
    const p = String(u).split('?')[0].split('#')[0];
    return DOC_EXTS.test(p);
}

/** @param {string} u */
function fileNameFromUrl(u) {
    const fallback = 'file';
    try {
        const parsed = new URL(String(u), typeof window !== 'undefined' ? window.location.origin : 'https://x.com');
        const segs = parsed.pathname.split('/').filter(Boolean);
        if (segs.length) {
            return decodeURIComponent(segs[segs.length - 1] || fallback);
        }
    } catch {
        /* parse path manually */
    }
    const s = String(u);
    const clean = s.split('?')[0].split('#')[0].split('/').filter(Boolean);
    if (clean.length) {
        try {
            return decodeURIComponent(clean[clean.length - 1] || fallback);
        } catch {
            return clean[clean.length - 1] || fallback;
        }
    }
    return fallback;
}

/**
 * وثيقة/ملف: أيقونة + اسم. صور: `<img>`. بلا امتداد: تجربة `<img>` وعند الفشل تُظهر كمرفق.
 * @param {{ href: string }} p
 */
function JobPortfolioItem({ href }) {
    const u = String(href);
    const name = fileNameFromUrl(u);
    const asDocument = isDocumentUrl(u);
    const [loadFailed, setLoadFailed] = useState(/** @type {boolean} */ (asDocument));
    const isPdf = /\.pdf(\?|#|$)/i.test(u);

    if (asDocument || loadFailed) {
        return (
            <a
                href={u}
                target="_blank"
                rel="noreferrer"
                className="group flex h-48 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-khabeer-stroke/50 bg-[#f0f0f0] p-3 transition hover:bg-[#e8e8e8] dark:border-dark-border dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-elevated"
            >
                {isPdf ? (
                    <FileText className="size-12 text-khabeer-brand dark:text-dark-accent-blue" strokeWidth={1.5} />
                ) : (
                    <File className="size-12 text-khabeer-brand dark:text-dark-accent-blue" strokeWidth={1.5} />
                )}
                <span
                    className="line-clamp-2 w-full break-all text-center text-xs font-medium text-[#333] dark:text-dark-text-primary"
                    title={name}
                >
                    {name}
                </span>
            </a>
        );
    }

    return (
        <a
            href={u}
            target="_blank"
            rel="noreferrer"
            className="group block overflow-hidden rounded-xl border border-khabeer-stroke/50 bg-[#f5f5f5] dark:border-dark-border dark:bg-dark-bg-tertiary"
        >
            <img
                src={u}
                alt=""
                onError={() => setLoadFailed(true)}
                className="h-48 w-full object-cover transition duration-200 group-hover:scale-[1.02]"
            />
        </a>
    );
}

function CardBlockHeader({ icon: Icon, title }) {
    return (
        <div className="mb-3 flex items-center gap-2.5">
            {Icon ? (
                <div className="flex size-9 items-center justify-center rounded-xl bg-[#0077b6]/10 text-khabeer-brand dark:bg-dark-accent-blue/15 dark:text-dark-accent-blue">
                    <Icon className="size-4" strokeWidth={1.75} />
                </div>
            ) : null}
            <h3 className="text-base font-bold text-[#1a1a1a] dark:text-dark-text-primary">{title}</h3>
        </div>
    );
}

function DetailRow({ label, value, children, multiline = false }) {
    const l = String(label);
    const endsWithQuestion = /[؟?]\s*$/u.test(l.trim());
    const sep = endsWithQuestion ? ' ' : ': ';
    const content = children != null ? children : value == null || value === '' ? '—' : String(value);
    return (
        <div
            className={clsx(
                'text-[15px] leading-normal',
                multiline
                    ? 'flex flex-col items-stretch gap-2'
                    : 'flex flex-wrap items-baseline gap-1.5'
            )}
        >
            <span className="shrink-0 text-[14px] font-medium text-khabeer-muted dark:text-dark-text-muted">
                {l}
                {sep}
            </span>
            <div
                className={clsx(
                    'break-words font-medium text-[#333] dark:text-dark-text-primary',
                    multiline ? 'w-full min-w-0' : 'min-w-0 sm:flex-1'
                )}
            >
                {content}
            </div>
        </div>
    );
}

const JobRequestDetails = () => {
    const { id: jobId } = useParams();
    const { token } = useAuth();
    const { language, t } = useLanguage();
    const toast = useToast();
    const isRTL = language === 'ar';

    const [confirmFollowOpen, setConfirmFollowOpen] = useState(false);
    const [markReadLoading, setMarkReadLoading] = useState(false);

    const [data, setData] = useState(/** @type {Record<string, unknown> | null} */ (null));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(/** @type {string | null} */ (null));

    const load = useCallback(async () => {
        if (!token || !jobId) {
            setLoading(false);
            setData(null);
            if (!jobId) setError(t('jobRequestDetail.loadError'));
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetchDashboardJobById(token, jobId, { lang: language });
            const raw = unwrapDashboardEnvelope(res);
            if (raw && typeof raw === 'object') {
                setData(/** @type {Record<string, unknown>} */ (raw));
            } else {
                setData(null);
                setError(t('jobRequestDetail.notFound'));
            }
        } catch (e) {
            setData(null);
            setError(getApiErrorMessage(e) || t('jobRequestDetail.loadError'));
        } finally {
            setLoading(false);
        }
    }, [token, jobId, language, t]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleMarkRead = useCallback(async () => {
        if (!token || !jobId) return;
        setMarkReadLoading(true);
        try {
            await patchDashboardJobRead(token, jobId, { lang: language });
            setData((prev) =>
                prev && typeof prev === 'object' ? { ...prev, isRead: true } : prev
            );
            toast.success(t('jobRequestDetail.followJobSuccess'));
            setConfirmFollowOpen(false);
        } catch (e) {
            toast.error(getApiErrorMessage(e) || t('jobRequestDetail.followJobError'));
        } finally {
            setMarkReadLoading(false);
        }
    }, [token, jobId, language, t, toast]);

    const specLabel = useMemo(
        () => (data ? specDisplay(data.specialization, language) : '—'),
        [data, language]
    );
    const cityL = useMemo(
        () => (data ? cityDisplay(data.city, language) : '—'),
        [data, language]
    );

    const experienceKey = useMemo(() => {
        if (!data?.experienceRange) return '';
        return String(data.experienceRange).toUpperCase();
    }, [data]);

    const experienceText = useMemo(() => {
        if (!experienceKey) return '—';
        const k = `jobRequestDetail.experience.${experienceKey}`;
        const tr = t(k);
        if (tr !== k && typeof tr === 'string') return tr;
        return String(data?.experienceRange ?? '—');
    }, [data, experienceKey, t]);

    const employmentKey = useMemo(() => {
        if (!data?.employmentType) return '';
        return String(data.employmentType).toUpperCase();
    }, [data]);

    const employmentText = useMemo(() => {
        if (!employmentKey) return '—';
        const k = `jobRequestDetail.employment.${employmentKey}`;
        const tr = t(k);
        if (tr !== k && typeof tr === 'string') return tr;
        return String(data?.employmentType ?? '—');
    }, [data, employmentKey, t]);

    const dayCodes = useMemo(
        () => (Array.isArray(data?.availableDays) ? data.availableDays.map(String) : []),
        [data]
    );

    if (loading) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-khabeer-muted">
                <Loader2 className="size-9 animate-spin text-khabeer-brand dark:text-dark-accent-blue" />
                <p className="text-sm">{t('jobRequestDetail.loading')}</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="space-y-6">
                <Link
                    to="/dashboard/jobs"
                    className="inline-flex items-center gap-2 text-sm font-medium text-khabeer-brand transition-colors hover:underline dark:text-dark-accent-blue"
                >
                    <ArrowLeft className="size-4" />
                    {t('jobRequestDetail.backToList')}
                </Link>
                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-4 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                    {error}
                </div>
            </div>
        );
    }

    if (!data) return null;

    const fullName = String(data.fullName ?? '—');
    const phone = data.phone != null ? String(data.phone) : '';
    const email = data.email != null ? String(data.email) : '';
    const isRead = data.isRead === true;
    const servicesDescription =
        typeof data.servicesDescription === 'string' && data.servicesDescription.trim()
            ? data.servicesDescription.trim()
            : '';
    const hasTools = data.hasOwnTools === true;
    const hasTransport = data.hasTransportation === true;
    const worksInField = data.worksInFieldCurrently === true;
    const agreedFreelance = data.agreesFreelanceTerms === true;
    const portfolio = Array.isArray(data.portfolioUrls) ? data.portfolioUrls : [];
    const timeStart = data.availabilityStart != null ? String(data.availabilityStart) : '—';
    const timeEnd = data.availabilityEnd != null ? String(data.availabilityEnd) : '—';
    return (
        <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <Link
                        to="/dashboard/jobs"
                        className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-khabeer-brand transition-colors hover:underline dark:text-dark-accent-blue"
                    >
                        <ArrowLeft className="size-4" />
                        {t('jobRequestDetail.backToList')}
                    </Link>
                    <h1 className="text-2xl font-extrabold leading-tight text-[#1a1a1a] dark:text-dark-text-primary sm:text-3xl">
                        {t('jobRequestDetail.title')}
                    </h1>
                </div>
                {!isRead ? (
                    <button
                        type="button"
                        onClick={() => setConfirmFollowOpen(true)}
                        className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-khabeer-brand px-5 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-khabeer-brand/40 sm:min-w-[11rem] dark:bg-dark-accent-blue dark:shadow-none dark:hover:opacity-95"
                    >
                        {t('jobRequestDetail.followJob')}
                    </button>
                ) : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-khabeer-stroke/50 bg-gradient-to-b from-white to-[#f8fafc] dark:border-dark-border dark:from-dark-bg-secondary dark:to-dark-bg-tertiary/80">
                <div className="border-b border-khabeer-stroke/40 bg-[#f3f3f3]/80 px-5 py-4 dark:border-dark-border dark:bg-dark-bg-tertiary/50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                        <div className="min-w-0">
                            <p className="flex flex-wrap items-baseline gap-1.5 text-[15px] leading-tight sm:text-base">
                                <span className="shrink-0 text-sm font-medium text-khabeer-muted dark:text-dark-text-muted">
                                    {t('jobRequestDetail.applicant')}:{' '}
                                </span>
                                <span className="min-w-0 break-words text-lg font-bold text-[#1a1a1a] sm:text-[22px] dark:text-dark-text-primary">
                                    {fullName}
                                </span>
                            </p>
                        </div>
                        <span
                            className={clsx(
                                'shrink-0 self-start rounded-full px-3.5 py-1 text-sm font-semibold',
                                isRead
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                    : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                            )}
                        >
                            {isRead ? t('jobRequestDetail.read') : t('jobRequestDetail.unread')}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                <Section title={t('jobRequestDetail.sectionContact')} icon={Phone}>
                    <div className="space-y-4">
                        <DetailRow label={t('jobRequestDetail.phone')} value={phone}>
                            {phone ? (
                                <a
                                    className="font-medium text-khabeer-brand hover:underline dark:text-dark-accent-blue"
                                    href={`tel:${phone.replace(/\s/g, '')}`}
                                    dir="ltr"
                                >
                                    {phone}
                                </a>
                            ) : null}
                        </DetailRow>
                        <DetailRow label={t('jobRequestDetail.email')} value={email}>
                            {email ? (
                                <a
                                    className="break-all font-medium text-khabeer-brand hover:underline dark:text-dark-accent-blue"
                                    href={`mailto:${email}`}
                                >
                                    {email}
                                </a>
                            ) : null}
                        </DetailRow>
                    </div>
                </Section>

                <section className="rounded-2xl border border-khabeer-stroke/60 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-bg-secondary">
                    <div className="space-y-5">
                        <div>
                            <CardBlockHeader
                                title={t('jobRequestDetail.sectionLocation')}
                                icon={MapPin}
                            />
                            <DetailRow label={t('jobRequestDetail.city')} value={cityL} />
                        </div>
                        <div
                            className="border-t border-dashed border-khabeer-stroke/50 pt-5 dark:border-dark-border/60"
                        >
                            <CardBlockHeader
                                title={t('jobRequestDetail.sectionSpecialty')}
                                icon={Briefcase}
                            />
                            <DetailRow label={t('jobRequestDetail.specialization')} value={specLabel} />
                        </div>
                    </div>
                </section>

                <Section title={t('jobRequestDetail.sectionWork')} icon={Wrench}>
                    <div className="space-y-4">
                        <DetailRow label={t('jobRequestDetail.experienceLabel')} value={experienceText} />
                        <DetailRow label={t('jobRequestDetail.employmentType')} value={employmentText} />
                        <DetailRow
                            label={t('jobRequestDetail.worksInFieldNow')}
                            value={worksInField ? t('jobRequestDetail.yes') : t('jobRequestDetail.no')}
                        />
                        {servicesDescription ? (
                            <DetailRow
                                multiline
                                label={t('jobRequestDetail.servicesDescription')}
                                value=""
                            >
                                <p className="whitespace-pre-wrap rounded-xl border border-khabeer-stroke/40 bg-[#fafafa] p-3 text-[15px] leading-relaxed text-[#333] dark:border-dark-border dark:bg-dark-bg-tertiary/60 dark:text-dark-text-primary">
                                    {servicesDescription}
                                </p>
                            </DetailRow>
                        ) : (
                            <DetailRow label={t('jobRequestDetail.servicesDescription')} value="—" />
                        )}
                    </div>
                </Section>

                <Section title={t('jobRequestDetail.sectionCapabilities')} icon={Package}>
                    <div className="space-y-3">
                        <DetailRow
                            label={t('jobRequestDetail.hasOwnTools')}
                            value={hasTools ? t('jobRequestDetail.yes') : t('jobRequestDetail.no')}
                        />
                        <DetailRow
                            label={t('jobRequestDetail.hasTransportation')}
                            value={hasTransport ? t('jobRequestDetail.yes') : t('jobRequestDetail.no')}
                        />
                    </div>
                </Section>

                <Section title={t('jobRequestDetail.sectionAvailability')} icon={Calendar} className="lg:col-span-2">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-2 text-[15px]">
                            <span className="shrink-0 text-[14px] font-medium text-khabeer-muted dark:text-dark-text-muted">
                                {t('jobRequestDetail.availableDays')}:{' '}
                            </span>
                            {dayCodes.length > 0 ? (
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                    {dayCodes.map((code) => {
                                        const dKey = `jobRequestDetail.day.${String(code).toUpperCase()}`;
                                        const dLabel = t(dKey);
                                        return (
                                            <span
                                                key={code}
                                                className="rounded-lg border border-khabeer-stroke/70 bg-white px-3 py-1.5 text-sm font-medium text-[#333] dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                                            >
                                                {dLabel !== dKey ? dLabel : code}
                                            </span>
                                        );
                                    })}
                                </div>
                            ) : (
                                <span className="font-medium text-[#333] dark:text-dark-text-primary">—</span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-baseline gap-1.5 text-[15px]">
                            <span className="shrink-0 text-[14px] font-medium text-khabeer-muted dark:text-dark-text-muted">
                                {t('jobRequestDetail.availabilityTime')}:{' '}
                            </span>
                            <div
                                className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-khabeer-stroke/50 bg-[#fafafa] px-3 py-1.5 dark:border-dark-border dark:bg-dark-bg-tertiary/50"
                            >
                                <Clock className="size-4 shrink-0 text-khabeer-muted" />
                                <span dir="ltr" className="font-medium text-[#333] dark:text-dark-text-primary">
                                    {timeStart}
                                </span>
                                <span className="text-khabeer-muted">—</span>
                                <span dir="ltr" className="font-medium text-[#333] dark:text-dark-text-primary">
                                    {timeEnd}
                                </span>
                            </div>
                        </div>
                    </div>
                </Section>
            </div>

            {portfolio.length > 0 ? (
                <section className="rounded-2xl border border-khabeer-stroke/60 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-bg-secondary">
                    <div className="mb-3 flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-[#0077b6]/10 text-khabeer-brand">
                            <ImageIcon className="size-4" strokeWidth={1.75} />
                        </div>
                        <h2 className="text-lg font-bold text-[#1a1a1a] dark:text-dark-text-primary">
                            {t('jobRequestDetail.sectionPortfolio')}
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {portfolio.map((url, i) => (
                            <JobPortfolioItem key={`${String(url)}-${i}`} href={String(url)} />
                        ))}
                    </div>
                </section>
            ) : null}

            <Section title={t('jobRequestDetail.sectionOther')} icon={MessageCircle}>
                <DetailRow
                    label={t('jobRequestDetail.freelanceTerms')}
                    value={agreedFreelance ? t('jobRequestDetail.yes') : t('jobRequestDetail.no')}
                />
            </Section>

            {confirmFollowOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/60"
                    role="presentation"
                    onClick={() => {
                        if (!markReadLoading) setConfirmFollowOpen(false);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="follow-job-dialog-title"
                        className="w-full max-w-md rounded-2xl border border-khabeer-stroke/60 bg-white p-5 shadow-xl dark:border-dark-border dark:bg-dark-bg-secondary"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p
                            id="follow-job-dialog-title"
                            className="text-center text-base font-medium leading-relaxed text-[#1a1a1a] dark:text-dark-text-primary"
                        >
                            {t('jobRequestDetail.followJobConfirm')}
                        </p>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmFollowOpen(false)}
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

export default JobRequestDetails;
