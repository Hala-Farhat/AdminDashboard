import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { fetchDashboardCustomerDetails, unwrapDashboardEnvelope } from '../api/dashboardApi';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
    Loader2,
    ArrowLeft,
    Mail,
    MapPin,
    User,
    Phone,
    Star,
    AlertCircle,
} from 'lucide-react';
import AvatarOrInitial from '../components/AvatarOrInitial';
import clsx from 'clsx';
import { getApiErrorMessage } from '../utils/providerUserManagement';

function normalizeInServiceZoneValue(area) {
    const raw =
        area?.isInServiceZone ??
        area?.inServiceZone ??
        area?.isSupportedZone ??
        area?.supportedInZone ??
        area?.isWithinCoverage ??
        area?.insideCoverageZone;
    if (raw === true || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 0 || raw === '0') return false;
    if (typeof raw === 'string') {
        const v = raw.trim().toLowerCase();
        if (['true', 'yes', 'supported', 'in_zone', 'inside'].includes(v)) return true;
        if (['false', 'no', 'unsupported', 'out_of_zone', 'outside'].includes(v)) return false;
    }
    return null;
}

function mapCustomerAddresses(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list.map((area) => ({
        id: area.locationId,
        label: area.label,
        fullAddress: area.fullAddress,
        postalCode: area.postalCode,
        isPreferred: area.isDefault === true,
        street: area.street,
        district: area.district,
        city: area.city,
        country: area.country,
        lat: area.coordinates?.lat,
        lng: area.coordinates?.lng,
        isInServiceZone: normalizeInServiceZoneValue(area),
    }));
}

/** GET /manage/dashboard/customers/:firebaseUid/details أو صف من القائمة (قبل اكتمال الجلب). */
function mapCustomerDetailPayload(data, idParam) {
    if (!data || typeof data !== 'object') return null;
    const rootUid = String(data.firebaseUid ?? data.manageUserId ?? idParam ?? '').trim() || (idParam != null ? String(idParam) : '');
    const hasNestedPersonal = data.personalInfo && typeof data.personalInfo === 'object';
    const pi = hasNestedPersonal ? data.personalInfo : {};
    const displayName =
        (pi.displayName && String(pi.displayName).trim()) ||
        (data.displayName && String(data.displayName).trim()) ||
        `${data.first_name || ''} ${data.last_name || ''}`.trim() ||
        '';
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const first_name = data.first_name || pi.first_name || nameParts[0] || '';
    const last_name = data.last_name || pi.last_name || nameParts.slice(1).join(' ') || '';

    const email = pi.email ?? data.email ?? '';
    const phone = pi.phone ?? pi.phoneNumber ?? data.phone ?? data.phoneNumber ?? data.mobile ?? '';

    let isActive = true;
    for (const v of [data.isActive, pi.isActive]) {
        if (v === false || v === 'false') isActive = false;
    }
    if (typeof pi.accountStatus === 'string' && pi.accountStatus.toLowerCase() === 'inactive') {
        isActive = false;
    }

    return {
        id: rootUid,
        firebaseUid: rootUid,
        manageUserId: rootUid,
        first_name,
        last_name,
        displayName: displayName || email || '—',
        email,
        phone,
        avatarUrl: pi.avatarUrl ?? data.avatarUrl,
        createdAt: pi.joinedAt ?? pi.createdAt ?? data.createdAt,
        ordersCount: pi.ordersCount ?? data.ordersCount,
        isActive,
        gender: pi.gender ?? data.gender ?? null,
        birthDate: pi.birthDate ?? pi.dateOfBirth ?? null,
        addresses: mapCustomerAddresses(data.addresses),
    };
}

const ClientDetails = () => {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { token } = useAuth();
    const { language, t } = useLanguage();

    const [client, setClient] = useState(() =>
        location.state?.client ? mapCustomerDetailPayload(location.state.client, id) : null
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('personalInfo');
    const [shellOffsetPx, setShellOffsetPx] = useState(0);

    const isRTL = language === 'ar';

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const media = window.matchMedia('(min-width: 1024px)');
        let resizeObs;
        let mutationObs;

        const updateShellOffset = () => {
            if (!media.matches) {
                setShellOffsetPx(0);
                return;
            }
            const sidebarEl = document.querySelector('aside');
            const next = sidebarEl ? Math.round(sidebarEl.getBoundingClientRect().width) : 0;
            setShellOffsetPx(next);
        };

        updateShellOffset();
        window.addEventListener('resize', updateShellOffset);

        const sidebarEl = document.querySelector('aside');
        if (sidebarEl && typeof ResizeObserver !== 'undefined') {
            resizeObs = new ResizeObserver(updateShellOffset);
            resizeObs.observe(sidebarEl);
        }
        if (sidebarEl && typeof MutationObserver !== 'undefined') {
            mutationObs = new MutationObserver(updateShellOffset);
            mutationObs.observe(sidebarEl, { attributes: true, attributeFilter: ['class', 'style'] });
        }

        return () => {
            window.removeEventListener('resize', updateShellOffset);
            resizeObs?.disconnect();
            mutationObs?.disconnect();
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const fetchClient = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetchDashboardCustomerDetails(token, id, { lang: language });
                if (cancelled) return;
                const data = unwrapDashboardEnvelope(response);
                if (data && typeof data === 'object') {
                    setClient(mapCustomerDetailPayload(data, id));
                } else {
                    setError(t('clientDetails.notFound'));
                }
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setError(getApiErrorMessage(e) || t('common.error'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchClient();
        return () => {
            cancelled = true;
        };
    }, [id, token, language, t]);

    function InfoCard({ icon, title, children, className }) {
        const Icon = icon;
        return (
            <div
                className={clsx(
                    'rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 dark:border-dark-border dark:bg-dark-bg-secondary dark:shadow-dark-md',
                    className
                )}
            >
                <div className="mb-4 flex items-center gap-4">
                    <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-dark-bg-elevated dark:text-dark-accent-purple">
                        <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">{title}</h3>
                </div>
                {children}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600 dark:text-dark-accent-purple" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex h-screen flex-col items-center justify-center p-8 text-center">
                <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
                <p className="mb-2 text-xl font-semibold text-gray-900 dark:text-dark-text-primary">{error}</p>
                <button
                    type="button"
                    onClick={() => navigate('/dashboard/users')}
                    className="flex items-center font-medium text-indigo-600 hover:text-indigo-700 dark:text-dark-accent-purple"
                >
                    <ArrowLeft className="me-2 h-4 w-4" />
                    {t('clientDetails.backToList')}
                </button>
            </div>
        );
    }
    if (!client) {
        return (
            <div className="flex h-screen flex-col items-center justify-center p-8 text-center">
                <AlertCircle className="mb-4 h-12 w-12 text-yellow-500" />
                <p className="mb-2 text-xl font-semibold text-gray-900 dark:text-dark-text-primary">{t('clientDetails.noData')}</p>
                <button
                    type="button"
                    onClick={() => navigate('/dashboard/users')}
                    className="flex items-center font-medium text-indigo-600 hover:text-indigo-700 dark:text-dark-accent-purple"
                >
                    <ArrowLeft className="me-2 h-4 w-4" />
                    {t('clientDetails.backToList')}
                </button>
            </div>
        );
    }

    const displayName = client.displayName || `${client.first_name} ${client.last_name}`.trim() || '—';
    const headerTitle = `${client.first_name} ${client.last_name}`.trim() || displayName;

    return (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-transparent pb-12 text-start transition-colors duration-300">
            <div
                className="fixed z-50 border-b border-gray-200/60 bg-white/90 shadow-sm backdrop-blur-xl transition-all duration-300 dark:border-white/5 dark:bg-[#0B0D14]/90 dark:shadow-2xl"
                style={{
                    top: typeof window !== 'undefined' && window.innerWidth >= 1024 ? 80 : 0,
                    ...(isRTL ? { right: shellOffsetPx, left: 0 } : { left: shellOffsetPx, right: 0 }),
                }}
            >
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex min-h-[4.5rem] flex-wrap items-center gap-3 py-3 sm:min-h-[5rem] sm:flex-nowrap sm:py-0">
                        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="group shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 transition-all duration-300 hover:border-indigo-500/30 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                            >
                                <ArrowLeft
                                    className={`h-5 w-5 text-gray-400 transition-colors group-hover:text-indigo-600 dark:text-gray-400 dark:group-hover:text-white ${language === 'ar' ? 'rotate-180 transform' : ''}`}
                                />
                            </button>

                            <div className="hidden h-8 w-px shrink-0 bg-gray-200 dark:bg-white/10 sm:block" />

                            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                                <div className="relative shrink-0">
                                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-100 to-white shadow-lg ring-2 ring-white dark:from-[#1E2128] dark:to-[#0B0D14] dark:ring-[#1E2128]">
                                        <AvatarOrInitial
                                            name={displayName}
                                            avatarUrl={client.avatarUrl}
                                            className="text-sm font-black text-indigo-600 dark:text-indigo-400"
                                        />
                                    </div>
                                </div>

                                <div className="min-w-0">
                                    <h1 className="truncate text-lg font-black leading-tight tracking-tight text-gray-900 dark:text-white sm:text-xl">
                                        {headerTitle}
                                    </h1>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="h-[4.75rem] sm:h-[5.25rem] lg:h-[6rem]" />

            <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex w-full items-center justify-between border-b border-gray-200 dark:border-dark-border">
                    {(['personalInfo', 'serviceAreas']).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={clsx(
                                'flex-1 whitespace-nowrap border-b-2 pb-3 text-center text-sm font-bold uppercase tracking-wider transition-all duration-300',
                                activeTab === tab
                                    ? 'border-indigo-600 text-indigo-600 dark:border-dark-accent-purple dark:text-dark-accent-purple'
                                    : 'border-transparent text-gray-500 hover:rounded-t-lg hover:bg-gray-50 hover:text-gray-700 dark:text-dark-text-secondary dark:hover:bg-white/5 dark:hover:text-dark-text-primary'
                            )}
                        >
                            {tab === 'personalInfo' ? t('clientDetails.tabs.personalInfo') : t('clientDetails.tabs.serviceAreas')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mx-auto max-w-7xl animate-fade-in px-4 py-8 sm:px-6 lg:px-8">
                {activeTab === 'personalInfo' && (
                    <InfoCard icon={User} title={t('clientDetails.personalInfoTitle')} className="mx-auto max-w-2xl dark:border-dark-border">
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 transition-colors duration-300 dark:border-dark-border dark:bg-dark-bg-tertiary">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-indigo-500 shadow-sm dark:bg-dark-bg-elevated dark:text-dark-accent-purple">
                                    <Mail className="h-6 w-6" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-dark-text-muted">
                                        {t('providerDetails.personal.email')}
                                    </div>
                                    <div className="break-all text-lg font-bold text-gray-900 dark:text-dark-text-primary" title={client.email}>
                                        {client.email || '—'}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 transition-colors duration-300 dark:border-dark-border dark:bg-dark-bg-tertiary">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-indigo-500 shadow-sm dark:bg-dark-bg-elevated dark:text-dark-accent-purple">
                                    <Phone className="h-6 w-6" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-dark-text-muted">
                                        {t('providerDetails.personal.phone')}
                                    </div>
                                    <div className="text-lg font-bold text-gray-900 dark:text-dark-text-primary" dir="ltr">
                                        {client.phone && String(client.phone).trim() ? client.phone : '—'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </InfoCard>
                )}

                {activeTab === 'serviceAreas' && (
                    <InfoCard icon={MapPin} title={t('clientDetails.tabs.serviceAreas')} className="dark:border-dark-border">
                        {client.addresses && client.addresses.length > 0 ? (
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                {client.addresses.map((addr, idx) => (
                                    <div
                                        key={addr.id || idx}
                                        className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 transition-all hover:border-indigo-200 hover:shadow-md dark:border-dark-border dark:bg-dark-bg-elevated dark:hover:border-dark-accent-purple/50 dark:hover:shadow-dark-lg"
                                    >
                                        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2 dark:border-dark-border">
                                            <div className="flex items-center gap-2">
                                                <span className="flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-gray-600 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
                                                    {addr.label || t('providerDetails.locations.location')}
                                                </span>
                                                {addr.isPreferred ? (
                                                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-yellow-50 px-3 py-1 text-[10px] font-bold text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400">
                                                        <Star className="me-1 h-3 w-3 fill-yellow-600 dark:fill-yellow-400" />{' '}
                                                        {t('providerDetails.locations.preferred')}
                                                    </span>
                                                ) : null}
                                                {addr.isInServiceZone === true ? (
                                                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-bold text-white dark:bg-emerald-500">
                                                        {t('providerDetails.locations.supportedZone')}
                                                    </span>
                                                ) : null}
                                                {addr.isInServiceZone === false ? (
                                                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold text-white dark:bg-red-500">
                                                        {t('providerDetails.locations.unsupportedZone')}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="space-y-3 text-sm">
                                            <div>
                                                <div className="mb-0.5 text-xs font-semibold uppercase text-gray-400 dark:text-dark-text-muted">
                                                    {t('providerDetails.locations.fullAddress')}
                                                </div>
                                                <div className="font-medium leading-snug text-gray-900 dark:text-dark-text-primary">
                                                    {addr.fullAddress ||
                                                        [addr.street, addr.district, addr.city, addr.country].filter(Boolean).join(', ') ||
                                                        '—'}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                {addr.postalCode ? (
                                                    <div>
                                                        <div className="mb-0.5 text-xs font-semibold uppercase text-gray-400 dark:text-dark-text-muted">
                                                            {t('providerDetails.locations.postalCode')}
                                                        </div>
                                                        <div className="font-mono font-medium text-gray-700 dark:text-dark-text-secondary">
                                                            {addr.postalCode}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>

                                            {addr.lat != null && addr.lng != null ? (
                                                <div className="mt-1 flex items-center border-t border-gray-50 pt-2 dark:border-dark-border">
                                                    <a
                                                        href={`https://www.google.com/maps?q=${addr.lat},${addr.lng}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-700 dark:text-dark-accent-purple dark:hover:text-indigo-400"
                                                    >
                                                        <MapPin className="me-1 h-3 w-3" /> {t('providerDetails.locations.viewOnMap')}
                                                    </a>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-4 text-center text-sm text-gray-400 dark:text-dark-text-muted">
                                {t('providerDetails.locations.noAddresses')}
                            </div>
                        )}
                    </InfoCard>
                )}
            </div>
        </div>
    );
};

export default ClientDetails;
