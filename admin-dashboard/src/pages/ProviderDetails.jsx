import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/apiConfig';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useCache } from '../context/CacheContext';
import {
    Loader2,
    ArrowLeft,
    CheckCircle,
    XCircle,
    Calendar,
    Mail,
    User,
    Briefcase,
    FileText,
    AlertCircle,
    MapPin,
    Image as ImageIcon,
    Download,
    Star,
    Zap,
    UserX,
    MessageSquare,
} from 'lucide-react';
import AvatarOrInitial from '../components/AvatarOrInitial';
import { formatImageUrl } from '../api/urlHelpers';
import {
    fetchDashboardJoinRequestsList,
    parseJoinRequestsListResponse,
    fetchDashboardJoinRequestById,
    parseJoinRequestDetailResponse,
} from '../api/dashboardApi';
import clsx from 'clsx';

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

function normalizeApplicationStatusKey(raw) {
    if (raw == null || raw === '') return 'submitted';
    const u = String(raw).toUpperCase().replace(/-/g, '_');
    const map = {
        UNDER_REVIEW: 'underReview',
        SUBMITTED: 'submitted',
        DRAFT: 'draft',
        APPROVED: 'approved',
        REJECTED: 'rejected',
    };
    if (map[u]) return map[u];
    const s = String(raw);
    if (['submitted', 'underReview', 'approved', 'rejected', 'draft'].includes(s)) return s;
    return 'submitted';
}

/** query ?status= — نفس منطق mapDashboardExpert في Providers */
function joinListItemStatusQueryParam(item) {
    const statusRaw = item?.applicationStatus ?? item?.status;
    if (statusRaw == null || statusRaw === '') return null;
    const u = String(statusRaw)
        .toUpperCase()
        .replace(/-/g, '_');
    const map = {
        DRAFT: 'draft',
        SUBMITTED: 'submitted',
        UNDER_REVIEW: 'underReview',
        APPROVED: 'approved',
        REJECTED: 'rejected',
    };
    return map[u] || null;
}

/**
 * إشعار الانضمام يمرّر أحياناً applicationId في المسار بينما GET experts/:id يتوقع providerId.
 * 1) GET join-requests/:id — يعيد providerId + applicationId
 * 2) وإلا البحث في join-requests/list
 */
async function tryNavigateToProviderFromJoinApplicationId({ token, language, routeId, navigate }) {
    if (!token || !routeId) return false;
    const needle = String(routeId).trim();

    try {
        const res = await fetchDashboardJoinRequestById(token, needle, { lang: language });
        const parsed = parseJoinRequestDetailResponse(res);
        if (parsed) {
            const { providerId, applicationId, raw } = parsed;
            const params = new URLSearchParams();
            if (applicationId && applicationId !== providerId) {
                params.set('appId', applicationId);
            }
            const st = joinListItemStatusQueryParam(raw);
            if (st) params.set('status', st);
            const qs = params.toString();
            const next = `/dashboard/provider/${encodeURIComponent(providerId)}${qs ? `?${qs}` : ''}`;
            if (typeof window !== 'undefined' && next !== window.location.pathname + window.location.search) {
                navigate(next, { replace: true });
                return true;
            }
        }
    } catch {
        /* غالباً 404 إن لم يُعرّف GET لهذا المسار */
    }

    try {
        const res = await fetchDashboardJoinRequestsList(token, {
            lang: language,
            page: 1,
            limit: 30,
            search: needle,
            joinPeriod: 'all',
            applicationStatus: 'all',
            accountStatus: 'all',
        });
        const { data } = parseJoinRequestsListResponse(res);
        for (const item of data || []) {
            const appId = item.applicationId != null ? String(item.applicationId).trim() : '';
            const provId = item.providerId != null ? String(item.providerId).trim() : '';
            if (appId && appId === needle && provId && provId !== needle) {
                const params = new URLSearchParams();
                params.set('appId', appId);
                const st = joinListItemStatusQueryParam(item);
                if (st) params.set('status', st);
                navigate(`/dashboard/provider/${encodeURIComponent(provId)}?${params.toString()}`, { replace: true });
                return true;
            }
        }
    } catch (e) {
        console.error('Join list lookup for provider redirect:', e);
    }
    return false;
}

const ProviderDetails = () => {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { token } = useAuth();
    const { language, t } = useLanguage();
    const toast = useToast();
    const { invalidate } = useCache();

    // Initial state can come from list view, but we rely on fetch for full details
    const [provider, setProvider] = useState(location.state?.provider || null);
    const [loading, setLoading] = useState(!provider);
    const [error, setError] = useState(null);

    const [actionLoading, setActionLoading] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // { type: 'approve' | 'startReview' }

    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectSubmitting, setRejectSubmitting] = useState(false);
    const [rejectReasonError, setRejectReasonError] = useState('');

    const [subcategoryName, setSubcategoryName] = useState(null);
    const [note, setNote] = useState('');
    const [activeTab, setActiveTab] = useState('overview');
    const [shellOffsetPx, setShellOffsetPx] = useState(0);

    /** Raw GET /manage/dashboard/experts/:providerId/details payload — needed for deactivate/activate id resolution. */
    const [rawDetailPayload, setRawDetailPayload] = useState(null);

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

    // Fetch provider details from the new endpoint
    useEffect(() => {
        let cancelled = false;

        const fetchProviderDetails = async () => {
            setLoading(true);
            setError(null);
            let didRedirect = false;
            try {
                const response = await api.get(`/manage/dashboard/experts/${encodeURIComponent(id)}/details`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (cancelled) return;

                if (response.data && response.data.success) {
                    const data = response.data.data || {};
                    setRawDetailPayload(Object.keys(data).length ? data : null);

                    // Map /manage/dashboard/experts/:providerId/details response shape.
                    const userData = data.personalInfo || {};
                    const profData = data.professionalInfo || {};
                    const specialization = profData.specialization || {};
                    const serviceAreas = Array.isArray(data.serviceAreas) ? data.serviceAreas : [];
                    const attachments = Array.isArray(data.attachments) ? data.attachments : [];

                    const mappedProviderData = {
                        ...provider,
                        id: id,
                        providerId: data.providerId || id,
                        applicationId: provider?.applicationId || null,
                        manageUserId: provider?.manageUserId || data.firebaseUid || data.userId || null,

                        // UI helpers - support flat properties
                        first_name: userData.first_name || (userData.displayName || '').split(' ')[0] || '',
                        last_name: userData.last_name || (userData.displayName || '').split(' ').slice(1).join(' ') || '',
                        displayName: userData.displayName || data.displayName,
                        email: userData.email || data.email,
                        phone: userData.phoneNumber ?? userData.phone ?? '',
                        avatarUrl: provider?.avatarUrl || userData.avatarUrl || data.avatarUrl,
                        gender: userData.gender || null,
                        birthDate: userData.birthDate || null,
                        accountStatus: userData.accountStatus || null,

                        // Nested data preservation
                        provider: profData,
                        subCategory: specialization || null,
                        addresses: serviceAreas.map((area) => ({
                            id: area.locationId,
                            label: area.label,
                            fullAddress: area.fullAddress,
                            postalCode: area.postalCode,
                            isPreferred: area.isDefault === true,
                            street: area.fullAddress,
                            lat: area.coordinates?.lat,
                            lng: area.coordinates?.lng,
                            isInServiceZone: normalizeInServiceZoneValue(area),
                        })),
                        skills: (Array.isArray(profData?.services) ? profData.services : []).map((s) =>
                            typeof s === 'string' ? { name: s } : s
                        ),
                        media: attachments.map((item) => ({
                            id: item.portfolioId,
                            url: item.url,
                            type: item.type,
                            name: item.type,
                        })),
                        description: profData.description || '',
                        experienceYears: profData.experienceYears ?? 0,

                        // Request status is independent from account active state.
                        status: normalizeApplicationStatusKey(userData.applicationStatus || data.applicationStatus || provider?.status),
                        isActive: (() => {
                            const vals = [
                                data.isActive,
                                data.active,
                                userData.isActive,
                                provider?.isActive,
                            ];
                            let explicitFalse = false;
                            let explicitTrue = false;
                            for (const v of vals) {
                                if (v === false || v === 'false') explicitFalse = true;
                                if (v === true || v === 'true') explicitTrue = true;
                            }
                            if (explicitFalse) return false;
                            if (explicitTrue) return true;
                            return true;
                        })()
                    };

                    setProvider(mappedProviderData);
                    const subCat = specialization;
                    setSubcategoryName(language === 'ar' ? (subCat?.nameAr || subCat?.name) : (subCat?.nameEn || subCat?.name));
                } else {
                    didRedirect = await tryNavigateToProviderFromJoinApplicationId({
                        token,
                        language,
                        routeId: id,
                        navigate,
                    });
                    if (!cancelled && !didRedirect) setError(t('providerDetails.notFound'));
                }
            } catch (err) {
                console.error('Error fetching provider details:', err);
                if (cancelled) return;
                didRedirect = await tryNavigateToProviderFromJoinApplicationId({
                    token,
                    language,
                    routeId: id,
                    navigate,
                });
                if (!didRedirect) setError(t('providerDetails.loadError'));
            } finally {
                if (!cancelled && !didRedirect) setLoading(false);
            }
        };

        if (id) {
            fetchProviderDetails();
        }
        return () => {
            cancelled = true;
        };
    }, [id, token, language, t, location.search, navigate]);


    const openConfirmModal = (type) => {
        setPendingAction({ type });
        setShowConfirmModal(true);
    };

    const closeConfirmModal = () => {
        if (actionLoading) return;
        setShowConfirmModal(false);
        setPendingAction(null);
        setNote('');
    };

    const openRejectFlow = () => {
        setNote('');
        setRejectReasonError('');
        setRejectModalOpen(true);
    };

    const closeRejectFlow = () => {
        if (rejectSubmitting) return;
        setRejectModalOpen(false);
        setNote('');
        setRejectReasonError('');
    };

    const getJoinRequestId = () =>
        new URLSearchParams(location.search).get('appId') ||
        provider?.applicationId ||
        rawDetailPayload?.applicationId ||
        null;

    const submitFinalReject = async () => {
        setRejectSubmitting(true);
        try {
            const requestId = getJoinRequestId();
            if (!requestId) {
                toast.error(t('providerDetails.messages.error'));
                return;
            }
            const endpoint = `/manage/dashboard/join-requests/${encodeURIComponent(requestId)}/reject`;
            await api.patch(
                endpoint,
                { rejectionReason: note.trim() || '' },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(t('providerDetails.messages.rejectSuccess'));
            invalidate('providers');
            setRejectModalOpen(false);
            setNote('');
            setRejectReasonError('');
            navigate('/dashboard/rejected');
        } catch (err) {
            console.error('Error rejecting provider:', err);
            toast.error(t('providerDetails.messages.error'));
        } finally {
            setRejectSubmitting(false);
        }
    };

    const confirmRejectWithReason = async () => {
        if (!note.trim()) {
            setRejectReasonError(t('providerDetails.rejectFlow.reasonRequired'));
            return;
        }
        setRejectReasonError('');
        await submitFinalReject();
    };

    const executeAction = async () => {
        if (!pendingAction) return;
        const { type } = pendingAction;
        if (type !== 'approve' && type !== 'startReview') return;

        setActionLoading(true);
        try {
            const requestId = getJoinRequestId();
            if (!requestId) {
                toast.error(t('providerDetails.messages.error'));
                return;
            }
            let endpoint;

            if (type === 'approve') {
                endpoint = `/manage/dashboard/join-requests/${encodeURIComponent(requestId)}/approve`;
            } else {
                endpoint = `/manage/dashboard/join-requests/${encodeURIComponent(requestId)}/start-review`;
            }

            await api.patch(endpoint, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });

            let successMessageKey = 'approveSuccess';
            if (type === 'startReview') successMessageKey = 'startReviewSuccess';

            toast.success(t(`providerDetails.messages.${successMessageKey}`));
            invalidate('providers');

            if (type === 'approve') {
                navigate('/dashboard/approved');
            } else if (type === 'startReview') {
                navigate('/dashboard/under-review');
            }
        } catch (err) {
            console.error(`Error ${type}ing provider:`, err);
            toast.error(t('providerDetails.messages.error'));
        } finally {
            setActionLoading(false);
            setShowConfirmModal(false);
            setPendingAction(null);
            setNote('');
        }
    };

    if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-10 w-10 animate-spin text-indigo-600" /></div>;
    if (error) return (
        <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-xl font-semibold text-gray-900 mb-2">{error}</p>
            <button onClick={() => navigate('/dashboard')} className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center">
                <ArrowLeft className="h-4 w-4 me-2" /> {t('providerDetails.backToList')}
            </button>
        </div>
    );
    if (!provider) return (
        <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
            <p className="text-xl font-semibold text-gray-900 mb-2">{t('providerDetails.noData') || 'No provider data found.'}</p>
            <button onClick={() => navigate('/dashboard/submitted?view=all')} className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center">
                <ArrowLeft className="h-4 w-4 me-2" /> {t('providerDetails.backToList') || 'Back to Providers'}
            </button>
        </div>
    );

    const status = normalizeApplicationStatusKey(provider.status);
    const isApprovedInactive =
        status === 'approved' && (provider.isActive === false || provider.isActive === 'false');
    const requestStatusLabel = status === 'approved' ? t('providers.statusOption.accepted') : t(`providers.status.${status}`);
    const accountStatusLabel =
        provider.isActive === false || provider.isActive === 'false'
            ? t('common.inactive')
            : t('common.active');

    const outcomeStepLabel =
        status === 'rejected'
            ? t('providers.status.rejected')
            : t('providers.statusOption.accepted');
    const OutcomeIcon = status === 'rejected' ? XCircle : CheckCircle;

    const steps = [
        { key: 'submitted', label: t('providers.status.submitted'), icon: Calendar },
        { key: 'underReview', label: t('providers.status.underReview'), icon: FileText },
        { key: 'outcome', label: outcomeStepLabel, icon: OutcomeIcon }
    ];

    const getCurrentStepIndex = () => {
        if (status === 'submitted') return 0;
        if (status === 'underReview') return 1;
        if (status === 'approved' || status === 'rejected') return 2;
        return 0;
    };

    const currentStepIndex = getCurrentStepIndex();

    // -- Sub-Components for cleaner render --

    function InfoCard({ icon, title, children, className }) {
        const Icon = icon;
        return (
            <div className={clsx("bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm dark:shadow-dark-md border border-gray-100 dark:border-dark-border p-6 transition-all duration-300", className)}>
                <div className="flex items-center mb-4 gap-4">
                    <div className="p-2 bg-indigo-50 dark:bg-dark-bg-elevated rounded-lg text-indigo-600 dark:text-dark-accent-purple">
                        <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">{title}</h3>
                </div>
                {children}
            </div>
        );
    }

    return (
        <div
            dir={isRTL ? 'rtl' : 'ltr'}
            className="min-h-screen bg-transparent pb-12 text-start transition-colors duration-300"
        >
            {/* Confirmation Modal (approve / start review) */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-dark-bg-elevated rounded-2xl shadow-xl max-w-md w-full p-6 transform transition-all ring-1 ring-black/5 dark:ring-white/10 border border-gray-100 dark:border-dark-border">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-2">{t('common.areYouSure')}</h3>
                        <p className="text-gray-500 dark:text-dark-text-secondary mb-4 leading-relaxed text-sm">
                            {t(`providerDetails.confirmations.${pendingAction?.type}`)}
                        </p>
                        <div className={clsx('flex gap-3', isRTL ? 'flex-row-reverse justify-start' : 'justify-end')}>
                            <button
                                type="button"
                                onClick={closeConfirmModal}
                                disabled={actionLoading}
                                className="px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg-tertiary rounded-xl hover:bg-gray-200 dark:hover:bg-dark-bg-secondary transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={executeAction}
                                disabled={actionLoading}
                                className={clsx(
                                    'inline-flex min-w-[100px] items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-md transition-all disabled:opacity-70',
                                    pendingAction?.type === 'approve'
                                        ? 'bg-green-600 hover:bg-green-700 dark:bg-dark-accent-green dark:hover:bg-green-500'
                                        : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-dark-accent-purple dark:hover:bg-indigo-500'
                                )}
                            >
                                {actionLoading ? (
                                    <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
                                ) : null}
                                {actionLoading ? null : t('common.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {rejectModalOpen && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/[0.66] p-4 backdrop-blur-[2px]"
                    role="presentation"
                    onClick={closeRejectFlow}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        data-provider-reject-modal
                        className="w-full max-w-[400px] rounded-2xl bg-white p-4 shadow-xl dark:bg-dark-bg-elevated dark:ring-1 dark:ring-white/10"
                        dir={isRTL ? 'rtl' : 'ltr'}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col items-center gap-6">
                            <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[#fbeeee] dark:bg-red-950/40">
                                <XCircle className="size-12 text-[#ef4444]" strokeWidth={1.75} />
                            </div>
                            <div className="flex w-full flex-col items-center gap-2 text-center">
                                <h2 className="text-lg font-bold leading-normal text-[#333] dark:text-dark-text-primary">
                                    {t('providerDetails.rejectFlow.choiceTitle')}
                                </h2>
                                <p className="text-base font-medium leading-normal text-[#666] dark:text-dark-text-secondary">
                                    {t('providerDetails.rejectFlow.choiceDescription')}
                                </p>
                            </div>
                            <div className="w-full">
                                <label
                                    htmlFor="reject-reason"
                                    className="mb-1.5 block text-start text-sm font-medium text-[#333] dark:text-dark-text-primary"
                                >
                                    {t('providerDetails.confirmations.rejectionReason')}
                                </label>
                                <div className="relative w-full">
                                    <textarea
                                        id="reject-reason"
                                        value={note}
                                        onChange={(e) => {
                                            setNote(e.target.value);
                                            if (rejectReasonError) setRejectReasonError('');
                                        }}
                                        placeholder={t('providerDetails.confirmations.rejectionReasonPlaceholder')}
                                        rows={3}
                                        aria-invalid={!!rejectReasonError}
                                        aria-describedby={rejectReasonError ? 'reject-reason-error' : undefined}
                                        className={clsx(
                                            'min-h-[85px] w-full resize-none rounded-xl border bg-white px-4 py-2 pe-11 text-sm text-[#333] placeholder:text-[#999] focus:outline-none focus:ring-2 dark:bg-dark-bg-tertiary dark:text-dark-text-primary dark:placeholder-dark-text-muted',
                                            rejectReasonError
                                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
                                                : 'border-[#e2e2e2] focus:border-indigo-400 focus:ring-indigo-500/20 dark:border-dark-border'
                                        )}
                                    />
                                    <MessageSquare
                                        className="pointer-events-none absolute end-3 top-2 size-6 text-[#999] dark:text-dark-text-muted"
                                        strokeWidth={1.5}
                                    />
                                </div>
                                {rejectReasonError ? (
                                    <p
                                        id="reject-reason-error"
                                        role="alert"
                                        className="mt-1.5 text-start text-sm font-medium text-red-600 dark:text-red-400"
                                    >
                                        {rejectReasonError}
                                    </p>
                                ) : null}
                            </div>
                            <div
                                className={clsx('flex h-12 w-full gap-2.5', isRTL && 'flex-row-reverse')}
                            >
                                <button
                                    type="button"
                                    onClick={closeRejectFlow}
                                    disabled={rejectSubmitting}
                                    className="flex flex-1 items-center justify-center rounded-xl bg-[#f1f3ff] px-4 text-base font-medium text-[#666] transition-colors hover:bg-[#e8ecfc] disabled:opacity-50 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-bg-secondary"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmRejectWithReason}
                                    disabled={rejectSubmitting}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#ef4444] px-4 text-base font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-70 dark:bg-red-600 dark:hover:bg-red-500"
                                >
                                    {rejectSubmitting ? (
                                        <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
                                    ) : (
                                        t('common.confirm')
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Fixed header that follows scroll and aligns with content start. */}
            <div
                className="fixed z-50 border-b border-gray-200/60 bg-white/90 backdrop-blur-xl shadow-sm transition-all duration-300 dark:border-white/5 dark:bg-[#0B0D14]/90 dark:shadow-2xl"
                style={{
                    top: typeof window !== 'undefined' && window.innerWidth >= 1024 ? 80 : 0,
                    ...(isRTL ? { right: shellOffsetPx, left: 0 } : { left: shellOffsetPx, right: 0 }),
                }}
            >
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex min-h-[4.5rem] flex-wrap items-center justify-between gap-3 py-3 sm:min-h-[5rem] sm:flex-nowrap sm:py-0">
                        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="group shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 transition-all duration-300 hover:border-indigo-500/30 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                            >
                                <ArrowLeft className={`h-5 w-5 text-gray-400 transition-colors group-hover:text-indigo-600 dark:text-gray-400 dark:group-hover:text-white ${language === 'ar' ? 'rotate-180 transform' : ''}`} />
                            </button>

                            <div className="hidden h-8 w-px shrink-0 bg-gray-200 dark:bg-white/10 sm:block" />

                            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                                <div className="relative shrink-0">
                                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-100 to-white shadow-lg ring-2 ring-white dark:from-[#1E2128] dark:to-[#0B0D14] dark:ring-[#1E2128]">
                                        <AvatarOrInitial
                                            name={`${provider.first_name || ''} ${provider.last_name || ''}`.trim() || provider.email}
                                            avatarUrl={provider.avatarUrl}
                                            className="text-sm font-black text-indigo-600 dark:text-indigo-400"
                                        />
                                    </div>

                                </div>

                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 sm:gap-3">
                                        <h1 className="truncate text-lg font-black leading-tight tracking-tight text-gray-900 dark:text-white sm:text-xl">
                                            {provider.first_name} {provider.last_name}
                                        </h1>
                                        {provider.provider?.isVerified && (
                                            <div className="hidden sm:flex items-center justify-center h-5 w-5 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" title={t('common.verified')}>
                                                <CheckCircle className="h-3.5 w-3.5" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:gap-3">
                            {status === 'submitted' && (
                                <button
                                    type="button"
                                    onClick={() => openConfirmModal('startReview')}
                                    className="flex items-center rounded-lg border border-transparent bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 dark:bg-dark-accent-purple dark:hover:bg-indigo-500 sm:px-4"
                                >
                                    <FileText className="me-2 h-4 w-4 shrink-0" /> {t('providerDetails.buttons.startReview')}
                                </button>
                            )}
                            {status === 'underReview' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={openRejectFlow}
                                        className="flex items-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-all hover:bg-red-50 dark:border-red-900/50 dark:bg-dark-bg-elevated dark:text-red-400 dark:hover:bg-red-900/20 sm:px-4"
                                    >
                                        <XCircle className="me-2 h-4 w-4 shrink-0" /> {t('providerDetails.buttons.reject')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openConfirmModal('approve')}
                                        className="flex items-center rounded-lg border border-transparent bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-green-700 dark:bg-dark-accent-green dark:hover:bg-green-500 sm:px-4"
                                    >
                                        <CheckCircle className="me-2 h-4 w-4 shrink-0" /> {t('providerDetails.buttons.approve')}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="h-[4.75rem] sm:h-[5.25rem] lg:h-[6rem]" />

            {/* Status Timeline */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-3">
                <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl p-8 shadow-sm dark:shadow-dark-md border border-gray-100 dark:border-dark-border relative overflow-hidden transition-all duration-300">
                    <div className="relative">
                        <div className="absolute top-1/2 start-6 end-6 -translate-y-1/2">
                            {/* Progress Bar Background */}
                            <div className="w-full h-1 bg-gray-100 dark:bg-dark-bg-tertiary rounded-full" />
                            {/* Active Progress Bar */}
                            <div
                                className="absolute top-0 start-0 h-1 bg-indigo-600 dark:bg-dark-accent-purple rounded-full transition-all duration-500 ease-in-out glow-purple"
                                style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                            />
                        </div>

                        <div className="relative flex justify-between">
                            {steps.map((step, index) => {
                                const isCompleted = index < currentStepIndex || (index === steps.length - 1 && (status === 'approved' || status === 'rejected'));
                                const isCurrent = index === currentStepIndex || (index === steps.length - 1 && (status === 'approved' || status === 'rejected'));
                                const isRejected = status === 'rejected' && index === steps.length - 1;
                                const isApprovedOutcome = status === 'approved' && index === steps.length - 1;

                                return (
                                    <div key={step.key} className="flex flex-col items-center relative z-10">
                                        <div className={clsx(
                                            "h-12 w-12 rounded-full flex items-center justify-center border-4 transition-all duration-300 bg-white dark:bg-dark-bg-secondary",
                                            isRejected ? "border-red-500 text-red-500 dark:text-red-400" :
                                                isApprovedOutcome ? "border-green-500 text-green-500 dark:text-green-400" :
                                                    isCompleted || isCurrent ? "border-indigo-600 dark:border-dark-accent-purple text-indigo-600 dark:text-dark-accent-purple" : "border-gray-200 dark:border-dark-border text-gray-300 dark:text-dark-text-muted"
                                        )}>
                                            <step.icon className="h-5 w-5" />
                                        </div>
                                        <div className={clsx(
                                            "mt-3 text-sm font-bold transition-colors duration-300",
                                            isRejected ? "text-red-600 dark:text-red-400" :
                                                isApprovedOutcome ? "text-green-600 dark:text-green-400" :
                                                    isCompleted || isCurrent ? "text-indigo-900 dark:text-dark-accent-purple" : "text-gray-400 dark:text-dark-text-muted"
                                        )}>
                                            {step.label}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* TABS NAVIGATION */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
                <div className="border-b border-gray-200 dark:border-dark-border flex items-center justify-between w-full">
                    {['overview', 'personal', 'locations', 'portfolio'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={clsx(
                                "flex-1 pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-all duration-300 whitespace-nowrap text-center",
                                activeTab === tab
                                    ? "border-indigo-600 dark:border-dark-accent-purple text-indigo-600 dark:text-dark-accent-purple"
                                    : "border-transparent text-gray-500 dark:text-dark-text-secondary hover:text-gray-700 dark:hover:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-white/5 rounded-t-lg"
                            )}
                        >
                            {tab === 'overview' ? t('providerDetails.tabs.overview') :
                                tab === 'personal' ? t('providerDetails.tabs.personal') :
                                    tab === 'locations' ? t('providerDetails.tabs.locations') : t('providerDetails.tabs.portfolio')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
                {/* TAB CONTENT: OVERVIEW */}
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Professional Dashboard - Integrated Card */}
                        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm dark:shadow-dark-md border border-gray-100 dark:border-dark-border overflow-hidden transition-all duration-300">
                            <div className="p-6 border-b border-gray-100 dark:border-dark-border bg-gray-50/50 dark:bg-dark-bg-tertiary flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-50 dark:bg-dark-bg-elevated rounded-lg text-indigo-600 dark:text-dark-accent-purple">
                                        <Briefcase className="h-5 w-5" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">{t('providerDetails.overview.title')}</h3>
                                </div>

                            </div>

                            <div className="p-6 space-y-8">
                                {/* Key Highlights Row */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl border border-gray-100 dark:border-dark-border bg-gradient-to-br from-purple-50/50 to-white dark:from-dark-bg-elevated dark:to-dark-bg-secondary flex items-center gap-4 transition-colors duration-300">
                                        <div className="h-12 w-12 rounded-xl bg-white dark:bg-dark-bg-tertiary shadow-sm border border-purple-100 dark:border-dark-border flex items-center justify-center text-purple-600 dark:text-dark-accent-purple">
                                            <Briefcase className="h-6 w-6 stroke-[2.5px]" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[10px] text-gray-400 dark:text-dark-text-muted uppercase font-black tracking-widest">{t('providerDetails.overview.specialization')}</div>
                                            <div className="text-base font-black text-gray-900 dark:text-dark-text-primary truncate" title={subcategoryName}>{subcategoryName || 'N/A'}</div>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl border border-gray-100 dark:border-dark-border bg-gradient-to-br from-indigo-50/50 to-white dark:from-dark-bg-elevated dark:to-dark-bg-secondary flex items-center gap-4 transition-colors duration-300">
                                        <div className="h-12 w-12 rounded-xl bg-white dark:bg-dark-bg-tertiary shadow-sm border border-indigo-100 dark:border-dark-border flex items-center justify-center text-indigo-600 dark:text-dark-accent-purple">
                                            <Star className="h-6 w-6 stroke-[2.5px]" />
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-gray-400 dark:text-dark-text-muted uppercase font-black tracking-widest">{t('providerDetails.overview.experience')}</div>
                                            <div className="text-xl font-black text-gray-900 dark:text-dark-text-primary">{provider.experienceYears || provider.provider?.experience_years || 0} <span className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">{t('providerDetails.overview.years')}</span></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Skills Section */}
                                <div>
                                    <h4 className="text-[10px] text-gray-400 dark:text-dark-text-muted uppercase font-black tracking-widest mb-4 flex items-center gap-2">
                                        <Zap className="h-4 w-4" /> {t('providerDetails.overview.services')}
                                    </h4>
                                    {provider.skills && provider.skills.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {provider.skills.map((skill, idx) => (
                                                <span key={idx} className="px-3 py-2 bg-white dark:bg-dark-bg-elevated text-gray-700 dark:text-dark-text-secondary rounded-xl text-xs font-bold border border-gray-100 dark:border-dark-border shadow-sm hover:border-indigo-200 dark:hover:border-dark-accent-purple/50 transition-all cursor-default flex items-center gap-2 group">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 dark:bg-dark-accent-purple group-hover:scale-125 transition-transform"></div>
                                                    {skill.name || skill}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl border border-dashed border-gray-200 dark:border-dark-border text-xs text-gray-400 dark:text-dark-text-muted">{t('providerDetails.overview.noServices')}</div>
                                    )}
                                </div>

                                {/* Detailed Bio */}
                                <div>
                                    <h4 className="text-[10px] text-gray-400 dark:text-dark-text-muted uppercase font-black tracking-widest mb-3 flex items-center gap-2">
                                        <FileText className="h-4 w-4" /> {t('providerDetails.overview.description')}
                                    </h4>
                                    <div className="text-gray-600 dark:text-dark-text-secondary leading-relaxed text-sm bg-gray-50/50 dark:bg-dark-bg-tertiary p-5 rounded-2xl border border-gray-100 dark:border-dark-border transition-colors duration-300">
                                        <p className="whitespace-pre-wrap">{provider.description || provider.provider?.description || provider.provider?.bio || t('providerDetails.overview.descriptionEmpty')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>


                    </div>
                )}


                {/* TAB CONTENT: PERSONAL */}
                {activeTab === 'personal' && (
                    <InfoCard icon={User} title={t('providerDetails.personal.title')} className="dark:bg-dark-bg-secondary dark:border-dark-border max-w-2xl mx-auto">
                        <div className="space-y-6">
                            <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl border border-gray-100 dark:border-dark-border flex items-center gap-4 transition-colors duration-300">
                                <div className="h-12 w-12 rounded-full bg-white dark:bg-dark-bg-elevated shadow-sm flex items-center justify-center text-indigo-500 dark:text-dark-accent-purple shrink-0">
                                    <Mail className="h-6 w-6" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs text-gray-400 dark:text-dark-text-muted uppercase font-black tracking-widest mb-1">{t('providerDetails.personal.email')}</div>
                                    <div className="text-lg font-bold text-gray-900 dark:text-dark-text-primary break-all" title={provider.email}>{provider.email}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl border border-gray-100 dark:border-dark-border transition-colors duration-300">
                                    <div className="text-xs text-gray-400 dark:text-dark-text-muted uppercase font-black tracking-widest mb-2">{t('providerDetails.personal.gender')}</div>
                                    <div className="text-lg font-bold text-gray-900 dark:text-dark-text-primary uppercase">
                                        {provider.gender ? t(`common.${provider.gender.toLowerCase()}`) : 'N/A'}
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl border border-gray-100 dark:border-dark-border transition-colors duration-300">
                                    <div className="text-xs text-gray-400 dark:text-dark-text-muted uppercase font-black tracking-widest mb-2">{t('providerDetails.personal.birthDate')}</div>
                                    <div className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">{provider.birthDate || 'N/A'}</div>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl border border-gray-100 dark:border-dark-border transition-colors duration-300">
                                    <div className="text-xs text-gray-400 dark:text-dark-text-muted uppercase font-black tracking-widest mb-2">
                                        {t('providerDetails.personal.phone')}
                                    </div>
                                    <div className="text-lg font-bold text-gray-900 dark:text-dark-text-primary" dir="ltr">
                                        {provider.phone || ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </InfoCard>
                )}


                {/* TAB CONTENT: LOCATIONS */}
                {activeTab === 'locations' && (
                    <InfoCard icon={MapPin} title={t('providerDetails.locations.title')} className="dark:bg-dark-bg-secondary dark:border-dark-border">
                        {provider.addresses && provider.addresses.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {provider.addresses.map((addr, idx) => (
                                    <div key={addr.id || idx} className="p-5 rounded-xl border border-gray-100 dark:border-dark-border hover:border-indigo-200 dark:hover:border-dark-accent-purple/50 hover:shadow-md dark:hover:shadow-dark-lg transition-all bg-white dark:bg-dark-bg-elevated relative overflow-hidden group">

                                        {/* Header with Label and Status */}
                                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-dark-border pb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2.5 py-1 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg text-xs font-bold uppercase text-gray-600 dark:text-dark-text-secondary tracking-wider flex items-center">
                                                    {addr.label || t('providerDetails.locations.location')}
                                                </span>
                                                {addr.isPreferred && (
                                                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-yellow-50 px-3 py-1 text-[10px] font-bold text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400">
                                                        <Star className="h-3 w-3 me-1 fill-yellow-600 dark:fill-yellow-400" /> {t('providerDetails.locations.preferred')}
                                                    </span>
                                                )}
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
                                            {addr.isServiceLocation && (
                                                <div className="flex items-center text-xs font-semibold text-indigo-600 dark:text-dark-accent-purple bg-indigo-50 dark:bg-dark-accent-purple/10 px-2 py-1 rounded-full">
                                                    <MapPin className="h-3 w-3 me-1" /> {t('providerDetails.locations.serviceArea')}
                                                </div>
                                            )}
                                        </div>

                                        {/* Details Grid */}
                                        <div className="space-y-3 text-sm">
                                            <div>
                                                <div className="text-xs text-gray-400 dark:text-dark-text-muted uppercase font-semibold mb-0.5">{t('providerDetails.locations.fullAddress')}</div>
                                                <div className="font-medium text-gray-900 dark:text-dark-text-primary leading-snug">
                                                    {[addr.street, addr.district, addr.city, addr.country].filter(Boolean).join(', ')}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                {addr.postalCode && (
                                                    <div>
                                                        <div className="text-xs text-gray-400 dark:text-dark-text-muted uppercase font-semibold mb-0.5">{t('providerDetails.locations.postalCode')}</div>
                                                        <div className="font-medium text-gray-700 dark:text-dark-text-secondary font-mono">{addr.postalCode}</div>
                                                    </div>
                                                )}
                                                {addr.phone && (
                                                    <div>
                                                        <div className="text-xs text-gray-400 dark:text-dark-text-muted uppercase font-semibold mb-0.5">{t('providerDetails.locations.phone')}</div>
                                                        <div className="font-medium text-gray-700 dark:text-dark-text-secondary">{addr.phone}</div>
                                                    </div>
                                                )}
                                            </div>


                                            {(addr.lat && addr.lng) && (
                                                <div className="pt-2 mt-1 border-t border-gray-50 dark:border-dark-border flex items-center">
                                                    <a
                                                        href={`https://www.google.com/maps?q=${addr.lat},${addr.lng}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-indigo-600 dark:text-dark-accent-purple hover:text-indigo-700 dark:hover:text-indigo-400 text-xs font-bold flex items-center transition-colors"
                                                    >
                                                        <MapPin className="h-3 w-3 me-1" /> {t('providerDetails.locations.viewOnMap')}
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-400 dark:text-dark-text-muted text-center py-4">{t('providerDetails.locations.noAddresses')}</div>
                        )}
                    </InfoCard>
                )}


                {/* TAB CONTENT: PORTFOLIO */}
                {activeTab === 'portfolio' && (
                    <InfoCard icon={ImageIcon} title={t('providerDetails.portfolio.title')} className="dark:bg-dark-bg-secondary dark:border-dark-border">
                        {provider.media && provider.media.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                {provider.media.map((item, idx) => (
                                    <div key={idx} className="group relative aspect-[3/4] bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border hover:shadow-md dark:hover:shadow-dark-lg transition-all">
                                        {/* Preview Logic */}
                                        {item.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                            <img src={formatImageUrl(item.url)} alt={t('common.portfolio')} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        ) : item.url?.match(/\.pdf$/i) ? (
                                            <div className="h-full w-full relative bg-white dark:bg-dark-bg-elevated">
                                                <iframe
                                                    src={`${item.url}#toolbar=0&navpanes=0&scrollbar=0`}
                                                    className="h-full w-full border-none pointer-events-none opacity-80"
                                                    title={t('common.preview')}
                                                />
                                                {/* Overlay to prevent interaction with iframe */}
                                                <div className="absolute inset-0 bg-transparent" />

                                                {/* PDF Badge */}
                                                <div className="absolute bottom-3 start-3 bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-lg z-10 flex items-center gap-1.5 ring-2 ring-white/20">
                                                    <FileText className="h-3.5 w-3.5" />
                                                    PDF
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-full w-full flex flex-col items-center justify-center text-gray-400 dark:text-dark-text-muted p-4 bg-gray-50 dark:bg-dark-bg-tertiary">
                                                <div className="h-12 w-12 rounded-full bg-white dark:bg-dark-bg-elevated border border-gray-200 dark:border-dark-border flex items-center justify-center mb-3 shadow-sm">
                                                    <FileText className="h-6 w-6 text-gray-300 dark:text-dark-text-muted" />
                                                </div>
                                                <span className="text-xs text-center font-medium text-gray-500 dark:text-dark-text-secondary line-clamp-2 w-full px-2">{item.name || t('common.file')}</span>
                                            </div>
                                        )}

                                        {/* Hover Overlay */}
                                        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
                                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white dark:bg-dark-bg-elevated rounded-full text-indigo-600 dark:text-dark-accent-purple hover:bg-indigo-50 dark:hover:bg-dark-bg-tertiary shadow-sm" title={t('common.view')}>
                                                <ImageIcon className="h-4 w-4" />
                                            </a>
                                            <a href={item.url} download className="p-2 bg-white dark:bg-dark-bg-elevated rounded-full text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary shadow-sm" title={t('common.download')}>
                                                <Download className="h-4 w-4" />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 border-2 border-dashed border-gray-100 dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-bg-tertiary/20">
                                <ImageIcon className="h-12 w-12 text-gray-300 dark:text-dark-text-muted mx-auto mb-3" />
                                <p className="text-sm text-gray-400 dark:text-dark-text-muted">{t('providerDetails.portfolio.noMedia')}</p>
                            </div>
                        )}
                    </InfoCard>
                )}
            </div>
        </div>
    );
};

export default ProviderDetails;
