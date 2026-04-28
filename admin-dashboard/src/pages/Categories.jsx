import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useCache } from '../context/CacheContext';
import { catalogApi } from '../api/catalogApi';
import { fetchDashboardCatalog, parseDashboardCatalogResponse } from '../api/dashboardApi';
import {
    Loader2,
    Plus,
    Trash2,
    Pencil,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    GripVertical,
    MoreHorizontal,
    SearchX,
    Users
} from 'lucide-react';
import clsx from 'clsx';

/** Figma brand primary */
const BRAND = '#0077b6';

/** Figma 124:13371 empty-state illustration (layered) */
const FIGMA_EMPTY = {
    background: 'https://www.figma.com/api/mcp/asset/4578281c-e05c-4975-abb6-1b13f582926c',
    lens: 'https://www.figma.com/api/mcp/asset/e2d98ad5-555f-424a-8adf-eb2ce386587d',
    doodles: 'https://www.figma.com/api/mcp/asset/125dc448-1123-4959-92aa-6f3165ebd16a'
};

function tpl(str, vars) {
    if (!str) return '';
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

function mapDashboardService(svc) {
    if (!svc || typeof svc !== 'object') return null;
    return {
        ...svc,
        id: svc.serviceId ?? svc.id,
        name: svc.name || '',
        nameEn: svc.nameEn || '',
        nameAr: svc.nameAr || '',
        experts: svc.experts || svc.providers || [],
        expertCount: svc.expertCount ?? svc.expertsCount
    };
}

/** يفك عناصر GET /manage/dashboard/catalog ويملأ خرائط الخدمات للواجهة. */
function buildCategoriesFromDashboardItems(items) {
    const categoriesList = [];
    const servicesMap = {};
    const countsMap = {};
    for (const raw of Array.isArray(items) ? items : []) {
        const id = raw.categoryId ?? raw.id;
        const subsRaw = raw.subCategories ?? raw.sub_categories ?? [];
        const subCategories = [];
        for (const s of subsRaw) {
            const sid = s.subCategoryId ?? s.id;
            const servicesRaw = s.services ?? [];
            const list = Array.isArray(servicesRaw) ? servicesRaw.map(mapDashboardService).filter(Boolean) : [];
            if (sid != null) {
                servicesMap[sid] = list;
                countsMap[sid] = list.length;
            }
            subCategories.push({
                ...s,
                id: sid,
                subCategoryId: sid,
                name: s.name || '',
                nameEn: s.nameEn || '',
                nameAr: s.nameAr || ''
            });
        }
        categoriesList.push({
            ...raw,
            id,
            categoryId: id,
            name: raw.name || '',
            nameEn: raw.nameEn || '',
            nameAr: raw.nameAr || '',
            subCategories
        });
    }
    return { categoriesList, servicesMap, countsMap };
}

function serviceExpertsList(service) {
    if (Array.isArray(service?.experts)) return service.experts;
    if (Array.isArray(service?.providers)) return service.providers;
    return [];
}

function serviceExpertCount(service) {
    const list = serviceExpertsList(service);
    const n = service?.expertCount ?? service?.expertsCount;
    if (typeof n === 'number') return n;
    return list.length;
}

/** expertsCount من الـ API على المجال أو التخصص الفرعي */
function getExpertsCount(entity) {
    if (!entity || typeof entity !== 'object') return null;
    const n = entity.expertsCount ?? entity.registeredExpertsCount ?? entity.expertCount;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    if (n != null && n !== '') {
        const num = Number(n);
        if (Number.isFinite(num)) return num;
    }
    return null;
}

function ShellModal({ isOpen, onClose, title, headerIcon: HeaderIcon, children, wide, dir }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                className={clsx(
                    'bg-white dark:bg-dark-bg-elevated rounded-[20px] shadow-xl border border-[#E1DCEB] dark:border-dark-border w-full animate-fade-in transition-all',
                    wide ? 'max-w-lg' : 'max-w-md'
                )}
                onClick={(e) => e.stopPropagation()}
                dir={dir ?? 'rtl'}
            >
                <div className="px-8 pt-8 pb-6 text-center border-b border-gray-100 dark:border-dark-border">
                    {HeaderIcon && (
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F0F4F8] dark:bg-dark-bg-tertiary">
                            <HeaderIcon className="h-6 w-6 text-[#151B30] dark:text-dark-text-primary" />
                        </div>
                    )}
                    <h3 className="text-lg font-bold text-[#151B30] dark:text-dark-text-primary leading-tight">
                        {title}
                    </h3>
                </div>
                <div className="px-8 py-6">{children}</div>
            </div>
        </div>
    );
}

const Categories = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedCategories, setExpandedCategories] = useState({});
    const [expandedSubCategories, setExpandedSubCategories] = useState({});
    const [services, setServices] = useState({});
    const [loadingServices, setLoadingServices] = useState({});
    const [servicesCount, setServicesCount] = useState({});

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showEditSubModal, setShowEditSubModal] = useState(false);
    const [showSubModal, setShowSubModal] = useState(false);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [showEditServiceModal, setShowEditServiceModal] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    const [selectedSubCategoryId, setSelectedSubCategoryId] = useState(null);
    const [editingCategory, setEditingCategory] = useState(null);
    const [editingSubCategory, setEditingSubCategory] = useState(null);
    const [editingService, setEditingService] = useState(null);

    const [formData, setFormData] = useState({ titleEn: '', titleAr: '' });
    const [serviceFormData, setServiceFormData] = useState({ nameEn: '', nameAr: '' });
    const [actionLoading, setActionLoading] = useState(false);
    const [openMenu, setOpenMenu] = useState(null);
    const menuRef = useRef(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const { token } = useAuth();
    const { t, language } = useLanguage();
    const toast = useToast();
    const { getData, setData, invalidate } = useCache();
    const navigate = useNavigate();

    const isRTL = language === 'ar';
    const textDir = isRTL ? 'rtl' : 'ltr';
    const cacheKey = `categories_${language}`;

    const menuKey = (prefix, id) => `${prefix}-${id}`;

    const fetchServicesCount = useCallback(async (subCategoryId) => {
        if (servicesCount[subCategoryId] !== undefined) return;

        try {
            const response = await catalogApi.getSubCategory(token, subCategoryId);

            if (response.data && response.data.success) {
                const subCatData = response.data.data;
                const servicesList = subCatData.services || [];

                setServicesCount((prev) => ({ ...prev, [subCategoryId]: servicesList.length }));
            } else {
                setServicesCount((prev) => ({ ...prev, [subCategoryId]: 0 }));
            }
        } catch (err) {
            console.error('Error fetching services count:', err);
            setServicesCount((prev) => ({ ...prev, [subCategoryId]: 0 }));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- count guard uses current servicesCount snapshot
    }, [token]);

    const fetchSubCategories = useCallback(
        async (categoryId) => {
            try {
                const response = await catalogApi.getCategory(token, categoryId);
                if (response.data && response.data.success) {
                    const categoryData = response.data.data;
                    const subCats = (categoryData.subCategories || []).map((sub) => ({
                        ...sub,
                        id: sub.subCategoryId ?? sub.id,
                        subCategoryId: sub.subCategoryId ?? sub.id,
                        name: sub.name || '',
                        nameEn: sub.nameEn || '',
                        nameAr: sub.nameAr || ''
                    }));

                    setCategories((prev) =>
                        prev.map((cat) => (cat.id === categoryId ? { ...cat, subCategories: subCats } : cat))
                    );

                    subCats.forEach((sub) => fetchServicesCount(sub.id));
                }
            } catch (err) {
                console.error('Error fetching subcategories:', err);
                toast.error(t('common.error'));
            }
        },
        [token, toast, t, fetchServicesCount]
    );

    const fetchCategories = useCallback(
        async (force = false) => {
            const cachedEntry = getData(cacheKey);
            const cachedPayload = cachedEntry?.data;
            if (!force && cachedPayload?.categories) {
                setCategories(cachedPayload.categories);
                if (cachedPayload.servicesMap) {
                    setServices((prev) => ({ ...prev, ...cachedPayload.servicesMap }));
                }
                if (cachedPayload.countsMap) {
                    setServicesCount((prev) => ({ ...prev, ...cachedPayload.countsMap }));
                }
                setLoading(false);
                cachedPayload.categories.forEach((cat) => {
                    if (cat.subCategories == null) {
                        fetchSubCategories(cat.id);
                    } else {
                        cat.subCategories.forEach((sub) => fetchServicesCount(sub.id));
                    }
                });
                return;
            }

            setLoading(true);
            try {
                const response = await fetchDashboardCatalog(token, { lang: language });
                const { items } = parseDashboardCatalogResponse(response);
                const { categoriesList, servicesMap, countsMap } = buildCategoriesFromDashboardItems(items);

                setCategories(categoriesList);
                setData(cacheKey, {
                    categories: categoriesList,
                    servicesMap,
                    countsMap
                });
                setServices((prev) => ({ ...prev, ...servicesMap }));
                setServicesCount((prev) => ({ ...prev, ...countsMap }));

                categoriesList.forEach((cat) => {
                    if (cat.subCategories == null) {
                        fetchSubCategories(cat.id);
                    } else {
                        cat.subCategories.forEach((sub) => fetchServicesCount(sub.id));
                    }
                });
                setError(null);
            } catch (err) {
                console.error('Error fetching categories:', err);
                setError(`${t('common.error')}: ${err.message}`);
            } finally {
                setLoading(false);
            }
        },
        [token, language, t, getData, setData, cacheKey, fetchSubCategories, fetchServicesCount]
    );

    useEffect(() => {
        fetchCategories();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, language, cacheKey]);

    useEffect(() => {
        if (!openMenu) return;
        const onDoc = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [openMenu]);

    const toggleCategory = async (id) => {
        const category = categories.find((cat) => cat.id === id);
        const isExpanding = !expandedCategories[id];

        setExpandedCategories((prev) => ({
            ...prev,
            [id]: !prev[id]
        }));

        if (isExpanding && (!category.subCategories || category.subCategories.length === 0)) {
            await fetchSubCategories(id);
        } else if (isExpanding && category.subCategories) {
            category.subCategories.forEach((sub) => fetchServicesCount(sub.id));
        }
    };

    const toggleSubCategory = async (subCategoryId) => {
        const isExpanded = expandedSubCategories[subCategoryId];
        setExpandedSubCategories((prev) => ({
            ...prev,
            [subCategoryId]: !prev[subCategoryId]
        }));

        if (!isExpanded && !services[subCategoryId]) {
            await fetchServices(subCategoryId);
        }
    };

    const fetchServices = async (subCategoryId) => {
        if (loadingServices[subCategoryId]) return;

        setLoadingServices((prev) => ({ ...prev, [subCategoryId]: true }));
        try {
            const response = await catalogApi.getSubCategory(token, subCategoryId);

            if (response.data && response.data.success) {
                const subCatData = response.data.data;
                const servicesList = (subCatData.services || []).map((svc) => ({
                    ...svc,
                    id: svc.serviceId,
                    name: svc.name || '',
                    nameEn: svc.nameEn || '',
                    nameAr: svc.nameAr || '',
                    experts: svc.experts || svc.providers || [],
                    expertCount: svc.expertCount ?? svc.expertsCount
                }));

                setServices((prev) => ({ ...prev, [subCategoryId]: servicesList }));
                setServicesCount((prev) => ({ ...prev, [subCategoryId]: servicesList.length }));
            } else {
                setServices((prev) => ({ ...prev, [subCategoryId]: [] }));
                setServicesCount((prev) => ({ ...prev, [subCategoryId]: 0 }));
            }
        } catch (err) {
            console.error('Error fetching services:', err);
            setServices((prev) => ({ ...prev, [subCategoryId]: [] }));
            setServicesCount((prev) => ({ ...prev, [subCategoryId]: 0 }));
        } finally {
            setLoadingServices((prev) => ({ ...prev, [subCategoryId]: false }));
        }
    };

    const handleCreateService = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            await catalogApi.createService(
                token,
                selectedSubCategoryId,
                {
                    nameEn: serviceFormData.nameEn,
                    nameAr: serviceFormData.nameAr
                },
                { lang: language }
            );
            await fetchServices(selectedSubCategoryId);
            setShowServiceModal(false);
            setServiceFormData({ nameEn: '', nameAr: '' });
            setSelectedSubCategoryId(null);
            toast.success(t('categories.messages.createServiceSuccess'));
            const currentCount = servicesCount[selectedSubCategoryId] || 0;
            setServicesCount((prev) => ({ ...prev, [selectedSubCategoryId]: currentCount + 1 }));
        } catch (err) {
            console.error(err);
            toast.error(t('common.error'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleEditService = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            await catalogApi.updateService(
                token,
                editingService.id,
                {
                    nameEn: serviceFormData.nameEn,
                    nameAr: serviceFormData.nameAr
                },
                { lang: language }
            );
            const subCatId = selectedSubCategoryId || editingService.subCategoryId;
            await fetchServices(subCatId);
            setShowEditServiceModal(false);
            setEditingService(null);
            setServiceFormData({ nameEn: '', nameAr: '' });
            setSelectedSubCategoryId(null);
            toast.success(t('categories.messages.updateServiceSuccess'));
        } catch (err) {
            console.error(err);
            toast.error(t('common.error'));
        } finally {
            setActionLoading(false);
        }
    };

    const openServiceModal = (subCategoryId) => {
        setSelectedSubCategoryId(subCategoryId);
        setServiceFormData({ nameEn: '', nameAr: '' });
        setShowServiceModal(true);
    };

    const openEditServiceModal = (service, subCategoryId) => {
        setEditingService(service);
        setSelectedSubCategoryId(subCategoryId);
        setServiceFormData({ nameEn: service.nameEn || '', nameAr: service.nameAr || '' });
        setShowEditServiceModal(true);
    };

    const handleCreateCategory = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const payload = {
                nameEn: formData.titleEn,
                nameAr: formData.titleAr
            };
            await catalogApi.createCategory(token, payload, { lang: language });

            invalidate('categories');
            await fetchCategories(true);

            setShowCreateModal(false);
            setFormData({ titleEn: '', titleAr: '' });
            toast.success(t('categories.messages.createSuccess'));
        } catch (err) {
            console.error('Create category error:', err);
            toast.error(t('common.error'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleEditCategory = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const payload = {
                nameEn: formData.titleEn,
                nameAr: formData.titleAr
            };
            await catalogApi.updateCategory(token, editingCategory.id, payload, { lang: language });
            invalidate('categories');
            await fetchCategories(true);
            setShowEditModal(false);
            setEditingCategory(null);
            setFormData({ titleEn: '', titleAr: '' });
            toast.success(t('categories.messages.updateCategorySuccess'));
        } catch (err) {
            console.error(err);
            toast.error(t('common.error'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleEditSubCategory = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const payload = {
                nameEn: formData.titleEn,
                nameAr: formData.titleAr
            };
            await catalogApi.updateSubCategory(token, editingSubCategory.id, payload, { lang: language });
            invalidate('categories');
            await fetchCategories(true);
            setShowEditSubModal(false);
            setEditingSubCategory(null);
            setFormData({ titleEn: '', titleAr: '' });
            toast.success(t('categories.messages.updateSubCategorySuccess'));
        } catch (err) {
            console.error(err);
            toast.error(t('common.error'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreateSubCategory = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const payload = {
                nameEn: formData.titleEn,
                nameAr: formData.titleAr
            };
            await catalogApi.createSubCategory(token, selectedCategoryId, payload, { lang: language });
            invalidate('categories');
            await fetchCategories(true);
            setShowSubModal(false);
            setFormData({ titleEn: '', titleAr: '' });
            setExpandedCategories((prev) => ({ ...prev, [selectedCategoryId]: true }));
            toast.success(t('categories.messages.createSubSuccess'));
        } catch (err) {
            console.error(err);
            toast.error(t('common.error'));
        } finally {
            setActionLoading(false);
        }
    };

    const requestDeleteCategory = (category) => {
        if (!category?.id) return;
        setOpenMenu(null);
        const display = language === 'ar' ? category.nameAr || category.name : category.nameEn || category.name;
        setDeleteTarget({
            type: 'category',
            id: category.id,
            name: display || t('categories.untitled'),
            expertCount: category.registeredExpertsCount ?? category.expertCount ?? null
        });
    };

    const requestDeleteSubCategory = (sub) => {
        if (!sub?.id) return;
        setOpenMenu(null);
        const display = language === 'ar' ? sub.nameAr || sub.name : sub.nameEn || sub.name;
        setDeleteTarget({
            type: 'subcategory',
            id: sub.id,
            name: display || t('categories.untitled'),
            expertCount: sub.registeredExpertsCount ?? sub.expertCount ?? null
        });
    };

    const requestDeleteService = (service, subCategoryId) => {
        if (!service?.id) return;
        setOpenMenu(null);
        const display = language === 'ar' ? service.nameAr || service.name : service.nameEn || service.name;
        setDeleteTarget({
            type: 'service',
            id: service.id,
            subCategoryId,
            name: display || t('categories.untitled'),
            expertCount: serviceExpertCount(service)
        });
    };

    const closeDeleteModal = () => setDeleteTarget(null);

    const executeDelete = async () => {
        if (!deleteTarget || actionLoading) return;
        setActionLoading(true);
        try {
            if (deleteTarget.type === 'category') {
                await catalogApi.deleteCategory(token, deleteTarget.id, { lang: language });
                invalidate('categories');
                await fetchCategories(true);
                toast.success(t('categories.messages.deleteCategorySuccess'));
            } else if (deleteTarget.type === 'subcategory') {
                await catalogApi.deleteSubCategory(token, deleteTarget.id, { lang: language });
                invalidate('categories');
                await fetchCategories(true);
                toast.success(t('categories.messages.deleteSubCategorySuccess'));
            } else if (deleteTarget.type === 'service') {
                await catalogApi.deleteService(token, deleteTarget.id, { lang: language });
                await fetchServices(deleteTarget.subCategoryId);
                toast.success(t('categories.messages.deleteServiceSuccess'));
                const sid = deleteTarget.subCategoryId;
                const currentCount = servicesCount[sid] || 0;
                setServicesCount((prev) => ({ ...prev, [sid]: Math.max(0, currentCount - 1) }));
            }
            closeDeleteModal();
        } catch (err) {
            console.error(err);
            toast.error(t('common.error'));
        } finally {
            setActionLoading(false);
        }
    };

    const openEditModal = (category) => {
        setEditingCategory(category);
        setFormData({
            titleEn: category.nameEn || '',
            titleAr: category.nameAr || ''
        });
        setShowEditModal(true);
    };

    const openEditSubModal = (sub) => {
        setEditingSubCategory(sub);
        setFormData({
            titleEn: sub.nameEn || '',
            titleAr: sub.nameAr || ''
        });
        setShowEditSubModal(true);
    };

    const openSubModal = (catId) => {
        setSelectedCategoryId(catId);
        setFormData({ titleEn: '', titleAr: '' });
        setShowSubModal(true);
    };

    const fieldClass =
        'w-full rounded-[8px] border border-[#E1DCEB] dark:border-dark-border bg-white dark:bg-dark-bg-tertiary px-4 py-3 text-[#151B30] dark:text-dark-text-primary outline-none focus:ring-2 focus:ring-[#0077b6]/25';

    const MenuDots = ({ mkey, children }) => (
        <div className="relative shrink-0" ref={openMenu === mkey ? menuRef : null}>
            <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[#666] hover:bg-black/[0.04] dark:hover:bg-white/10"
                aria-label="Menu"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === mkey ? null : mkey);
                }}
            >
                <MoreHorizontal className="h-6 w-6" />
            </button>
            {openMenu === mkey && (
                <div
                    className="absolute top-full z-[100] mt-1 min-w-[200px] rounded-xl border border-[#E1DCEB] dark:border-dark-border bg-white dark:bg-dark-bg-elevated py-2 shadow-[0_20px_30px_rgba(146,146,146,0.19)] end-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    {children}
                </div>
            )}
        </div>
    );

    const deleteTitle =
        deleteTarget?.type === 'category'
            ? t('categories.deleteModalTitle')
            : deleteTarget?.type === 'subcategory'
              ? t('categories.deleteModalTitleSub')
              : t('categories.deleteModalTitleService');

    return (
        <div className="space-y-6" dir={textDir}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 max-w-xl text-start">
                    <h1 className="text-[32px] font-bold leading-tight text-[#151B30] dark:text-dark-text-primary">
                        {t('categories.title')}
                    </h1>
                    <p className="mt-2 text-base text-[#666] dark:text-dark-text-secondary">{t('categories.subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setFormData({ titleEn: '', titleAr: '' });
                        setShowCreateModal(true);
                    }}
                    className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[8px] px-5 text-base font-medium text-white shadow-sm transition hover:opacity-95"
                    style={{ backgroundColor: BRAND }}
                >
                    <Plus className="h-5 w-5" />
                    {t('categories.addField')}
                </button>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND }} />
                </div>
            ) : error ? (
                <div className="flex items-center rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
                    <AlertTriangle className="me-2 h-5 w-5 shrink-0" />
                    {error}
                </div>
            ) : !Array.isArray(categories) || categories.length === 0 ? (
                <div className="flex flex-col items-center rounded-[12px] border border-[#E1DCEB] bg-white py-16 text-center dark:border-dark-border dark:bg-dark-bg-secondary">
                    <SearchX className="mb-4 h-14 w-14 text-[#B0B0B0]" />
                    <p className="text-[#666] dark:text-dark-text-muted">{t('categories.noCategories')}</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {categories.map((category) => {
                        const subN = category?.subCategories?.length || 0;
                        const catExperts = getExpertsCount(category);
                        const expanded = Boolean(category?.id && expandedCategories[category.id]);
                        const catTitle =
                            category?.name || (language === 'ar' ? category?.nameAr : category?.nameEn) || t('categories.untitled');
                        return (
                            <div
                                key={category?.id || Math.random()}
                                className="flex flex-col rounded-[12px] border border-[#E1DCEB] dark:border-dark-border bg-white dark:bg-dark-bg-secondary shadow-[0_20px_30px_rgba(146,146,146,0.12)]"
                            >
                                <div
                                    className={clsx(
                                        'flex min-h-[83px] items-center gap-3 px-3 py-2 sm:px-6',
                                        'bg-[#F5F5F5] dark:bg-dark-bg-tertiary',
                                        expanded
                                            ? 'rounded-t-[12px] border-b border-[#E1DCEB] dark:border-dark-border'
                                            : 'rounded-[12px]'
                                    )}
                                >
                                    {/* Figma RTL: مقبض السحب يمين، القائمة والسهم يسار — ترتيب DOM مع dir الصفحة */}
                                    <div
                                        className="hidden h-10 w-10 shrink-0 items-center justify-center text-[#999] sm:flex"
                                        aria-hidden
                                    >
                                        <GripVertical className="h-5 w-5" />
                                    </div>
                                    <div
                                        className="min-w-0 flex-1 cursor-pointer text-start"
                                        onClick={() => category?.id && toggleCategory(category.id)}
                                    >
                                        <div className="font-bold text-lg text-[#151B30] dark:text-dark-text-primary">{catTitle}</div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span className="inline-flex rounded-full bg-[#E8E8E8] px-3 py-1 text-xs font-medium text-[#555] dark:bg-white/10 dark:text-dark-text-secondary">
                                                {tpl(t('categories.subSpecialtyLine'), { n: subN })}
                                            </span>
                                            {catExperts != null && (
                                                <span className="inline-flex rounded-full bg-[#E8E8E8] px-3 py-1 text-xs font-medium text-[#555] dark:bg-white/10 dark:text-dark-text-secondary">
                                                    {tpl(t('categories.subExpertsCountLine'), { n: catExperts })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <MenuDots mkey={menuKey('c', category.id)}>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-medium text-[#151B30] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-white/5"
                                            onClick={() => {
                                                setOpenMenu(null);
                                                openEditModal(category);
                                            }}
                                        >
                                            <Pencil className="h-4 w-4 shrink-0 opacity-70" />
                                            {t('common.edit')}
                                        </button>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-medium text-[#151B30] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-white/5"
                                            onClick={() => {
                                                setOpenMenu(null);
                                                category?.id && openSubModal(category.id);
                                            }}
                                        >
                                            <Plus className="h-4 w-4 shrink-0 opacity-70" />
                                            {t('categories.addSubcategory')}
                                        </button>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                            onClick={() => requestDeleteCategory(category)}
                                        >
                                            <Trash2 className="h-4 w-4 shrink-0" />
                                            {t('categories.deleteCategory')}
                                        </button>
                                    </MenuDots>
                                    <button
                                        type="button"
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#666] hover:bg-black/[0.04]"
                                        onClick={() => category?.id && toggleCategory(category.id)}
                                    >
                                        {category?.id && expandedCategories[category.id] ? (
                                            <ChevronUp className="h-5 w-5" />
                                        ) : (
                                            <ChevronDown className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>

                                {category?.id && expanded && (
                                    <div className="space-y-3 rounded-b-[12px] bg-white p-4 dark:bg-dark-bg-secondary sm:p-6">
                                        {category.subCategories && category.subCategories.length > 0 ? (
                                            category.subCategories.map((sub) => {
                                                const svcCount = servicesCount[sub?.id];
                                                const subExperts = getExpertsCount(sub);
                                                const subTitle =
                                                    language === 'ar'
                                                        ? sub?.nameAr || sub?.name
                                                        : sub?.nameEn || sub?.name || t('categories.untitled');
                                                return (
                                                    <div key={sub?.id || Math.random()} className="space-y-3">
                                                        <div className="rounded-[12px] border border-[#E1DCEB] dark:border-dark-border bg-white p-3 dark:bg-dark-bg-secondary sm:p-4">
                                                            <div className="flex items-center gap-2 sm:gap-3">
                                                                <div className="hidden h-10 w-10 shrink-0 items-center justify-center text-[#999] sm:flex">
                                                                    <GripVertical className="h-5 w-5" />
                                                                </div>
                                                                <div
                                                                    className="min-w-0 flex-1 cursor-pointer text-start"
                                                                    onClick={() => sub?.id && toggleSubCategory(sub.id)}
                                                                >
                                                                    <div className="font-bold text-[#151B30] dark:text-dark-text-primary">
                                                                        {subTitle}
                                                                    </div>
                                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                        <span className="inline-flex rounded-full bg-[#F0F0F0] px-3 py-1 text-xs font-medium text-[#555] dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
                                                                            {svcCount !== undefined
                                                                                ? tpl(t('categories.subServicesLine'), { n: svcCount })
                                                                                : '…'}
                                                                        </span>
                                                                        {subExperts != null && (
                                                                            <span className="inline-flex rounded-full bg-[#F0F0F0] px-3 py-1 text-xs font-medium text-[#555] dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
                                                                                {tpl(t('categories.subExpertsCountLine'), {
                                                                                    n: subExperts
                                                                                })}
                                                                            </span>
                                                                        )}
                                                                        {sub?.id && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    navigate(
                                                                                        `/dashboard/submitted?view=all&subCategoryId=${encodeURIComponent(sub.id)}`
                                                                                    );
                                                                                }}
                                                                                className="inline-flex items-center gap-1.5 rounded-full border border-[#0077b6] bg-white px-3 py-1 text-xs font-semibold text-[#0077b6] hover:bg-[#f0f7ff] dark:border-sky-500 dark:bg-dark-bg-secondary dark:text-sky-400 dark:hover:bg-white/5"
                                                                            >
                                                                                <Users className="h-3.5 w-3.5 shrink-0" />
                                                                                {t('categories.viewExpertsForSubcategory')}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <MenuDots mkey={menuKey('s', sub.id)}>
                                                                    <button
                                                                        type="button"
                                                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-medium text-[#151B30] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-white/5"
                                                                        onClick={() => {
                                                                            setOpenMenu(null);
                                                                            openEditSubModal(sub);
                                                                        }}
                                                                    >
                                                                        <Pencil className="h-4 w-4" />
                                                                        {t('common.edit')}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-medium text-[#151B30] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-white/5"
                                                                        onClick={() => {
                                                                            setOpenMenu(null);
                                                                            sub?.id && openServiceModal(sub.id);
                                                                        }}
                                                                    >
                                                                        <Plus className="h-4 w-4" />
                                                                        {t('categories.addService')}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-medium text-red-600 hover:bg-red-50"
                                                                        onClick={() => requestDeleteSubCategory(sub)}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                        {t('categories.deleteSubcategory')}
                                                                    </button>
                                                                </MenuDots>
                                                                <button
                                                                    type="button"
                                                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#666]"
                                                                    onClick={() => sub?.id && toggleSubCategory(sub.id)}
                                                                >
                                                                    {sub?.id && expandedSubCategories[sub.id] ? (
                                                                        <ChevronUp className="h-5 w-5" />
                                                                    ) : (
                                                                        <ChevronDown className="h-5 w-5" />
                                                                    )}
                                                                </button>
                                                            </div>

                                                            {sub?.id && expandedSubCategories[sub.id] && (
                                                                <div className="mt-4 border-t border-[#f0f0f0] pt-4 dark:border-dark-border">
                                                                    {loadingServices[sub.id] ? (
                                                                        <div className="flex justify-center py-8">
                                                                            <Loader2
                                                                                className="h-6 w-6 animate-spin"
                                                                                style={{ color: BRAND }}
                                                                            />
                                                                        </div>
                                                                    ) : services[sub.id] && services[sub.id].length > 0 ? (
                                                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                                                            {services[sub.id].map((service) => {
                                                                                const sname =
                                                                                    language === 'ar'
                                                                                        ? service?.nameAr || service?.name
                                                                                        : service?.nameEn ||
                                                                                          service?.name ||
                                                                                          t('categories.untitled');
                                                                                return (
                                                                                    <div
                                                                                        key={service?.id || Math.random()}
                                                                                        className="relative rounded-[12px] border border-[#E1DCEB] dark:border-dark-border bg-white p-4 shadow-sm dark:bg-dark-bg-elevated"
                                                                                    >
                                                                                        <div className="flex items-start justify-between gap-2">
                                                                                            <div className="min-w-0 flex-1 text-start text-base font-bold leading-snug text-[#151B30] dark:text-dark-text-primary">
                                                                                                {sname}
                                                                                            </div>
                                                                                            <MenuDots mkey={menuKey('v', service.id)}>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-medium text-[#151B30] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-white/5"
                                                                                                    onClick={() => {
                                                                                                        setOpenMenu(null);
                                                                                                        openEditServiceModal(service, sub.id);
                                                                                                    }}
                                                                                                >
                                                                                                    <Pencil className="h-4 w-4" />
                                                                                                    {t('common.edit')}
                                                                                                </button>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-medium text-red-600 hover:bg-red-50"
                                                                                                    onClick={() =>
                                                                                                        requestDeleteService(service, sub.id)
                                                                                                    }
                                                                                                >
                                                                                                    <Trash2 className="h-4 w-4" />
                                                                                                    {t('categories.deleteService')}
                                                                                                </button>
                                                                                            </MenuDots>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="rounded-[12px] border border-[#E1DCEB] bg-white px-6 py-12 text-center dark:border-dark-border dark:bg-dark-bg-secondary">
                                                                            <div className="relative mx-auto mb-6 h-[160px] w-full max-w-[280px]">
                                                                                <img
                                                                                    src={FIGMA_EMPTY.background}
                                                                                    alt=""
                                                                                    className="absolute inset-0 size-full max-h-[160px] object-contain"
                                                                                />
                                                                                <img
                                                                                    src={FIGMA_EMPTY.lens}
                                                                                    alt=""
                                                                                    className="absolute inset-0 m-auto max-h-[120px] max-w-[120px] object-contain"
                                                                                />
                                                                                <img
                                                                                    src={FIGMA_EMPTY.doodles}
                                                                                    alt=""
                                                                                    className="absolute inset-0 m-auto max-h-[160px] object-contain"
                                                                                />
                                                                            </div>
                                                                            <p className="text-base font-bold text-[#151B30] dark:text-dark-text-primary">
                                                                                {t('categories.emptyServicesTitle')}
                                                                            </p>
                                                                            <p className="mt-2 text-sm text-[#666] dark:text-dark-text-secondary">
                                                                                {t('categories.emptyServicesSubtitle')}
                                                                            </p>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openServiceModal(sub.id)}
                                                                                className="mt-6 inline-flex h-12 items-center gap-2 rounded-[8px] px-5 text-sm font-medium text-white"
                                                                                style={{ backgroundColor: BRAND }}
                                                                            >
                                                                                <Plus className="h-5 w-5" />
                                                                                {t('categories.addNewService')}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="rounded-[12px] border border-[#E1DCEB] bg-white px-6 py-12 text-center dark:border-dark-border dark:bg-dark-bg-secondary">
                                                <div className="relative mx-auto mb-6 h-[160px] w-full max-w-[280px]">
                                                    <img
                                                        src={FIGMA_EMPTY.background}
                                                        alt=""
                                                        className="absolute inset-0 size-full max-h-[160px] object-contain"
                                                    />
                                                    <img
                                                        src={FIGMA_EMPTY.lens}
                                                        alt=""
                                                        className="absolute inset-0 m-auto max-h-[120px] max-w-[120px] object-contain"
                                                    />
                                                    <img
                                                        src={FIGMA_EMPTY.doodles}
                                                        alt=""
                                                        className="absolute inset-0 m-auto max-h-[160px] object-contain"
                                                    />
                                                </div>
                                                <p className="text-base font-bold text-[#151B30] dark:text-dark-text-primary">
                                                    {t('categories.emptySubcategoriesTitle')}
                                                </p>
                                                <p className="mt-2 text-sm text-[#666] dark:text-dark-text-secondary">
                                                    {t('categories.emptySubcategoriesSubtitle')}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => category?.id && openSubModal(category.id)}
                                                    className="mt-6 inline-flex h-12 items-center gap-2 rounded-[8px] px-5 text-sm font-medium text-white"
                                                    style={{ backgroundColor: BRAND }}
                                                >
                                                    <Plus className="h-5 w-5" />
                                                    {t('categories.addNewSubcategoryBtn')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Delete confirmation — Figma 145:13024 */}
            {deleteTarget && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.66)] p-4 backdrop-blur-[2px]"
                    onClick={closeDeleteModal}
                >
                    <div
                        className="w-full max-w-[400px] rounded-[16px] bg-white p-4 shadow-xl dark:bg-dark-bg-elevated"
                        onClick={(e) => e.stopPropagation()}
                        dir={textDir}
                    >
                        <div className="flex flex-col items-center gap-6">
                            <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[#fbeeee] dark:bg-rose-900/30">
                                <Trash2 className="h-9 w-9 text-[#ef4444]" />
                            </div>
                            <div className="flex w-full flex-col gap-2 text-center">
                                <h3 className="text-[18px] font-bold leading-tight text-[#333] dark:text-dark-text-primary">{deleteTitle}</h3>
                                <p className="text-[16px] font-medium leading-snug text-[#666] dark:text-dark-text-secondary">
                                    {tpl(t('categories.deleteModalIntro'), { name: deleteTarget.name })}
                                </p>
                                {deleteTarget.expertCount != null && deleteTarget.expertCount > 0 ? (
                                    <p className="text-[16px] font-medium leading-snug text-[#ef4444] dark:text-red-400">
                                        {tpl(t('categories.deleteModalWarningCount'), { n: deleteTarget.expertCount })}
                                    </p>
                                ) : null}
                            </div>
                            <div className="flex w-full gap-2.5">
                                {isRTL ? (
                                    <>
                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={executeDelete}
                                            className="flex h-12 min-h-12 flex-1 items-center justify-center rounded-[12px] bg-[#ef4444] px-4 text-[16px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
                                        >
                                            {actionLoading ? (
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                            ) : (
                                                t('categories.deleteModalConfirm')
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={closeDeleteModal}
                                            className="flex h-12 min-h-12 flex-1 items-center justify-center rounded-[12px] bg-[#f1f3ff] px-4 text-[16px] font-medium text-[#666] dark:bg-dark-bg-tertiary dark:text-dark-text-secondary"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={closeDeleteModal}
                                            className="flex h-12 min-h-12 flex-1 items-center justify-center rounded-[12px] bg-[#f1f3ff] px-4 text-[16px] font-medium text-[#666] dark:bg-dark-bg-tertiary dark:text-dark-text-secondary"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={executeDelete}
                                            className="flex h-12 min-h-12 flex-1 items-center justify-center rounded-[12px] bg-[#ef4444] px-4 text-[16px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
                                        >
                                            {actionLoading ? (
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                            ) : (
                                                t('categories.deleteModalConfirm')
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ShellModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title={t('categories.forms.createCategory')}
                headerIcon={Plus}
                dir={textDir}
            >
                <form onSubmit={handleCreateCategory} className="space-y-5 text-start">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.titleAr')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="rtl"
                            value={formData.titleAr}
                            onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.titleEn')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="ltr"
                            value={formData.titleEn}
                            onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                            className={clsx(fieldClass, 'text-start')}
                        />
                    </div>
                    <div className="flex flex-wrap justify-start gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="rounded-[8px] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                        >
                            {t('categories.forms.submit')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(false)}
                            className="rounded-[8px] bg-[#E8F4FC] px-5 py-2.5 text-sm font-semibold dark:bg-dark-bg-tertiary"
                            style={{ color: BRAND }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </ShellModal>

            {/* تعديل مجال — Figma 145:14220 */}
            {showEditModal && (
                <div
                    className="fixed inset-0 z-[58] flex items-center justify-center bg-[rgba(0,0,0,0.66)] p-4 backdrop-blur-[2px]"
                    onClick={() => setShowEditModal(false)}
                >
                    <div
                        className="w-full max-w-[400px] rounded-[16px] bg-white p-4 dark:bg-dark-bg-elevated"
                        onClick={(e) => e.stopPropagation()}
                        dir={textDir}
                    >
                        <form onSubmit={handleEditCategory} className="flex flex-col items-center gap-6">
                            <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[#f7f7f7] dark:bg-dark-bg-tertiary">
                                <Pencil className="h-10 w-10 text-[#333] dark:text-dark-text-primary" strokeWidth={1.5} />
                            </div>
                            <p className="text-center text-[18px] font-bold text-[#333] dark:text-dark-text-primary">
                                {t('categories.editFieldInfo')}
                            </p>
                            <div className="flex w-full flex-col gap-6 text-start">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[16px] font-normal text-[#333] dark:text-dark-text-primary">
                                        {t('categories.forms.titleAr')}
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        dir="rtl"
                                        value={formData.titleAr}
                                        onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                                        className="h-12 w-full rounded-[12px] border border-[#e2e2e2] bg-white px-4 py-2 text-[14px] text-[#333] outline-none focus:ring-2 focus:ring-khabeer-brand/25 dark:border-dark-border dark:bg-dark-bg-secondary dark:text-dark-text-primary"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[16px] font-normal text-[#333] dark:text-dark-text-primary">
                                        {t('categories.forms.titleEn')}
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        dir="ltr"
                                        value={formData.titleEn}
                                        onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                                        className="h-12 w-full rounded-[12px] border border-[#e2e2e2] bg-white px-4 py-2 text-start text-[14px] text-[#333] outline-none focus:ring-2 focus:ring-khabeer-brand/25 dark:border-dark-border dark:bg-dark-bg-secondary dark:text-dark-text-primary"
                                    />
                                </div>
                            </div>
                            <div className="flex w-full gap-2.5">
                                {isRTL ? (
                                    <>
                                        <button
                                            type="submit"
                                            disabled={actionLoading}
                                            className="flex h-12 min-h-12 flex-1 items-center justify-center rounded-[12px] px-4 text-[16px] font-medium text-white disabled:opacity-50"
                                            style={{ backgroundColor: BRAND }}
                                        >
                                            {t('categories.saveChanges')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowEditModal(false)}
                                            className="flex h-12 min-h-12 flex-1 items-center justify-center rounded-[12px] bg-[#f1f3ff] px-4 text-[16px] font-medium text-[#666] dark:bg-dark-bg-tertiary dark:text-dark-text-secondary"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setShowEditModal(false)}
                                            className="flex h-12 min-h-12 flex-1 items-center justify-center rounded-[12px] bg-[#f1f3ff] px-4 text-[16px] font-medium text-[#666] dark:bg-dark-bg-tertiary dark:text-dark-text-secondary"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={actionLoading}
                                            className="flex h-12 min-h-12 flex-1 items-center justify-center rounded-[12px] px-4 text-[16px] font-medium text-white disabled:opacity-50"
                                            style={{ backgroundColor: BRAND }}
                                        >
                                            {t('categories.saveChanges')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ShellModal
                isOpen={showEditSubModal}
                onClose={() => setShowEditSubModal(false)}
                title={t('categories.editSubFieldInfo')}
                headerIcon={Pencil}
                dir={textDir}
            >
                <form onSubmit={handleEditSubCategory} className="space-y-5 text-start">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.titleAr')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="rtl"
                            value={formData.titleAr}
                            onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.titleEn')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="ltr"
                            value={formData.titleEn}
                            onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                            className={clsx(fieldClass, 'text-start')}
                        />
                    </div>
                    <div className="flex flex-wrap justify-start gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="rounded-[8px] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                        >
                            {t('categories.saveChanges')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowEditSubModal(false)}
                            className="rounded-[8px] bg-[#E8F4FC] px-5 py-2.5 text-sm font-semibold dark:bg-dark-bg-tertiary"
                            style={{ color: BRAND }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </ShellModal>

            <ShellModal
                isOpen={showSubModal}
                onClose={() => setShowSubModal(false)}
                title={t('categories.forms.createSubcategory')}
                headerIcon={Plus}
                dir={textDir}
            >
                <form onSubmit={handleCreateSubCategory} className="space-y-5 text-start">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.titleAr')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="rtl"
                            value={formData.titleAr}
                            onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.titleEn')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="ltr"
                            value={formData.titleEn}
                            onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                            className={clsx(fieldClass, 'text-start')}
                        />
                    </div>
                    <div className="flex flex-wrap justify-start gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="rounded-[8px] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                        >
                            {t('categories.forms.submit')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowSubModal(false)}
                            className="rounded-[8px] bg-[#E8F4FC] px-5 py-2.5 text-sm font-semibold dark:bg-dark-bg-tertiary"
                            style={{ color: BRAND }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </ShellModal>

            <ShellModal
                isOpen={showServiceModal}
                onClose={() => {
                    setShowServiceModal(false);
                    setSelectedSubCategoryId(null);
                    setServiceFormData({ nameEn: '', nameAr: '' });
                }}
                title={t('categories.forms.createService')}
                headerIcon={Plus}
                wide
                dir={textDir}
            >
                <form onSubmit={handleCreateService} className="space-y-5 text-start">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.nameAr')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="rtl"
                            value={serviceFormData.nameAr}
                            onChange={(e) => setServiceFormData({ ...serviceFormData, nameAr: e.target.value })}
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.nameEn')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="ltr"
                            value={serviceFormData.nameEn}
                            onChange={(e) => setServiceFormData({ ...serviceFormData, nameEn: e.target.value })}
                            className={clsx(fieldClass, 'text-start')}
                        />
                    </div>
                    <div className="flex flex-wrap justify-start gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="rounded-[8px] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                        >
                            {t('categories.forms.submit')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowServiceModal(false);
                                setSelectedSubCategoryId(null);
                                setServiceFormData({ nameEn: '', nameAr: '' });
                            }}
                            className="rounded-[8px] bg-[#E8F4FC] px-5 py-2.5 text-sm font-semibold dark:bg-dark-bg-tertiary"
                            style={{ color: BRAND }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </ShellModal>

            <ShellModal
                isOpen={showEditServiceModal}
                onClose={() => {
                    setShowEditServiceModal(false);
                    setEditingService(null);
                    setSelectedSubCategoryId(null);
                    setServiceFormData({ nameEn: '', nameAr: '' });
                }}
                title={t('categories.forms.editService')}
                headerIcon={Pencil}
                wide
                dir={textDir}
            >
                <form onSubmit={handleEditService} className="space-y-5 text-start">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.nameAr')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="rtl"
                            value={serviceFormData.nameAr}
                            onChange={(e) => setServiceFormData({ ...serviceFormData, nameAr: e.target.value })}
                            className={fieldClass}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#333] dark:text-dark-text-primary">
                            {t('categories.forms.nameEn')}
                        </label>
                        <input
                            type="text"
                            required
                            dir="ltr"
                            value={serviceFormData.nameEn}
                            onChange={(e) => setServiceFormData({ ...serviceFormData, nameEn: e.target.value })}
                            className={clsx(fieldClass, 'text-start')}
                        />
                    </div>
                    <div className="flex flex-wrap justify-start gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="rounded-[8px] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                        >
                            {t('categories.saveChanges')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowEditServiceModal(false);
                                setEditingService(null);
                                setSelectedSubCategoryId(null);
                                setServiceFormData({ nameEn: '', nameAr: '' });
                            }}
                            className="rounded-[8px] bg-[#E8F4FC] px-5 py-2.5 text-sm font-semibold dark:bg-dark-bg-tertiary"
                            style={{ color: BRAND }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </ShellModal>
        </div>
    );
};

export default Categories;

