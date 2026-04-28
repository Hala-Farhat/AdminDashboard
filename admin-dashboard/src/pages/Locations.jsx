/**
 * مناطق التغطية: الطلبات تمر فقط عبر dashboardApi إلى
 * GET|POST|PATCH|DELETE /manage/dashboard/coverage-zones — لا مسارات أخرى.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    fetchDashboardCoverageZones,
    parseCoverageZonesListResponse,
    createDashboardCoverageZone,
    patchDashboardCoverageZone,
    deleteDashboardCoverageZone,
} from '../api/dashboardApi';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
    Loader2,
    Plus,
    Pencil,
    Trash2,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    MoreHorizontal,
    MapPin,
    UserRound,
    Users,
    Briefcase
} from 'lucide-react';
import clsx from 'clsx';
import CoverageZoneModal from '../components/CoverageZoneModal';
import { normalizeBoundaryForApi, wktPolygonInnerRingToLatLngPairString } from '../utils/coverageZoneBoundary';

const Locations = () => {
    const [zones, setZones] = useState([]);
    const [minExpertsForSufficientCoverage, setMinExpertsForSufficientCoverage] = useState(3);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingZone, setEditingZone] = useState(null);
    const [formData, setFormData] = useState({
        nameEn: '',
        nameAr: '',
        boundary: '',
        isActive: true
    });
    const [actionLoading, setActionLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [menuZoneId, setMenuZoneId] = useState(null);
    const menuRef = useRef(null);

    const { token } = useAuth();
    const { t, language } = useLanguage();
    const toast = useToast();
    const isRTL = language === 'ar';

    const fetchZones = useCallback(async () => {
        if (!token) {
            setZones([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const response = await fetchDashboardCoverageZones(token, { lang: language });
            const { items, minExpertsForSufficientCoverage: minExperts } = parseCoverageZonesListResponse(response);
            setZones(items);
            setMinExpertsForSufficientCoverage(minExperts);
            setError(null);
        } catch (err) {
            console.error('Error fetching zones:', err);
            setError(`${t('common.error')}: ${err.message}`);
            setZones([]);
        } finally {
            setLoading(false);
        }
    }, [token, t, language]);

    useEffect(() => {
        fetchZones();
    }, [fetchZones]);

    useEffect(() => {
        const close = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuZoneId(null);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const handleCreateZone = async () => {
        setActionLoading(true);

        const payload = {
            nameEn: formData.nameEn,
            nameAr: formData.nameAr,
            boundary: normalizeBoundaryForApi(formData.boundary),
            isActive: formData.isActive
        };

        try {
            await createDashboardCoverageZone(token, payload, { lang: language });
            await fetchZones();
            setShowCreateModal(false);
            setFormData({ nameEn: '', nameAr: '', boundary: '', isActive: true });
            toast.success(t('locations.messages.createSuccess'));
        } catch (err) {
            console.error('Create Zone Error:', err);
            const errorMessage = err.response?.data?.message || err.message || t('common.error');
            toast.error(errorMessage);
        } finally {
            setActionLoading(false);
        }
    };

    const handleEditZone = async () => {
        if (!editingZone?.id) return;
        setActionLoading(true);

        const payload = {
            nameEn: formData.nameEn,
            nameAr: formData.nameAr,
            boundary: normalizeBoundaryForApi(formData.boundary),
            isActive: formData.isActive
        };

        try {
            await patchDashboardCoverageZone(token, editingZone.id, payload, { lang: language });
            await fetchZones();
            setShowEditModal(false);
            setEditingZone(null);
            setFormData({ nameEn: '', nameAr: '', boundary: '', isActive: true });
            toast.success(t('locations.messages.updateSuccess'));
        } catch (err) {
            console.error('Update Zone Error:', err);
            const errorMessage = err.response?.data?.message || err.message || t('common.error');
            toast.error(errorMessage);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteZone = async (id) => {
        try {
            await deleteDashboardCoverageZone(token, id, { lang: language });
            await fetchZones();
            setMenuZoneId(null);
            toast.success(t('locations.messages.deleteSuccess'));
        } catch (err) {
            console.error(err);
            toast.error(t('common.error'));
        }
    };

    const openEditModal = (zone) => {
        setEditingZone(zone);

        const raw = String(zone.boundary || '').trim();
        const boundaryForForm = /^POLYGON/i.test(raw)
            ? wktPolygonInnerRingToLatLngPairString(raw)
            : raw;

        setFormData({
            nameEn: zone.nameEn || '',
            nameAr: zone.nameAr || '',
            boundary: boundaryForForm,
            isActive: zone.isActive !== false && zone.isActive !== 'false'
        });
        setShowEditModal(true);
        setMenuZoneId(null);
    };

    const openCreateModal = () => {
        setFormData({ nameEn: '', nameAr: '', boundary: '', isActive: true });
        setShowCreateModal(true);
    };

    const coverageLow = (zone) => {
        if (zone.coverageStatus === 'shortage') return true;
        if (zone.coverageStatus === 'sufficient') return false;
        if (zone.expertShortage != null) return Boolean(zone.expertShortage);
        const experts = zone.stats?.expertsCount ?? zone.expertsCount;
        if (experts != null) return experts < minExpertsForSufficientCoverage;
        return !zone.isActive;
    };

    const stat = (zone, key, fallback) => {
        const stats = zone.stats && typeof zone.stats === 'object' ? zone.stats : null;
        let v;
        if (stats) {
            if (key === 'servicesCount') v = stats.completedServicesCount;
            else if (key === 'expertsCount') v = stats.expertsCount;
            else if (key === 'clientsCount') v = stats.clientsCount;
        }
        if (v == null) v = zone[key];
        if (v != null && v !== '') return Number(v);
        return fallback;
    };

    return (
        <div className="flex w-full max-w-[1260px] flex-col gap-10">
            {/* صف العنوان: نص أولاً ثم الزر — LTR يسار/يمين، RTL يعكس مع dir */}
            <div
                dir={isRTL ? 'rtl' : 'ltr'}
                className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"
            >
                <div
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className="flex min-w-0 flex-1 flex-col gap-2 text-start"
                >
                    <h1 className="text-[32px] font-bold leading-tight text-[#333] dark:text-dark-text-primary">
                        {t('locations.headingTitle')}
                    </h1>
                    <p className="text-lg font-medium text-[#666] dark:text-dark-text-secondary">
                        {t('locations.headingSubtitle')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-khabeer-brand px-4 text-base font-medium text-white transition-colors hover:opacity-95"
                >
                    <span dir={isRTL ? 'rtl' : 'ltr'}>{t('locations.addCity')}</span>
                    <Plus className="h-6 w-6" strokeWidth={2} aria-hidden />
                </button>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-khabeer-brand" />
                </div>
            ) : error ? (
                <div className="flex items-center rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
                    <AlertTriangle className="me-2 h-5 w-5 shrink-0" />
                    {error}
                </div>
            ) : !Array.isArray(zones) || zones.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-khabeer-stroke bg-white p-12 text-center text-[#666] dark:border-dark-border dark:bg-dark-bg-secondary dark:text-dark-text-muted">
                    <MapPin className="mb-4 h-12 w-12 text-gray-300 dark:text-dark-text-muted" />
                    {t('locations.noZones')}
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {zones.map((zone) => {
                        const id = zone?.id;
                        const expanded = expandedId === id;
                        const active = zone.isActive !== false && zone.isActive !== 'false';
                        const low = coverageLow(zone);
                        const name =
                            language === 'ar'
                                ? zone?.nameAr || zone?.nameEn
                                : zone?.nameEn || zone?.nameAr || t('categories.untitled');

                        return (
                            <div key={id ?? name} className="flex flex-col">
                                {/*
                                  صف المنطقة: بداية السطر = المدينة والشارات، نهاية السطر = توسيع + قائمة.
                                  dir يتبع لغة الواجهة (LTR/RTL) — بدون overflow-hidden على الغلاف حتى لا تُقص القائمة.
                                */}
                                <div
                                    dir={isRTL ? 'rtl' : 'ltr'}
                                    className={clsx(
                                        'flex w-full min-w-0 flex-nowrap items-center justify-between gap-3 px-6 py-3',
                                        'bg-[rgba(107,114,128,0.08)] dark:bg-white/5',
                                        expanded
                                            ? 'rounded-t-2xl border-b border-[#ece4eb] dark:border-dark-border'
                                            : 'rounded-2xl'
                                    )}
                                >
                                    <div
                                        className="flex min-h-0 min-w-0 flex-1 items-center gap-2"
                                        dir={isRTL ? 'rtl' : 'ltr'}
                                    >
                                        <p className="min-w-0 flex-1 truncate text-start text-lg font-bold leading-normal text-[#333] dark:text-dark-text-primary">
                                            {name}
                                        </p>
                                        {active ? (
                                            <span className="shrink-0 rounded-[46px] bg-emerald-600 px-2 py-1 text-sm font-medium leading-normal text-white dark:bg-emerald-500">
                                                {t('locations.badgeActive')}
                                            </span>
                                        ) : (
                                            <span className="shrink-0 rounded-[46px] bg-slate-500 px-2 py-1 text-sm font-medium leading-normal text-white dark:bg-slate-600">
                                                {t('locations.badgeInactive')}
                                            </span>
                                        )}
                                        {low ? (
                                            <span className="shrink-0 rounded-[46px] bg-rose-600 px-2 py-1 text-sm font-medium leading-normal text-white dark:bg-rose-500">
                                                {t('locations.badgeCoverageLow')}
                                            </span>
                                        ) : (
                                            <span className="shrink-0 rounded-[46px] bg-emerald-600 px-2 py-1 text-sm font-medium leading-normal text-white dark:bg-emerald-500">
                                                {t('locations.badgeCoverageOk')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex shrink-0 items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(expanded ? null : id)}
                                            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg p-2.5 text-[#333] transition-colors hover:bg-black/5 dark:text-dark-text-primary dark:hover:bg-white/10"
                                            aria-expanded={expanded}
                                        >
                                            {expanded ? (
                                                <ChevronUp className="size-5" strokeWidth={2} />
                                            ) : (
                                                <ChevronDown className="size-5" strokeWidth={2} />
                                            )}
                                        </button>

                                        <div className="relative shrink-0" ref={menuZoneId === id ? menuRef : null}>
                                            <button
                                                type="button"
                                                onClick={() => setMenuZoneId(menuZoneId === id ? null : id)}
                                                className="flex size-10 items-center justify-center overflow-hidden rounded-lg p-2.5 text-[#333] transition-colors hover:bg-black/5 dark:text-dark-text-primary dark:hover:bg-white/10"
                                                aria-haspopup="true"
                                                aria-expanded={menuZoneId === id}
                                            >
                                                <MoreHorizontal className="size-6" strokeWidth={2} />
                                            </button>
                                            {menuZoneId === id && (
                                                <div
                                                    dir={isRTL ? 'rtl' : 'ltr'}
                                                    className="absolute end-0 top-full z-50 mt-1 min-w-[179px] overflow-hidden rounded-lg border border-khabeer-stroke bg-white py-2 shadow-[0px_0px_35px_0px_rgba(0,0,0,0.04)] dark:border-dark-border dark:bg-dark-bg-elevated"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditModal(zone)}
                                                        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-[#333] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                                                    >
                                                        <span className="min-w-0 flex-1 text-start">{t('locations.menuEdit')}</span>
                                                        <Pencil className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                                                    </button>
                                                    <div className="mx-2 h-px bg-khabeer-stroke dark:bg-dark-border" />
                                                    <button
                                                        type="button"
                                                        onClick={() => id != null && handleDeleteZone(id)}
                                                        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                    >
                                                        <span className="min-w-0 flex-1 text-start">{t('locations.menuDelete')}</span>
                                                        <Trash2 className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {expanded && (
                                    <div
                                        dir={isRTL ? 'rtl' : 'ltr'}
                                        className="flex flex-col gap-6 rounded-b-2xl bg-white p-6 dark:bg-dark-bg-secondary"
                                    >
                                        <div className="flex flex-wrap items-center justify-start gap-10">
                                            <div className="flex items-center gap-1.5" dir={isRTL ? 'rtl' : 'ltr'}>
                                                <UserRound className="h-4 w-4 shrink-0 text-[#333] dark:text-dark-text-primary" />
                                                <span className="text-sm text-[#333] dark:text-dark-text-primary" dir={isRTL ? 'rtl' : 'ltr'}>
                                                    {t('locations.statsExperts', { n: stat(zone, 'expertsCount', 0) })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5" dir={isRTL ? 'rtl' : 'ltr'}>
                                                <Users className="h-4 w-4 shrink-0 text-[#333] dark:text-dark-text-primary" />
                                                <span className="text-sm text-[#333] dark:text-dark-text-primary" dir={isRTL ? 'rtl' : 'ltr'}>
                                                    {t('locations.statsClients', { n: stat(zone, 'clientsCount', 0) })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5" dir={isRTL ? 'rtl' : 'ltr'}>
                                                <Briefcase className="h-4 w-4 shrink-0 text-[#333] dark:text-dark-text-primary" />
                                                <span className="text-sm text-[#333] dark:text-dark-text-primary" dir={isRTL ? 'rtl' : 'ltr'}>
                                                    {t('locations.statsServices', {
                                                        n: stat(zone, 'servicesCount', 0)
                                                    })}
                                                </span>
                                            </div>
                                        </div>

                                        <p
                                            className="w-full text-start text-xs leading-normal text-[#999] dark:text-dark-text-muted"
                                            dir={isRTL ? 'rtl' : 'ltr'}
                                        >
                                            {t('locations.coverageThresholdNote', {
                                                n: minExpertsForSufficientCoverage,
                                            })}
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <CoverageZoneModal
                open={showCreateModal}
                title={t('locations.modalTitle')}
                formData={formData}
                onChange={setFormData}
                onSubmit={handleCreateZone}
                onClose={() => setShowCreateModal(false)}
                actionLoading={actionLoading}
                language={language}
                t={t}
                submitLabel={t('locations.confirmSave')}
            />

            <CoverageZoneModal
                open={showEditModal}
                title={t('locations.modalTitle')}
                formData={formData}
                onChange={setFormData}
                onSubmit={handleEditZone}
                onClose={() => {
                    setShowEditModal(false);
                    setEditingZone(null);
                }}
                actionLoading={actionLoading}
                language={language}
                t={t}
                submitLabel={t('locations.confirmSave')}
            />
        </div>
    );
};

export default Locations;
