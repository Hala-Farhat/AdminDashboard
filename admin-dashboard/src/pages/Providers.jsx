import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCache } from '../context/CacheContext';
import { useToast } from '../context/ToastContext';
import api from '../api/apiConfig';
import { postBroadcastNotification } from '../api/notificationsApi';
import {
    fetchDashboardJoinRequestsList,
    fetchDashboardMyJoinRequests,
    parseJoinRequestsListResponse,
    parseMyJoinRequestsListResponse,
} from '../api/dashboardApi';
import { catalogApi } from '../api/catalogApi';
import AvatarOrInitial from '../components/AvatarOrInitial';
import {
    AlertCircle,
    Bell,
    Calendar,
    ChevronDown,
    Eye,
    Hourglass,
    Loader2,
    MessageSquare,
    MoreHorizontal,
    Users,
    Search,
    Send,
    UserCheck,
    UserRound,
    UserX,
} from 'lucide-react';
import clsx from 'clsx';
import {
    deriveIsActiveFromProviderDetail,
    errorIndicatesAlreadyActive,
    errorIndicatesAlreadyInactive,
    gatherDashboardUserActivateIdentifiers,
    getApiErrorMessage,
    isProviderAccountInactive,
    patchManageUserActive,
} from '../utils/providerUserManagement';

const PAGE_SIZE_EVERYONE = 10;
const PAGE_SIZE_MINE = 20;

/** صف جدول طلبات الانضمام / الخبراء من الـ API */
function mapDashboardExpert(item, language) {
    const spec = item.specialization;
    const serviceLabel = typeof item.serviceLabel === 'string' ? item.serviceLabel.trim() : '';
    const specialtyLabel = spec
        ? (language === 'ar' ? spec.nameAr : spec.nameEn) || spec.nameAr || spec.nameEn || '—'
        : serviceLabel || '—';
    /** join-requests/list يعيد حالة الطلب في `status`؛ قائمة الخبراء قد تستخدم `applicationStatus` */
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
    const isActive = item.isActive !== false && item.isActive !== 'false';

    return {
        id: item.providerId,
        providerId: item.providerId,
        applicationId: item.applicationId || item.providerId,
        manageUserId: item.firebaseUid,
        first_name,
        last_name,
        displayName: displayName || item.displayName || item.fullName || '',
        email: item.email,
        phone: item.phone || '',
        avatarUrl: item.avatarUrl,
        createdAt: item.joinedAt,
        status: statusKey,
        isActive,
        specialtyLabel,
        specialtyId: spec?.id ?? item.subCategoryId ?? null,
        addressLabel: '—',
        provider: {},
        personalInfo: null,
    };
}

/** joinPeriod لـ join-requests/list و my-join-requests: all | day | week | month | year */
function joinPeriodFromPreset(preset) {
    if (!preset || preset === 'all') return 'all';
    if (['day', 'week', 'month', 'year'].includes(preset)) return preset;
    return 'all';
}

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

/** دمج قوائم التخصص من عدة ردود API حتى لا تُستبدل القائمة الكاملة بما يظهر في الصفحة المفلترة فقط */
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

/** مفتاح تبويب حالة الطلب → applicationStatus لـ GET /manage/dashboard/join-requests/list */
function applicationStatusForExpertsList(key) {
    if (!key || key === 'all') return 'all';
    if (key === 'newRequest') return 'SUBMITTED';
    if (key === 'underReview') return 'UNDER_REVIEW';
    if (key === 'rejected') return 'REJECTED';
    if (key === 'approved') return 'APPROVED';
    return 'all';
}

/** Match table row when applicationId / row id / providerId differ between API and UI. */
function matchesProviderTableRow(r, target) {
    if (!r || !target) return false;
    const tSet = new Set([target.applicationId, target.id, target.providerId].filter((x) => x != null && x !== ''));
    const rIds = [r.applicationId, r.id, r.providerId].filter((x) => x != null && x !== '');
    return rIds.some((id) => tSet.has(id));
}

/**
 * Row actions menu by provider state (admin workflow).
 * عرض الملف دائماً؛ تعطيل/إعادة تفعيل حسب نشاط الحساب فقط (لا يعتمد على حالة طلب الانضمام).
 */

/** Renders row actions outside the table scroll container so overflow-x-auto cannot clip the menu. */
function ProvidersRowActionsMenuPortal({
    anchorRect,
    isRTL,
    row,
    t,
    onClose,
    openDetails,
    setDisableModalRow,
    setReactivateModalRow,
}) {
    const accountInactive = isProviderAccountInactive(row);
    const menuRef = useRef(null);
    const [topPx, setTopPx] = useState(anchorRect.bottom + 4);

    useLayoutEffect(() => {
        if (typeof window === 'undefined') return;
        const menuEl = menuRef.current;
        const menuHeight = menuEl ? menuEl.offsetHeight : 0;
        const viewportBottom = window.innerHeight - 8;
        const openDownTop = anchorRect.bottom + 4;

        // Keep menu next to trigger while preventing viewport overflow.
        if (menuHeight > 0 && openDownTop + menuHeight > viewportBottom) {
            setTopPx(Math.max(8, anchorRect.top - menuHeight - 4));
            return;
        }
        setTopPx(openDownTop);
    }, [anchorRect, accountInactive]);
    const horizontalStyle = isRTL
        ? { left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 228)) }
        : { right: Math.max(8, window.innerWidth - anchorRect.right) };

    return createPortal(
        <div
            ref={menuRef}
            data-providers-row-menu
            className="fixed z-[200] flex min-w-[220px] flex-col gap-2 overflow-hidden rounded-lg border border-solid border-[#e2e2e2] bg-white px-2 py-4 shadow-[0_0_35px_rgba(0,0,0,0.04)] dark:border-dark-border dark:bg-dark-bg-elevated"
            style={{ top: topPx, ...horizontalStyle }}
            dir={isRTL ? 'rtl' : 'ltr'}
        >
            <button
                type="button"
                className="flex h-8 min-h-8 w-full shrink-0 items-center gap-2 rounded px-4 text-start text-[14px] font-medium leading-normal text-[#333] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                onClick={() => {
                    onClose();
                    openDetails(row);
                }}
            >
                <Eye className="size-5 shrink-0" strokeWidth={1.75} />
                {t('providers.actionsMenu.viewProfile')}
            </button>
            {!accountInactive && (
                <>
                    <div className="h-px w-full shrink-0 bg-[#e2e2e2] dark:bg-dark-border" role="separator" />
                    <button
                        type="button"
                        className="flex h-8 min-h-8 w-full shrink-0 items-center gap-2 rounded px-4 text-start text-[14px] font-medium leading-normal text-[#ef4444] hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        onClick={() => {
                            onClose();
                            setDisableModalRow(row);
                        }}
                    >
                        <UserX className="size-5 shrink-0" strokeWidth={1.75} />
                        {t('providers.actionsMenu.disable')}
                    </button>
                </>
            )}
            {accountInactive && (
                <>
                    <div className="h-px w-full shrink-0 bg-[#e2e2e2] dark:bg-dark-border" role="separator" />
                    <button
                        type="button"
                        className="flex h-8 min-h-8 w-full shrink-0 items-center gap-2 rounded px-4 text-start text-[14px] font-medium leading-normal text-[#333] hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                        onClick={() => {
                            onClose();
                            setReactivateModalRow(row);
                        }}
                    >
                        <UserCheck className="size-5 shrink-0" strokeWidth={1.75} />
                        {t('providers.actionsMenu.reactivate')}
                    </button>
                </>
            )}
        </div>,
        document.body
    );
}

const Providers = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        pending: 0,
        disabled: 0,
    });

    const location = useLocation();
    const navigate = useNavigate();
    const { token } = useAuth();
    const { language, t } = useLanguage();
    const { invalidate } = useCache();
    const toast = useToast();

    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [joinPreset, setJoinPreset] = useState('all');
    /** subCategoryId من الـ API أو all */
    const [specialtyFilter, setSpecialtyFilter] = useState('all');
    /** نشط / معطل / الكل — يُمرَّر لـ GET /manage/dashboard/experts */
    const [accountStatusFilter, setAccountStatusFilter] = useState('all');
    /** everyone = قائمة الجميع (experts)، mine = طلباتي فقط (my-join-requests) */
    const [listScope, setListScope] = useState('everyone');
    /**
     * عند listScope === 'mine': filter لـ my-join-requests
     * all → filter=all، ثم reviewing | approved | rejected
     */
    const [myReviewFilter, setMyReviewFilter] = useState('all');
    const [filterSpecializations, setFilterSpecializations] = useState([]);
    /** كل التخصصات (فئات فرعية) من كتالوج النظام — مستقل عن نتائج الجدول */
    const [catalogSpecializations, setCatalogSpecializations] = useState([]);
    const [listMeta, setListMeta] = useState({
        total: 0,
        totalPages: 1,
        count: 0,
        page: 1,
        limit: PAGE_SIZE_EVERYONE,
        hasNextPage: false,
        hasPreviousPage: false,
    });
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [openRowMenuId, setOpenRowMenuId] = useState(null);
    const [rowMenuAnchorRect, setRowMenuAnchorRect] = useState(null);
    const rowMenuTriggerRef = useRef(null);

    const closeRowActionMenu = useCallback(() => {
        setOpenRowMenuId(null);
        setRowMenuAnchorRect(null);
        rowMenuTriggerRef.current = null;
    }, []);
    const [page, setPage] = useState(1);
    const [listRefresh, setListRefresh] = useState(0);
    const [disableModalRow, setDisableModalRow] = useState(null);
    const [disableLoading, setDisableLoading] = useState(false);
    const [reactivateModalRow, setReactivateModalRow] = useState(null);
    const [reactivateLoading, setReactivateLoading] = useState(false);
    const [bulkNotifyOpen, setBulkNotifyOpen] = useState(false);
    const [bulkNotifyTitleAr, setBulkNotifyTitleAr] = useState('');
    const [bulkNotifyBodyAr, setBulkNotifyBodyAr] = useState('');
    const [bulkNotifyTitleEn, setBulkNotifyTitleEn] = useState('');
    const [bulkNotifyBodyEn, setBulkNotifyBodyEn] = useState('');
    const [bulkNotifySending, setBulkNotifySending] = useState(false);

    const isRTL = language === 'ar';

    const getStatusFromPath = () => {
        if (location.pathname.includes('submitted')) return 'submitted';
        if (location.pathname.includes('under-review')) return 'underReview';
        if (location.pathname.includes('approved')) return 'approved';
        if (location.pathname.includes('rejected')) return 'rejected';
        return 'submitted';
    };

    const pathStatus = getStatusFromPath();
    const viewAll = searchParams.get('view') === 'all';

    /** رابط من صفحة التصنيفات: ?subCategoryId=… يفعّل فلتر التخصص الفرعي */
    useEffect(() => {
        const scid = searchParams.get('subCategoryId');
        if (scid && scid.trim()) {
            setSpecialtyFilter(scid.trim());
            setListScope('everyone');
        }
    }, [searchParams]);

    const applicationIdParam = (searchParams.get('applicationId') || '').trim();
    /** إشعار أدمن: ?search= أو ?q= — تعبئة البحث بالاسم */
    const searchFromUrlParam = (searchParams.get('search') || searchParams.get('q') || '').trim();

    /** إشعار أدمن / رابط عميق: ?search=الاسم أو ?applicationId=… (بحث بالمعرف ثم فتح تفاصيل الخبير) */
    useEffect(() => {
        if (searchFromUrlParam) {
            setSpecialtyFilter('all');
            setListScope('everyone');
            setSearchQuery(searchFromUrlParam);
            setPage(1);
            return;
        }
        if (!applicationIdParam) return;
        setSpecialtyFilter('all');
        setListScope('everyone');
        setSearchQuery(applicationIdParam);
        setPage(1);
    }, [searchFromUrlParam, applicationIdParam]);

    /** حالة الطلب في المسار (بدون تمييز نشط/معطل — ذلك في فلتر حالة الحساب) */
    const currentRequestStatusKey = useMemo(() => {
        if (viewAll) return 'all';
        if (pathStatus === 'submitted') return 'newRequest';
        if (pathStatus === 'underReview') return 'underReview';
        if (pathStatus === 'rejected') return 'rejected';
        if (pathStatus === 'approved') return 'approved';
        return 'newRequest';
    }, [pathStatus, viewAll]);

    const expertsApplicationStatus = useMemo(
        () => applicationStatusForExpertsList(currentRequestStatusKey),
        [currentRequestStatusKey]
    );

    const statusOptions = useMemo(
        () => [
            { key: 'all', label: t('providers.statusOption.all') },
            { key: 'newRequest', label: t('providers.statusOption.newRequest') },
            { key: 'underReview', label: t('providers.statusOption.underReview') },
            { key: 'rejected', label: t('providers.statusOption.rejected') },
            { key: 'approved', label: t('providers.statusOption.accepted') },
        ],
        [t]
    );

    const navigateForStatusKey = (key) => {
        const mapNav = {
            all: '/dashboard/submitted?view=all',
            newRequest: '/dashboard/submitted',
            underReview: '/dashboard/under-review',
            rejected: '/dashboard/rejected',
            approved: '/dashboard/approved',
        };
        setListScope('everyone');
        navigate(mapNav[key] || '/dashboard/submitted?view=all');
        setStatusMenuOpen(false);
        setPage(1);
    };

    const setListScopeAndReset = (next) => {
        setPage(1);
        setStatusMenuOpen(false);
        /** عند التبديل بين النطاقين: إعادة كل الفلاتر للوضع الافتراضي «الكل» */
        setSpecialtyFilter('all');
        setSearchQuery('');
        setDebouncedSearch('');
        setJoinPreset('all');
        setAccountStatusFilter('all');
        setMyReviewFilter('all');
        navigate('/dashboard/submitted?view=all', { replace: true });
        setListScope(next);
    };

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

    const joinPeriodParam = useMemo(() => joinPeriodFromPreset(joinPreset), [joinPreset]);

    const myReviewFilterOptions = useMemo(
        () => [
            { key: 'all', label: t('providers.myRequestsFilterAll') },
            { key: 'reviewing', label: t('providers.myRequestsFilterReviewing') },
            { key: 'approved', label: t('providers.myRequestsFilterApproved') },
            { key: 'rejected', label: t('providers.myRequestsFilterRejected') },
        ],
        [t]
    );

    const myJoinRequestsFilterParam = useMemo(() => {
        if (myReviewFilter === 'reviewing') return 'reviewing';
        if (myReviewFilter === 'approved') return 'approved';
        if (myReviewFilter === 'rejected') return 'rejected';
        /** «الكل» = filter=all (قبلتها أو رفضتها أو راجعتها من قبلي) */
        return 'all';
    }, [myReviewFilter]);

    const statsFromSummary = useCallback((summary) => {
        if (!summary || typeof summary !== 'object') {
            return { total: 0, pending: 0, active: 0, disabled: 0 };
        }
        const requests = summary.requests ?? summary.byApplicationStatus ?? {};
        const underReviewRequests = Number(
            summary.underReviewTotal ??
                summary.underReview ??
                requests.underReview ??
                requests.under_review ??
                requests.UNDER_REVIEW ??
                0
        );
        const active = Number(summary.activeAccounts ?? summary.active ?? 0);
        const disabled = Number(summary.inactiveAccounts ?? summary.inactive ?? 0);
        const accountsSum = (Number.isFinite(active) ? active : 0) + (Number.isFinite(disabled) ? disabled : 0);
        let total = Number(
            summary.expertsTotal ??
                summary.totalRequests ??
                summary.total ??
                summary.requestsTotal ??
                0
        );
        if (!Number.isFinite(total) || total < 0) total = 0;
        /** بعض ردود join-requests/list ترجع expertsTotal=0 مع activeAccounts صحيح */
        if (total === 0 && accountsSum > 0) total = accountsSum;
        return {
            total,
            pending: Number.isFinite(underReviewRequests) ? underReviewRequests : 0,
            active: Number.isFinite(active) ? active : 0,
            disabled: Number.isFinite(disabled) ? disabled : 0,
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!token) return;
            try {
                const res = await fetchDashboardJoinRequestsList(token, {
                    lang: language,
                    page: 1,
                    limit: 1,
                    joinPeriod: 'all',
                    applicationStatus: 'all',
                    accountStatus: 'all',
                });
                const { summary, specializations } = parseJoinRequestsListResponse(res);
                if (cancelled) return;
                setStats(statsFromSummary(summary));
                if (Array.isArray(specializations) && specializations.length > 0) {
                    setFilterSpecializations((prev) => mergeSpecializationRecords(prev, specializations));
                }
            } catch {
                /* keep previous stats — list fetch will surface errors */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, language, statsFromSummary]);

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

    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
        return () => clearTimeout(id);
    }, [searchQuery]);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!token) return;
            setLoading(true);
            setError(null);
            try {
                const pageSize = listScope === 'everyone' ? PAGE_SIZE_EVERYONE : PAGE_SIZE_MINE;
                const res =
                    listScope === 'everyone'
                        ? await fetchDashboardJoinRequestsList(token, {
                              lang: language,
                              page,
                              limit: pageSize,
                              joinPeriod: joinPeriodParam,
                              applicationStatus: expertsApplicationStatus,
                              accountStatus: accountStatusFilter,
                              subCategoryId: specialtyFilter !== 'all' ? specialtyFilter : undefined,
                              search: debouncedSearch || undefined,
                          })
                        : await fetchDashboardMyJoinRequests(token, {
                              lang: language,
                              page,
                              limit: pageSize,
                              joinPeriod: joinPeriodParam,
                              filter: myJoinRequestsFilterParam,
                              accountStatus: accountStatusFilter,
                              subCategoryId: specialtyFilter !== 'all' ? specialtyFilter : undefined,
                              search: debouncedSearch || undefined,
                          });
                const parsed =
                    listScope === 'everyone'
                        ? parseJoinRequestsListResponse(res)
                        : parseMyJoinRequestsListResponse(res);
                const { data, meta } = parsed;
                if (cancelled) return;
                setFilterSpecializations((prev) => mergeSpecializationRecords(prev, parsed.specializations ?? []));
                setRows(data.map((item) => mapDashboardExpert(item, language)));
                setListMeta({
                    total: meta.total ?? 0,
                    totalPages: Math.max(1, meta.totalPages ?? 1),
                    count: meta.count ?? data.length,
                    page: meta.page ?? page,
                    limit: meta.limit ?? pageSize,
                    hasNextPage: !!meta.hasNextPage,
                    hasPreviousPage: !!meta.hasPreviousPage,
                });
                const globalListQuery =
                    listScope === 'everyone' &&
                    page === 1 &&
                    expertsApplicationStatus === 'all' &&
                    accountStatusFilter === 'all' &&
                    specialtyFilter === 'all' &&
                    !debouncedSearch &&
                    joinPeriodParam === 'all';
                if (globalListQuery && parsed.summary && typeof parsed.summary === 'object') {
                    setStats(statsFromSummary(parsed.summary));
                }
            } catch (err) {
                console.error(
                    listScope === 'everyone' ? 'Error fetching join requests list:' : 'Error fetching my join requests:',
                    err
                );
                if (!cancelled) {
                    setRows([]);
                    setListMeta((m) => ({ ...m, totalPages: 1, total: 0, count: 0 }));
                    setError(err.message || t('common.error'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [
        listScope,
        token,
        language,
        page,
        expertsApplicationStatus,
        myJoinRequestsFilterParam,
        accountStatusFilter,
        specialtyFilter,
        debouncedSearch,
        joinPeriodParam,
        listRefresh,
        statsFromSummary,
        t,
    ]);

    useEffect(() => {
        setPage(1);
    }, [pathStatus, viewAll, accountStatusFilter, specialtyFilter, searchQuery, joinPreset, myReviewFilter, listScope]);

    useEffect(() => {
        const tp = listMeta.totalPages || 1;
        if (page > tp) setPage(tp);
    }, [listMeta.totalPages, page]);

    useEffect(() => {
        if (!applicationIdParam) return;
        if (loading) return;
        const row = rows.find((r) => matchesProviderTableRow(r, { applicationId: applicationIdParam }));
        if (!row?.providerId) return;
        navigate(
            `/dashboard/provider/${row.providerId}?appId=${encodeURIComponent(row.applicationId)}&status=${row.status}`,
            { replace: true }
        );
    }, [applicationIdParam, loading, rows, navigate]);

    useEffect(() => {
        const close = (e) => {
            const t = e.target;
            if (t.closest?.('[data-providers-status-menu]')) return;
            if (t.closest?.('[data-providers-row-menu]')) return;
            if (t.closest?.('[data-providers-row-trigger]')) return;
            if (t.closest?.('[data-providers-disable-modal]')) return;
            if (t.closest?.('[data-providers-reactivate-modal]')) return;
            closeRowActionMenu();
            setStatusMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [closeRowActionMenu]);

    useEffect(() => {
        if (!openRowMenuId) return;
        const update = () => {
            const el = rowMenuTriggerRef.current;
            if (el) setRowMenuAnchorRect(el.getBoundingClientRect());
        };
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [openRowMenuId]);

    /** خيارات التخصّص: الكتالوج الكامل أولاً، ثم ما يأتي من join-requests، ثم صفوف الجدول */
    const specialtyOptions = useMemo(() => {
        const merged = mergeSpecializationRecords(catalogSpecializations, filterSpecializations);
        const opts = mapApiSpecializationsToOptions(merged, language);
        if (opts.length > 0) return opts;
        const map = new Map();
        rows.forEach((r) => {
            if (r.specialtyId && r.specialtyLabel && r.specialtyLabel !== '—') {
                map.set(r.specialtyId, r.specialtyLabel);
            }
        });
        return Array.from(map.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label, language === 'ar' ? 'ar' : 'en'));
    }, [catalogSpecializations, filterSpecializations, rows, language]);

    const pageCount = Math.max(1, listMeta.totalPages || 1);
    const pageSafe = Math.min(page, pageCount);
    const pagedRows = rows;

    const portalMenuRow = useMemo(() => {
        if (openRowMenuId == null) return null;
        return pagedRows.find((r) => (r.applicationId || r.id) === openRowMenuId) ?? null;
    }, [openRowMenuId, pagedRows]);

    useEffect(() => {
        if (!openRowMenuId) return;
        if (!pagedRows.some((r) => (r.applicationId || r.id) === openRowMenuId)) {
            closeRowActionMenu();
        }
    }, [pagedRows, openRowMenuId, closeRowActionMenu]);

    /** شارة حالة الطلب (مسار الطلب فقط — مقبول وليس نشطاً حسابياً) */
    const requestStatusBadgeClass = (row) => {
        switch (row.status) {
            case 'submitted':
                return 'bg-[#0077b6] text-white dark:bg-khabeer-brand dark:text-white';
            case 'underReview':
                return 'bg-amber-500 text-white dark:bg-amber-600 dark:text-white';
            case 'approved':
                return 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white';
            case 'rejected':
                return 'bg-rose-600 text-white dark:bg-rose-500 dark:text-white';
            case 'draft':
                return 'bg-slate-500 text-white dark:bg-slate-600 dark:text-white';
            default:
                return 'bg-slate-500 text-white dark:bg-slate-600 dark:text-white';
        }
    };

    const requestStatusLabel = (row) => {
        if (row.status === 'approved') return t('providers.statusOption.accepted');
        const key = row.status === 'underReview' ? 'underReview' : row.status;
        if (['submitted', 'underReview', 'rejected', 'draft'].includes(key)) {
            return t(`providers.status.${key}`);
        }
        return t('providers.status.submitted');
    };

    /** حالة الحساب = isActive فقط (بغضّ عن حالة الطلب) */
    const accountStatusBadgeClass = (row) =>
        isProviderAccountInactive(row)
            ? 'bg-amber-500 text-white dark:bg-amber-600 dark:text-white'
            : 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white';

    const accountStatusLabel = (row) =>
        isProviderAccountInactive(row) ? t('providers.accountFilterInactive') : t('providers.accountFilterActive');

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

    const openDetails = (row) => {
        navigate(`/dashboard/provider/${row.providerId}?appId=${row.applicationId}&status=${row.status}`, {
            state: { provider: row },
        });
    };

    const closeDisableModal = () => {
        if (disableLoading) return;
        setDisableModalRow(null);
    };

    const closeReactivateModal = () => {
        if (reactivateLoading) return;
        setReactivateModalRow(null);
    };

    const closeBulkNotifyModal = () => {
        if (bulkNotifySending) return;
        setBulkNotifyOpen(false);
        setBulkNotifyTitleAr('');
        setBulkNotifyBodyAr('');
        setBulkNotifyTitleEn('');
        setBulkNotifyBodyEn('');
    };

    const submitBulkNotify = async () => {
        const titleAr = bulkNotifyTitleAr.trim();
        const bodyAr = bulkNotifyBodyAr.trim();
        const titleEn = bulkNotifyTitleEn.trim();
        const bodyEn = bulkNotifyBodyEn.trim();
        if (!titleAr || !bodyAr || !titleEn || !bodyEn) {
            toast.error(t('providers.bulkNotifyModal.allFieldsRequired'));
            return;
        }
        setBulkNotifySending(true);
        try {
            await postBroadcastNotification(token, {
                audience: 'providers',
                titleAr,
                bodyAr,
                titleEn,
                bodyEn,
            });
            toast.success(t('providers.bulkNotifyModal.sentSuccess'));
            setBulkNotifyOpen(false);
            setBulkNotifyTitleAr('');
            setBulkNotifyBodyAr('');
            setBulkNotifyTitleEn('');
            setBulkNotifyBodyEn('');
        } catch (err) {
            toast.error(getApiErrorMessage(err) || t('common.error'));
        } finally {
            setBulkNotifySending(false);
        }
    };

    const fetchProviderDetailPayload = async (row) => {
        const pid = row?.providerId;
        if (!pid) return null;
        try {
            const res = await api.get(`/manage/users/provider/${encodeURIComponent(pid)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.data?.success && res.data.data ? res.data.data : null;
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    const syncRowIsActive = (targetRow, active) => {
        setRows((prev) =>
            prev.map((r) => (matchesProviderTableRow(r, targetRow) ? { ...r, isActive: active } : r))
        );
        setStats((prev) => {
            const next = { ...prev };
            if (active) {
                next.active = Math.max(0, Number(prev.active || 0) + 1);
                next.disabled = Math.max(0, Number(prev.disabled || 0) - 1);
            } else {
                next.active = Math.max(0, Number(prev.active || 0) - 1);
                next.disabled = Math.max(0, Number(prev.disabled || 0) + 1);
            }
            return next;
        });
    };

    const confirmDisableAccount = async () => {
        const row = disableModalRow;
        setDisableLoading(true);
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const detailPayload = await fetchProviderDetailPayload(row);
            const detailActive = deriveIsActiveFromProviderDetail(detailPayload);
            if (detailActive === false) {
                syncRowIsActive(row, false);
                toast.info(t('providers.messages.accountAlreadyInactive'));
                invalidate('providers');
                setListRefresh((n) => n + 1);
                setDisableModalRow(null);
                return;
            }
            const activateIds = gatherDashboardUserActivateIdentifiers(row, detailPayload);
            if (!activateIds.length) {
                toast.error(t('providers.disableModal.noUserId'));
                return;
            }
            await patchManageUserActive(api, activateIds, 'deactivate', headers);
            toast.success(t('users.messages.deactivateSuccess'));
            invalidate('providers');
            setListRefresh((n) => n + 1);
            syncRowIsActive(row, false);
            setDisableModalRow(null);
        } catch (err) {
            console.error(err);
            if (errorIndicatesAlreadyInactive(err)) {
                syncRowIsActive(row, false);
                invalidate('providers');
                setListRefresh((n) => n + 1);
                toast.info(getApiErrorMessage(err) || t('providers.messages.accountAlreadyInactive'));
                setDisableModalRow(null);
            } else {
                toast.error(getApiErrorMessage(err) || t('common.error'));
            }
        } finally {
            setDisableLoading(false);
        }
    };

    const submitReactivateAccount = async () => {
        const row = reactivateModalRow;
        if (!row) return;
        setReactivateLoading(true);
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const detailPayload = await fetchProviderDetailPayload(row);
            const detailActive = deriveIsActiveFromProviderDetail(detailPayload);
            if (detailActive === true) {
                syncRowIsActive(row, true);
                toast.info(t('providers.messages.accountAlreadyActive'));
                invalidate('providers');
                setListRefresh((n) => n + 1);
                setReactivateModalRow(null);
                return;
            }
            const activateIds = gatherDashboardUserActivateIdentifiers(row, detailPayload);
            if (!activateIds.length) {
                toast.error(t('providers.disableModal.noUserId'));
                return;
            }
            await patchManageUserActive(api, activateIds, 'activate', headers);
            toast.success(t('users.messages.activateSuccess'));
            invalidate('providers');
            setListRefresh((n) => n + 1);
            syncRowIsActive(row, true);
            setReactivateModalRow(null);
        } catch (err) {
            console.error(err);
            if (errorIndicatesAlreadyActive(err)) {
                syncRowIsActive(row, true);
                invalidate('providers');
                setListRefresh((n) => n + 1);
                toast.info(getApiErrorMessage(err) || t('providers.messages.accountAlreadyActive'));
                setReactivateModalRow(null);
            } else {
                toast.error(getApiErrorMessage(err) || t('common.error'));
            }
        } finally {
            setReactivateLoading(false);
        }
    };

    return (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-6 text-start">
            {disableModalRow && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.66] p-4 backdrop-blur-[2px]"
                    role="presentation"
                    onClick={closeDisableModal}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="disable-account-title"
                        data-providers-disable-modal
                        className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-xl dark:bg-dark-bg-elevated dark:ring-1 dark:ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
                            <h2
                                id="disable-account-title"
                                className="text-center text-lg font-bold leading-normal text-[#333] dark:text-dark-text-primary"
                            >
                                {t('providers.disableModal.title')}
                            </h2>
                            <div
                                className={clsx(
                                    'flex h-12 w-full gap-2.5',
                                    isRTL && 'flex-row-reverse'
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={closeDisableModal}
                                    disabled={disableLoading}
                                    className="flex flex-1 items-center justify-center rounded-xl bg-[#f1f3ff] px-4 text-base font-medium text-[#666] transition-colors hover:bg-[#e8ecfc] disabled:opacity-50 disabled:pointer-events-none dark:bg-dark-bg-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-bg-secondary"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDisableAccount}
                                    disabled={disableLoading}
                                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#ef4444] px-4 text-base font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-70"
                                >
                                    {disableLoading ? (
                                        <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
                                    ) : null}
                                    {disableLoading ? null : t('common.confirm')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {reactivateModalRow && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.66] p-4 backdrop-blur-[2px]"
                    role="presentation"
                    onClick={closeReactivateModal}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="providers-reactivate-account-title"
                        data-providers-reactivate-modal
                        className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-xl dark:bg-dark-bg-elevated dark:ring-1 dark:ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
                            <h2
                                id="providers-reactivate-account-title"
                                className="text-center text-lg font-bold leading-normal text-[#333] dark:text-dark-text-primary"
                            >
                                {t('providers.reactivateModal.title')}
                            </h2>
                            <div className={clsx('flex h-12 w-full gap-2.5', isRTL && 'flex-row-reverse')}>
                                <button
                                    type="button"
                                    onClick={closeReactivateModal}
                                    disabled={reactivateLoading}
                                    className="flex flex-1 items-center justify-center rounded-xl bg-[#f1f3ff] px-4 text-base font-medium text-[#666] transition-colors hover:bg-[#e8ecfc] disabled:opacity-50 disabled:pointer-events-none dark:bg-dark-bg-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-bg-secondary"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={submitReactivateAccount}
                                    disabled={reactivateLoading}
                                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-base font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-70 dark:bg-dark-accent-green dark:hover:bg-green-500"
                                >
                                    {reactivateLoading ? (
                                        <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
                                    ) : null}
                                    {reactivateLoading ? null : t('common.confirm')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {bulkNotifyOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.66] p-4 backdrop-blur-[2px]"
                    role="presentation"
                    onClick={closeBulkNotifyModal}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="bulk-notify-title"
                        data-providers-bulk-notify-modal
                        dir={isRTL ? 'rtl' : 'ltr'}
                        className="w-full max-w-[min(100%,28rem)] rounded-2xl border border-[#e2e2e2] bg-white p-4 shadow-[0_0_35px_rgba(0,0,0,0.04)] dark:border-dark-border dark:bg-dark-bg-elevated dark:shadow-none dark:ring-1 dark:ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex max-h-[min(90vh,40rem)] w-full flex-col gap-6 overflow-y-auto pe-1">
                            <div className="flex w-full flex-col items-center gap-3">
                                <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[#f7f7f7] dark:bg-dark-bg-tertiary">
                                    <Bell className="size-12 text-[#333] dark:text-dark-text-primary" strokeWidth={1.75} />
                                </div>
                                <h2
                                    id="bulk-notify-title"
                                    className="text-center text-[18px] font-bold leading-normal text-[#333] dark:text-dark-text-primary"
                                >
                                    {t('providers.bulkNotifyModal.title')}
                                </h2>
                            </div>
                            <div className="flex w-full min-w-0 flex-col gap-5">
                                <div
                                    className="w-full min-w-0 space-y-4"
                                    dir={isRTL ? 'rtl' : 'ltr'}
                                    lang="ar"
                                >
                                <div className="flex w-full min-w-0 flex-col gap-2">
                                    <label
                                        htmlFor="bulk-notify-title-ar"
                                        className="w-full text-start text-[16px] text-[#333] dark:text-dark-text-primary"
                                    >
                                        {t('providers.bulkNotifyModal.notificationTitleAr')}
                                    </label>
                                    <div
                                        className="flex h-12 w-full min-w-0 flex-row items-center gap-2 rounded-xl border border-[#e2e2e2] bg-white px-4 py-2 dark:border-dark-border dark:bg-dark-bg-tertiary"
                                    >
                                        <MessageSquare
                                            className="size-5 shrink-0 text-[#999] dark:text-dark-text-muted"
                                            strokeWidth={1.75}
                                        />
                                        <input
                                            id="bulk-notify-title-ar"
                                            type="text"
                                            value={bulkNotifyTitleAr}
                                            onChange={(e) => setBulkNotifyTitleAr(e.target.value)}
                                            placeholder={t('providers.bulkNotifyModal.notificationTitlePlaceholder')}
                                            className="min-w-0 flex-1 bg-transparent text-start text-[14px] text-[#333] placeholder:text-[#999] outline-none focus:outline-none dark:text-dark-text-primary dark:placeholder-dark-text-muted"
                                            dir="rtl"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                                <div className="flex w-full min-w-0 flex-col gap-2">
                                    <label
                                        htmlFor="bulk-notify-body-ar"
                                        className="w-full text-start text-[16px] text-[#333] dark:text-dark-text-primary"
                                    >
                                        {t('providers.bulkNotifyModal.notificationBodyAr')}
                                    </label>
                                    <div
                                        className="flex min-h-[85px] w-full min-w-0 flex-row items-start gap-2 rounded-xl border border-[#e2e2e2] bg-white px-4 py-2 dark:border-dark-border dark:bg-dark-bg-tertiary"
                                    >
                                        <MessageSquare
                                            className="mt-0.5 size-5 shrink-0 text-[#999] dark:text-dark-text-muted"
                                            strokeWidth={1.75}
                                        />
                                        <textarea
                                            id="bulk-notify-body-ar"
                                            value={bulkNotifyBodyAr}
                                            onChange={(e) => setBulkNotifyBodyAr(e.target.value)}
                                            placeholder={t('providers.bulkNotifyModal.notificationBodyPlaceholder')}
                                            rows={3}
                                            className="min-h-[69px] min-w-0 flex-1 resize-y bg-transparent text-start text-[14px] text-[#333] placeholder:text-[#999] outline-none focus:outline-none dark:text-dark-text-primary dark:placeholder-dark-text-muted"
                                            dir="rtl"
                                        />
                                    </div>
                                </div>
                            </div>
                                <div
                                    className="h-px w-full bg-khabeer-stroke/80 dark:bg-dark-border"
                                    role="separator"
                                />
                                <div
                                    className="w-full min-w-0 space-y-4"
                                    dir={isRTL ? 'rtl' : 'ltr'}
                                    lang="en"
                                >
                                    <div className="flex w-full min-w-0 flex-col gap-2">
                                    <label
                                        htmlFor="bulk-notify-title-en"
                                        className="w-full text-start text-[16px] text-[#333] dark:text-dark-text-primary"
                                    >
                                        {t('providers.bulkNotifyModal.notificationTitleEn')}
                                    </label>
                                    <div
                                        className="flex h-12 w-full min-w-0 flex-row items-center gap-2 rounded-xl border border-[#e2e2e2] bg-white px-4 py-2 dark:border-dark-border dark:bg-dark-bg-tertiary"
                                    >
                                        <MessageSquare
                                            className="size-5 shrink-0 text-[#999] dark:text-dark-text-muted"
                                            strokeWidth={1.75}
                                        />
                                        <input
                                            id="bulk-notify-title-en"
                                            type="text"
                                            value={bulkNotifyTitleEn}
                                            onChange={(e) => setBulkNotifyTitleEn(e.target.value)}
                                            placeholder={t('providers.bulkNotifyModal.notificationTitlePlaceholderEn')}
                                            className="min-w-0 flex-1 bg-transparent text-start text-[14px] text-[#333] placeholder:text-[#999] outline-none focus:outline-none dark:text-dark-text-primary dark:placeholder-dark-text-muted"
                                            dir="ltr"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                                <div className="flex w-full min-w-0 flex-col gap-2">
                                    <label
                                        htmlFor="bulk-notify-body-en"
                                        className="w-full text-start text-[16px] text-[#333] dark:text-dark-text-primary"
                                    >
                                        {t('providers.bulkNotifyModal.notificationBodyEn')}
                                    </label>
                                    <div
                                        className="flex min-h-[85px] w-full min-w-0 flex-row items-start gap-2 rounded-xl border border-[#e2e2e2] bg-white px-4 py-2 dark:border-dark-border dark:bg-dark-bg-tertiary"
                                    >
                                        <MessageSquare
                                            className="mt-0.5 size-5 shrink-0 text-[#999] dark:text-dark-text-muted"
                                            strokeWidth={1.75}
                                        />
                                        <textarea
                                            id="bulk-notify-body-en"
                                            value={bulkNotifyBodyEn}
                                            onChange={(e) => setBulkNotifyBodyEn(e.target.value)}
                                            placeholder={t('providers.bulkNotifyModal.notificationBodyPlaceholderEn')}
                                            rows={3}
                                            className="min-h-[69px] min-w-0 flex-1 resize-y bg-transparent text-start text-[14px] text-[#333] placeholder:text-[#999] outline-none focus:outline-none dark:text-dark-text-primary dark:placeholder-dark-text-muted"
                                            dir="ltr"
                                        />
                                    </div>
                                </div>
                                </div>
                            </div>
                            <div
                                className="mt-1 flex w-full min-h-[3.5rem] flex-row gap-3"
                                dir={isRTL ? 'rtl' : 'ltr'}
                            >
                                {isRTL ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={submitBulkNotify}
                                            disabled={bulkNotifySending}
                                            className="inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl border border-transparent bg-[#0077b6] px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-[#0077b6]/25 transition-[transform,background-color,opacity] hover:bg-[#006298] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-transparent dark:bg-dark-accent-blue dark:shadow-black/20 dark:hover:opacity-95"
                                        >
                                            {bulkNotifySending ? (
                                                <Loader2 className="size-6 shrink-0 animate-spin" />
                                            ) : (
                                                <Send className="size-6 shrink-0" strokeWidth={2.25} />
                                            )}
                                            {t('providers.bulkNotifyModal.send')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={closeBulkNotifyModal}
                                            disabled={bulkNotifySending}
                                            className="inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl border border-khabeer-stroke/60 bg-[#f1f3ff] px-5 py-3.5 text-base font-semibold text-[#4a4a4a] transition-[transform,background-color,opacity] hover:bg-[#e4e9fc] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-bg-secondary"
                                        >
                                            <ChevronDown className="size-6 shrink-0 rotate-180" strokeWidth={2.25} />
                                            {t('providers.bulkNotifyModal.cancel')}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={closeBulkNotifyModal}
                                            disabled={bulkNotifySending}
                                            className="inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl border border-khabeer-stroke/60 bg-[#f1f3ff] px-5 py-3.5 text-base font-semibold text-[#4a4a4a] transition-[transform,background-color,opacity] hover:bg-[#e4e9fc] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-secondary dark:hover:bg-dark-bg-secondary"
                                        >
                                            <ChevronDown className="size-6 shrink-0 rotate-180" strokeWidth={2.25} />
                                            {t('providers.bulkNotifyModal.cancel')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={submitBulkNotify}
                                            disabled={bulkNotifySending}
                                            className="inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl border border-transparent bg-[#0077b6] px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-[#0077b6]/25 transition-[transform,background-color,opacity] hover:bg-[#006298] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-transparent dark:bg-dark-accent-blue dark:shadow-black/20 dark:hover:opacity-95"
                                        >
                                            {bulkNotifySending ? (
                                                <Loader2 className="size-6 shrink-0 animate-spin" />
                                            ) : (
                                                <Send className="size-6 shrink-0" strokeWidth={2.25} />
                                            )}
                                            {t('providers.bulkNotifyModal.send')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-[32px] font-bold leading-tight text-[#333] dark:text-dark-text-primary">
                        {t('providers.pageTitle')}
                    </h1>
                    <p className="mt-2 text-[16px] text-[#666] dark:text-dark-text-secondary">
                        {t('providers.pageSubtitle')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setBulkNotifyOpen(true)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-khabeer-brand px-5 py-3 text-[16px] font-medium text-white shadow-sm transition-opacity hover:opacity-95 dark:bg-dark-accent-blue"
                >
                    <Send className="size-5 shrink-0" strokeWidth={2} />
                    {t('providers.sendBulkNotification')}
                </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className="flex w-full items-center gap-3.5 rounded-full border border-transparent bg-white px-3.5 py-2 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none"
                >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f1f3ff] dark:bg-dark-bg-elevated">
                        <UserRound className="size-6 text-khabeer-brand dark:text-dark-accent-blue" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1 text-start" dir="auto">
                        <p className="text-[14px] text-[#999] dark:text-dark-text-muted">{t('providers.statTotal')}</p>
                        <p className="text-[18px] font-bold text-[#333] dark:text-dark-text-primary">
                            {stats.total} {t('providers.statTotalSuffix')}
                        </p>
                    </div>
                </div>
                <div
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className="flex w-full items-center gap-3.5 rounded-full border border-transparent bg-white px-3.5 py-2 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none"
                >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#fffaeb] dark:bg-dark-bg-elevated">
                        <Hourglass className="size-6 text-[#B54708]" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1 text-start" dir="auto">
                        <p className="text-[14px] text-[#999] dark:text-dark-text-muted">{t('providers.statPending')}</p>
                        <p className="text-[18px] font-bold text-[#333] dark:text-dark-text-primary">
                            {stats.pending} {t('providers.statPendingSuffix')}
                        </p>
                    </div>
                </div>
                <div
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className="flex w-full items-center gap-3.5 rounded-full border border-transparent bg-white px-3.5 py-2 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none"
                >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f1f3ff] dark:bg-dark-bg-elevated">
                        <UserCheck className="size-6 text-khabeer-brand dark:text-dark-accent-blue" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1 text-start" dir="auto">
                        <p className="text-[14px] text-[#999] dark:text-dark-text-muted">{t('providers.statActive')}</p>
                        <p className="text-[18px] font-bold text-[#333] dark:text-dark-text-primary">
                            {stats.active} {t('providers.statActiveSuffix')}
                        </p>
                    </div>
                </div>
                <div
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className="flex w-full items-center gap-3.5 rounded-full border border-transparent bg-white px-3.5 py-2 shadow-sm dark:bg-dark-bg-secondary dark:shadow-none"
                >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#faf3ef] dark:bg-dark-bg-elevated">
                        <UserX className="size-6 text-[#B42318]" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1 text-start" dir="auto">
                        <p className="text-[14px] text-[#999] dark:text-dark-text-muted">{t('providers.statDisabled')}</p>
                        <p className="text-[18px] font-bold text-[#333] dark:text-dark-text-primary">
                            {stats.disabled} {t('providers.statDisabledSuffix')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="overflow-visible rounded-2xl border border-khabeer-stroke/80 bg-white shadow-[0_1px_2px_0_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
                <div className="border-b border-khabeer-stroke/70 bg-[#f6f7f9] px-4 py-3 dark:border-dark-border dark:bg-dark-bg-primary/60 lg:px-5">
                    <div
                        className="inline-flex w-full max-w-md rounded-xl border border-khabeer-stroke bg-white p-1 shadow-sm dark:border-dark-border dark:bg-dark-bg-tertiary sm:w-auto"
                        role="group"
                        aria-label={t('providers.listScopeAria')}
                    >
                        <button
                            type="button"
                            onClick={() => setListScopeAndReset('everyone')}
                            className={clsx(
                                'flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors sm:flex-initial sm:px-4',
                                listScope === 'everyone'
                                    ? 'bg-khabeer-brand text-white shadow-sm dark:bg-dark-accent-blue'
                                    : 'text-[#555] hover:bg-gray-50 dark:text-dark-text-secondary dark:hover:bg-dark-bg-elevated'
                            )}
                        >
                            <Users className="size-4 shrink-0 opacity-90" strokeWidth={2} />
                            {t('providers.listScopeEveryone')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setListScopeAndReset('mine')}
                            className={clsx(
                                'flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors sm:flex-initial sm:px-4',
                                listScope === 'mine'
                                    ? 'bg-khabeer-brand text-white shadow-sm dark:bg-dark-accent-blue'
                                    : 'text-[#555] hover:bg-gray-50 dark:text-dark-text-secondary dark:hover:bg-dark-bg-elevated'
                            )}
                        >
                            <UserRound className="size-4 shrink-0 opacity-90" strokeWidth={2} />
                            {t('providers.listScopeMine')}
                        </button>
                    </div>
                </div>
                {/* items-start: لا نسطّح أعمدة الفلترة لارتفاع البحث (كان يسبب فراغاً أسفل قائمة الحالة ويحرّكها تحت حقل آخر) */}
                <div className="relative z-20 flex flex-wrap items-start gap-3 border-b border-khabeer-stroke/60 p-4 dark:border-dark-border lg:gap-4 lg:p-5">
                    <div className="w-[150px] min-w-[130px] max-w-[170px] shrink-0">
                        <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                            {t('providers.filterJoinDate')}
                        </label>
                        <div className="relative">
                            <select
                                value={joinPreset}
                                onChange={(e) => {
                                    setPage(1);
                                    setJoinPreset(e.target.value);
                                }}
                                className="w-full appearance-none rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                            >
                                {joinPresets.map((o) => (
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
                            {t('providers.filterSpecialty')}
                        </label>
                        <div className="relative">
                            <select
                                value={specialtyFilter}
                                onChange={(e) => setSpecialtyFilter(e.target.value)}
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
                    {listScope === 'everyone' ? (
                        <div className="min-w-[140px] max-w-[160px] shrink-0 flex-none" data-providers-status-menu>
                            <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                                {t('providers.filterRequestStatus')}
                            </label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setStatusMenuOpen((v) => !v)}
                                    className={clsx(
                                        'flex w-full items-center justify-between gap-2 rounded-xl border bg-white py-2.5 px-3 text-start text-[14px] text-[#333] transition-colors dark:bg-dark-bg-tertiary dark:text-dark-text-primary',
                                        statusMenuOpen
                                            ? 'border-khabeer-brand ring-1 ring-khabeer-brand/30 dark:border-dark-accent-blue'
                                            : 'border-khabeer-stroke dark:border-dark-border'
                                    )}
                                >
                                    <span className="min-w-0 truncate">
                                        {statusOptions.find((o) => o.key === currentRequestStatusKey)?.label}
                                    </span>
                                    <ChevronDown className="size-4 shrink-0 text-khabeer-muted" strokeWidth={1.5} />
                                </button>
                                {statusMenuOpen && (
                                    <div
                                        className="absolute start-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-xl border border-khabeer-stroke bg-white py-0.5 shadow-[0_0_35px_rgba(0,0,0,0.04)] dark:border-dark-border dark:bg-dark-bg-elevated"
                                        role="listbox"
                                    >
                                        {statusOptions.map((o) => (
                                            <button
                                                key={o.key}
                                                type="button"
                                                role="option"
                                                onClick={() => navigateForStatusKey(o.key)}
                                                className={clsx(
                                                    'flex w-full px-4 py-2 text-[14px] leading-snug transition-colors hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary',
                                                    o.key === currentRequestStatusKey
                                                        ? 'font-medium text-khabeer-brand dark:text-dark-accent-blue'
                                                        : 'text-[#333] dark:text-dark-text-primary'
                                                )}
                                            >
                                                {o.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="min-w-[140px] max-w-[160px] shrink-0 flex-none">
                            <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                                {t('providers.filterRequestStatus')}
                            </label>
                            <div className="relative">
                                <select
                                    value={myReviewFilter}
                                    onChange={(e) => {
                                        setPage(1);
                                        setMyReviewFilter(e.target.value);
                                    }}
                                    className="w-full appearance-none rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                                >
                                    {myReviewFilterOptions.map((o) => (
                                        <option key={o.key} value={o.key}>
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
                    )}
                    <div className="min-w-[140px] max-w-[160px] shrink-0 flex-none">
                        <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                            {t('providers.filterAccountStatus')}
                        </label>
                        <div className="relative">
                            <select
                                value={accountStatusFilter}
                                onChange={(e) => {
                                    setPage(1);
                                    setAccountStatusFilter(e.target.value);
                                }}
                                className="w-full appearance-none rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                            >
                                <option value="all">{t('providers.filterAll')}</option>
                                <option value="active">{t('providers.accountFilterActive')}</option>
                                <option value="inactive">{t('providers.accountFilterInactive')}</option>
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
                            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-khabeer-muted" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={isRTL ? 'بحث...' : `${t('common.search')}...`}
                                className="w-full rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-[14px] text-[#333] outline-none placeholder:text-[#999] focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                            />
                        </div>
                    </div>
                </div>

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
                    <div className="p-10 text-center text-khabeer-muted dark:text-dark-text-muted">{t('providers.noProviders')}</div>
                ) : (
                    <>
                        <div className="overflow-x-auto rounded-b-2xl">
                            <table className="w-full min-w-[960px] border-collapse" dir={isRTL ? 'rtl' : 'ltr'}>
                                <thead>
                                    <tr className="bg-[#f8f8f8] text-[14px] font-bold text-[#333] dark:bg-dark-bg-tertiary dark:text-dark-text-primary">
                                        <th className="px-3 py-3 text-start">{t('providers.table.expert')}</th>
                                        <th className="px-3 py-3 text-center">{t('providers.table.mobile')}</th>
                                        <th className="px-3 py-3 text-center">{t('providers.table.specialty')}</th>
                                        <th className="px-3 py-3 text-center">{t('providers.table.joinDate')}</th>
                                        <th className="px-3 py-3 text-center">{t('providers.table.requestStatus')}</th>
                                        <th className="px-3 py-3 text-center">{t('providers.table.status')}</th>
                                        <th className="px-3 py-3 text-center">{t('providers.table.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedRows.map((row, idx) => {
                                        const rid = row.applicationId || row.id;
                                        const open = openRowMenuId === rid;
                                        return (
                                            <tr
                                                key={rid}
                                                className={clsx(
                                                    'cursor-pointer border-b border-khabeer-stroke/50 text-[14px] transition-colors hover:bg-gray-50/80 dark:border-dark-border dark:hover:bg-dark-bg-tertiary/80',
                                                    idx % 2 === 1 && 'bg-[#fafafa]/80 dark:bg-dark-bg-primary/50'
                                                )}
                                                onClick={() => openDetails(row)}
                                            >
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-khabeer-stroke/50 bg-[#0077b6]/10 dark:border-dark-border">
                                                            <AvatarOrInitial
                                                                name={row.displayName || `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email}
                                                                avatarUrl={row.avatarUrl}
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-[#333] dark:text-dark-text-primary">
                                                                {row.displayName || `${row.first_name} ${row.last_name}`.trim()}
                                                            </p>
                                                            <p className="truncate text-[12px] text-[#999] dark:text-dark-text-muted">{row.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-center text-[#333] dark:text-dark-text-primary" dir="ltr">
                                                    {row.phone || '—'}
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className="inline-block rounded-full bg-[#f0f0f0] px-3 py-1 text-[12px] text-[#333] dark:bg-dark-bg-tertiary dark:text-dark-text-primary">
                                                        {row.specialtyLabel}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-center text-khabeer-muted dark:text-dark-text-secondary">
                                                    {row.createdAt
                                                        ? new Date(row.createdAt).toLocaleDateString(
                                                              language === 'ar' ? 'ar-EG' : 'en-US',
                                                              { day: 'numeric', month: 'long', year: 'numeric' }
                                                          )
                                                        : '—'}
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span
                                                        className={clsx(
                                                            'inline-flex rounded-full px-3 py-1 text-[12px] font-bold',
                                                            requestStatusBadgeClass(row)
                                                        )}
                                                    >
                                                        {requestStatusLabel(row)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span
                                                        className={clsx(
                                                            'inline-flex rounded-full px-3 py-1 text-[12px] font-bold',
                                                            accountStatusBadgeClass(row)
                                                        )}
                                                    >
                                                        {accountStatusLabel(row)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <div className="relative inline-flex">
                                                        <button
                                                            type="button"
                                                            data-providers-row-trigger
                                                            className="flex size-9 items-center justify-center rounded-lg text-khabeer-muted hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                                                            aria-label={t('providers.table.actions')}
                                                            aria-expanded={open}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (open) {
                                                                    closeRowActionMenu();
                                                                } else {
                                                                    rowMenuTriggerRef.current = e.currentTarget;
                                                                    setOpenRowMenuId(rid);
                                                                    setRowMenuAnchorRect(e.currentTarget.getBoundingClientRect());
                                                                }
                                                            }}
                                                        >
                                                            <MoreHorizontal className="size-5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {portalMenuRow && rowMenuAnchorRect && (
                            <ProvidersRowActionsMenuPortal
                                anchorRect={rowMenuAnchorRect}
                                isRTL={isRTL}
                                row={portalMenuRow}
                                t={t}
                                onClose={closeRowActionMenu}
                                openDetails={openDetails}
                                setDisableModalRow={setDisableModalRow}
                                setReactivateModalRow={setReactivateModalRow}
                            />
                        )}
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
                    </>
                )}
            </div>
        </div>
    );
};

export default Providers;
