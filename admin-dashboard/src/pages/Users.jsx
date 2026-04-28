import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCache } from '../context/CacheContext';
import { useToast } from '../context/ToastContext';
import api from '../api/apiConfig';
import { postBroadcastNotification } from '../api/notificationsApi';
import {
    fetchDashboardCustomers,
    fetchDashboardCustomerDetails,
    parseDashboardCustomersResponse,
    unwrapDashboardEnvelope,
} from '../api/dashboardApi';
import AvatarOrInitial from '../components/AvatarOrInitial';
import {
    AlertCircle,
    Bell,
    Calendar,
    ChevronDown,
    MessageSquare,
    Eye,
    Loader2,
    MoreHorizontal,
    Search,
    Send,
    UserCheck,
    UserX,
} from 'lucide-react';
import clsx from 'clsx';
import {
    deriveIsActiveFromClientDetail,
    errorIndicatesAlreadyActive,
    errorIndicatesAlreadyInactive,
    gatherDashboardUserActivateIdentifiers,
    getApiErrorMessage,
    isProviderAccountInactive,
    patchManageUserActive,
    resolveManageUserIdFromRow,
} from '../utils/providerUserManagement';

const PAGE_SIZE = 20;

/** joinPeriod لـ GET /manage/dashboard/customers */
function joinPeriodFromPreset(preset) {
    if (!preset || preset === 'all') return 'all';
    if (preset === 'today') return 'day';
    if (['day', 'week', 'month', 'year'].includes(preset)) return preset;
    return 'all';
}

function accountStatusForCustomersApi(filterKey) {
    if (filterKey === 'all') return 'all';
    if (filterKey === 'active') return 'active';
    if (filterKey === 'disabled') return 'inactive';
    return 'all';
}

function mapDashboardCustomer(item) {
    const row = item && typeof item === 'object' ? item : {};
    const u = row.user && typeof row.user === 'object' ? row.user : {};
    const pi = row.personalInfo && typeof row.personalInfo === 'object' ? row.personalInfo : {};
    const displayName = String(row.displayName || row.fullName || pi.displayName || u.displayName || '').trim();
    const parts = displayName.split(/\s+/).filter(Boolean);
    const firebaseUid = row.firebaseUid ?? u.firebaseUid ?? pi.firebaseUid ?? row.manageUserId ?? null;
    const email = row.email ?? u.email ?? pi.email ?? '';
    const phone = row.phone ?? row.phoneNumber ?? u.phoneNumber ?? u.phone ?? pi.phoneNumber ?? '';
    const createdAt = row.createdAt ?? u.createdAt ?? pi.createdAt ?? row.joinedAt ?? null;
    const isActive = row.isActive !== false && row.isActive !== 'false';
    const id = row.userId ?? row.id ?? u.id ?? firebaseUid ?? '';

    return {
        id,
        firebaseUid,
        manageUserId: firebaseUid,
        first_name: parts[0] || row.first_name || pi.first_name || u.first_name || '',
        last_name: parts.slice(1).join(' ') || row.last_name || pi.last_name || u.last_name || '',
        displayName: displayName || email || '—',
        email,
        phone,
        phoneNumber: phone,
        avatarUrl: row.avatarUrl ?? u.avatarUrl ?? pi.avatarUrl,
        createdAt,
        isActive,
        ordersCount: row.ordersCount ?? row.requestsCount ?? row.totalOrders ?? 0,
    };
}

/** نفس منطق تموضع قائمة الخبراء — خارج جدول الـ overflow حتى ما تنقص. */
function ClientsRowActionsMenuPortal({
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
            data-users-row-menu
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

const Users = () => {
    const { token } = useAuth();
    const { t, language } = useLanguage();
    const { invalidate } = useCache();
    const toast = useToast();
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [joinPreset, setJoinPreset] = useState('all');
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [filterStatusKey, setFilterStatusKey] = useState('all');

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
    const [listMeta, setListMeta] = useState({
        total: 0,
        totalPages: 1,
        count: 0,
        limit: PAGE_SIZE,
    });
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

    /** مثل الخبراء: جلب تفاصيل كاملة من الـ dashboard قبل التعطيل/التفعيل لضبط المعرّفات. */
    const fetchClientDetailPayload = async (row) => {
        const uid = row.firebaseUid || row.manageUserId || resolveManageUserIdFromRow(row);
        if (!uid) return null;
        try {
            const res = await fetchDashboardCustomerDetails(token, uid, { lang: language });
            return unwrapDashboardEnvelope(res);
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    const syncRowIsActive = (targetRow, active) => {
        const tid = resolveManageUserIdFromRow(targetRow);
        setRows((prev) =>
            prev.map((r) => (resolveManageUserIdFromRow(r) === tid ? { ...r, isActive: active } : r))
        );
    };

    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
        return () => clearTimeout(id);
    }, [searchQuery]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, joinPreset, filterStatusKey]);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!token) return;
            setLoading(true);
            setError(null);
            try {
                const res = await fetchDashboardCustomers(token, {
                    lang: language,
                    page,
                    limit: PAGE_SIZE,
                    joinPeriod: joinPeriodFromPreset(joinPreset),
                    accountStatus: accountStatusForCustomersApi(filterStatusKey),
                    search: debouncedSearch || undefined,
                });
                const { data, meta } = parseDashboardCustomersResponse(res);
                if (cancelled) return;
                const list = Array.isArray(data) ? data : [];
                setRows(list.map((item) => mapDashboardCustomer(item)));
                setListMeta({
                    total: meta.total ?? list.length,
                    totalPages: Math.max(1, meta.totalPages ?? 1),
                    count: meta.count ?? list.length,
                    limit: meta.limit ?? PAGE_SIZE,
                });
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setError(getApiErrorMessage(e) || t('common.error'));
                    setRows([]);
                    setListMeta({ total: 0, totalPages: 1, count: 0, limit: PAGE_SIZE });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [token, language, page, debouncedSearch, joinPreset, filterStatusKey, listRefresh, t]);

    useEffect(() => {
        const close = (e) => {
            const el = e.target;
            if (el.closest?.('[data-users-status-menu]')) return;
            if (el.closest?.('[data-users-row-menu]')) return;
            if (el.closest?.('[data-users-row-trigger]')) return;
            if (el.closest?.('[data-users-disable-modal]')) return;
            if (el.closest?.('[data-users-reactivate-modal]')) return;
            if (el.closest?.('[data-users-bulk-notify-modal]')) return;
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

    const statusOptions = useMemo(
        () => [
            { key: 'all', label: t('providers.filterAll') },
            { key: 'active', label: t('users.statusBadge.active') },
            { key: 'disabled', label: t('users.statusBadge.disabled') },
        ],
        [t]
    );

    const pageCount = Math.max(1, listMeta.totalPages || 1);
    const pageSafe = Math.min(page, pageCount);
    const pagedRows = rows;

    useEffect(() => {
        const tp = listMeta.totalPages || 1;
        if (page > tp) setPage(tp);
    }, [listMeta.totalPages, page]);

    const portalMenuRow = useMemo(() => {
        if (openRowMenuId == null) return null;
        return pagedRows.find((r) => resolveManageUserIdFromRow(r) === openRowMenuId) ?? null;
    }, [openRowMenuId, pagedRows]);

    useEffect(() => {
        if (!openRowMenuId) return;
        if (!pagedRows.some((r) => resolveManageUserIdFromRow(r) === openRowMenuId)) {
            closeRowActionMenu();
        }
    }, [pagedRows, openRowMenuId, closeRowActionMenu]);

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

    const rowKey = (r) => resolveManageUserIdFromRow(r) || `row-${r.id}`;

    const openDetails = (row) => {
        const uid = row.firebaseUid || row.manageUserId || resolveManageUserIdFromRow(row);
        if (!uid) return;
        navigate(`/dashboard/client/${encodeURIComponent(uid)}`, { state: { client: row } });
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
                audience: 'clients',
                titleAr,
                bodyAr,
                titleEn,
                bodyEn,
            });
            toast.success(t('providers.bulkNotifyModal.sentSuccess'));
            closeBulkNotifyModal();
        } catch (err) {
            toast.error(getApiErrorMessage(err) || t('common.error'));
        } finally {
            setBulkNotifySending(false);
        }
    };

    const confirmDisableAccount = async () => {
        const row = disableModalRow;
        setDisableLoading(true);
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const detailPayload = await fetchClientDetailPayload(row);
            const detailActive = deriveIsActiveFromClientDetail(detailPayload);
            if (detailActive === false) {
                syncRowIsActive(row, false);
                toast.info(t('providers.messages.accountAlreadyInactive'));
                invalidate('users_seekers');
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
            invalidate('users_seekers');
            setListRefresh((n) => n + 1);
            syncRowIsActive(row, false);
            setDisableModalRow(null);
        } catch (err) {
            console.error(err);
            if (errorIndicatesAlreadyInactive(err)) {
                syncRowIsActive(row, false);
                invalidate('users_seekers');
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
            const detailPayload = await fetchClientDetailPayload(row);
            const detailActive = deriveIsActiveFromClientDetail(detailPayload);
            if (detailActive === true) {
                syncRowIsActive(row, true);
                toast.info(t('providers.messages.accountAlreadyActive'));
                invalidate('users_seekers');
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
            invalidate('users_seekers');
            setListRefresh((n) => n + 1);
            syncRowIsActive(row, true);
            setReactivateModalRow(null);
        } catch (err) {
            console.error(err);
            if (errorIndicatesAlreadyActive(err)) {
                syncRowIsActive(row, true);
                invalidate('users_seekers');
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

    const statusBadgeClass = (isActive) =>
        isActive
            ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white'
            : 'bg-amber-500 text-white dark:bg-amber-600 dark:text-white';

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
                        aria-labelledby="users-disable-account-title"
                        data-users-disable-modal
                        className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-xl dark:bg-dark-bg-elevated dark:ring-1 dark:ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
                            <h2
                                id="users-disable-account-title"
                                className="text-center text-lg font-bold leading-normal text-[#333] dark:text-dark-text-primary"
                            >
                                {t('providers.disableModal.title')}
                            </h2>
                            <div className={clsx('flex h-12 w-full gap-2.5', isRTL && 'flex-row-reverse')}>
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
                        aria-labelledby="users-reactivate-account-title"
                        data-users-reactivate-modal
                        className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-xl dark:bg-dark-bg-elevated dark:ring-1 dark:ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
                            <h2
                                id="users-reactivate-account-title"
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
                        data-users-bulk-notify-modal
                        dir={isRTL ? 'rtl' : 'ltr'}
                        className="w-full max-w-lg max-h-[min(90vh,40rem)] overflow-y-auto rounded-2xl border border-khabeer-stroke bg-white p-6 shadow-xl dark:border-dark-border dark:bg-dark-bg-elevated"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex w-full flex-col items-center gap-2">
                        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#f7f7f7] dark:bg-dark-bg-tertiary">
                            <Bell className="size-10 text-[#333] dark:text-dark-text-primary" strokeWidth={1.75} />
                        </div>
                        <h2 className="text-center text-lg font-bold text-[#333] dark:text-dark-text-primary">
                            {t('providers.bulkNotifyModal.title')}
                        </h2>
                        </div>
                        <div className="mt-1 flex w-full min-w-0 flex-col gap-4">
                        <div
                            className="w-full min-w-0 space-y-3"
                            dir={isRTL ? 'rtl' : 'ltr'}
                            lang="ar"
                        >
                        <div>
                        <label
                            className="mb-1 block w-full text-start text-sm font-medium text-[#333] dark:text-dark-text-primary"
                        >
                            {t('providers.bulkNotifyModal.notificationTitleAr')}
                        </label>
                        <div className="flex h-10 w-full min-w-0 flex-row items-center gap-2 rounded-xl border border-khabeer-stroke bg-white px-3 dark:border-dark-border dark:bg-dark-bg-tertiary">
                            <MessageSquare className="size-4 shrink-0 text-khabeer-muted" strokeWidth={1.75} />
                            <input
                                value={bulkNotifyTitleAr}
                                onChange={(e) => setBulkNotifyTitleAr(e.target.value)}
                                placeholder={t('providers.bulkNotifyModal.notificationTitlePlaceholder')}
                                dir="rtl"
                                className="min-w-0 flex-1 border-0 bg-transparent text-start text-sm text-[#333] outline-none dark:text-dark-text-primary"
                            />
                        </div>
                        </div>
                        <div>
                        <label
                            className="mb-1 block w-full text-start text-sm font-medium text-[#333] dark:text-dark-text-primary"
                        >
                            {t('providers.bulkNotifyModal.notificationBodyAr')}
                        </label>
                        <textarea
                            value={bulkNotifyBodyAr}
                            onChange={(e) => setBulkNotifyBodyAr(e.target.value)}
                            rows={3}
                            placeholder={t('providers.bulkNotifyModal.notificationBodyPlaceholder')}
                            dir="rtl"
                            className="w-full rounded-xl border border-khabeer-stroke px-3 py-2 text-start text-sm dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                        />
                        </div>
                        </div>
                        <div
                            className="h-px w-full bg-khabeer-stroke/80 dark:bg-dark-border"
                            role="separator"
                        />
                        <div
                            className="w-full min-w-0 space-y-3"
                            dir={isRTL ? 'rtl' : 'ltr'}
                            lang="en"
                        >
                        <div>
                        <label
                            className="mb-1 block w-full text-start text-sm font-medium text-[#333] dark:text-dark-text-primary"
                        >
                            {t('providers.bulkNotifyModal.notificationTitleEn')}
                        </label>
                        <div className="flex h-10 w-full min-w-0 flex-row items-center gap-2 rounded-xl border border-khabeer-stroke bg-white px-3 dark:border-dark-border dark:bg-dark-bg-tertiary">
                            <MessageSquare className="size-4 shrink-0 text-khabeer-muted" strokeWidth={1.75} />
                            <input
                                value={bulkNotifyTitleEn}
                                onChange={(e) => setBulkNotifyTitleEn(e.target.value)}
                                placeholder={t('providers.bulkNotifyModal.notificationTitlePlaceholderEn')}
                                dir="ltr"
                                className="min-w-0 flex-1 border-0 bg-transparent text-start text-sm text-[#333] outline-none dark:text-dark-text-primary"
                            />
                        </div>
                        </div>
                        <div>
                        <label
                            className="mb-1 block w-full text-start text-sm font-medium text-[#333] dark:text-dark-text-primary"
                        >
                            {t('providers.bulkNotifyModal.notificationBodyEn')}
                        </label>
                        <textarea
                            value={bulkNotifyBodyEn}
                            onChange={(e) => setBulkNotifyBodyEn(e.target.value)}
                            rows={3}
                            placeholder={t('providers.bulkNotifyModal.notificationBodyPlaceholderEn')}
                            dir="ltr"
                            className="w-full rounded-xl border border-khabeer-stroke px-3 py-2 text-start text-sm dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                        />
                        </div>
                        </div>
                        </div>
                        <div
                            className="mt-5 flex min-h-[3.5rem] w-full gap-3"
                            dir={isRTL ? 'rtl' : 'ltr'}
                        >
                            {isRTL ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={submitBulkNotify}
                                        disabled={bulkNotifySending}
                                        className="inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl border border-transparent bg-khabeer-brand px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-[#0077b6]/25 transition-[transform,background-color,opacity] hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-transparent dark:bg-dark-accent-blue dark:shadow-black/25 dark:hover:opacity-95"
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
                                        className="inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl border border-transparent bg-khabeer-brand px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-[#0077b6]/25 transition-[transform,background-color,opacity] hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:border-transparent dark:bg-dark-accent-blue dark:shadow-black/25 dark:hover:opacity-95"
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
            )}

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-[32px] font-bold leading-tight text-[#333] dark:text-dark-text-primary">{t('users.clientsTitle')}</h1>
                    <p className="mt-2 text-[16px] text-[#666] dark:text-dark-text-secondary">{t('users.clientsSubtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setBulkNotifyOpen(true)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-khabeer-brand px-5 py-3 text-[16px] font-medium text-white shadow-sm transition-opacity hover:opacity-95 dark:bg-dark-accent-blue"
                >
                    <Send className="size-5 shrink-0" strokeWidth={2} />
                    {t('users.sendBulkNotification')}
                </button>
            </div>

            <div className="overflow-visible rounded-2xl border border-khabeer-stroke/80 bg-white shadow-[0_1px_2px_0_rgba(16,24,40,0.05)] dark:border-dark-border dark:bg-dark-bg-secondary">
                <div
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className="relative z-20 flex w-full flex-wrap items-start justify-start gap-3 border-b border-khabeer-stroke/60 p-4 dark:border-dark-border lg:gap-4 lg:p-5"
                >
                    <div className="w-[150px] min-w-[130px] max-w-[200px] shrink-0 sm:w-[170px]">
                        <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">
                            {t('providers.filterJoinDate')}
                        </label>
                        <div className="relative">
                            <select
                                value={joinPreset}
                                onChange={(e) => setJoinPreset(e.target.value)}
                                dir={isRTL ? 'rtl' : 'ltr'}
                                className="w-full appearance-none rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-3 pe-10 text-start text-[14px] text-[#333] outline-none focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                            >
                                {joinPresets.map((o) => (
                                    <option key={o.key} value={o.key} dir={isRTL ? 'rtl' : 'ltr'}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                            <Calendar
                                className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-khabeer-muted"
                                aria-hidden
                            />
                        </div>
                    </div>
                    <div className="min-w-[140px] max-w-[200px] shrink-0 sm:min-w-[160px]" data-users-status-menu>
                        <label className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary">{t('users.filterAccountStatus')}</label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setStatusMenuOpen((v) => !v)}
                                dir={isRTL ? 'rtl' : 'ltr'}
                                className={clsx(
                                    'flex w-full items-center justify-between gap-2 rounded-xl border bg-white py-2.5 px-3 text-start text-[14px] text-[#333] transition-colors dark:bg-dark-bg-tertiary dark:text-dark-text-primary',
                                    statusMenuOpen
                                        ? 'border-khabeer-brand ring-1 ring-khabeer-brand/30 dark:border-dark-accent-blue'
                                        : 'border-khabeer-stroke dark:border-dark-border'
                                )}
                            >
                                <span className="min-w-0 truncate">{statusOptions.find((o) => o.key === filterStatusKey)?.label}</span>
                                <ChevronDown className="size-4 shrink-0 text-khabeer-muted" strokeWidth={1.5} />
                            </button>
                            {statusMenuOpen && (
                                <div
                                    className="absolute start-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-xl border border-khabeer-stroke bg-white py-0.5 shadow-[0_0_35px_rgba(0,0,0,0.04)] dark:border-dark-border dark:bg-dark-bg-elevated"
                                    role="listbox"
                                    dir={isRTL ? 'rtl' : 'ltr'}
                                >
                                    {statusOptions.map((o) => (
                                        <button
                                            key={o.key}
                                            type="button"
                                            role="option"
                                            onClick={() => {
                                                setFilterStatusKey(o.key);
                                                setStatusMenuOpen(false);
                                                setPage(1);
                                            }}
                                            className={clsx(
                                                'flex w-full px-4 py-2 text-start text-[14px] leading-snug transition-colors hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary',
                                                o.key === filterStatusKey
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
                    <div className="min-w-[160px] w-full max-w-[260px] shrink-0 sm:min-w-[200px] sm:max-w-[min(100%,20rem)] sm:flex-1">
                        <label
                            className="mb-1.5 block text-[14px] font-bold text-[#333] dark:text-dark-text-primary"
                            htmlFor="users-clients-search"
                        >
                            {t('common.search')}
                        </label>
                        <div className="relative">
                            <Search
                                className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-khabeer-muted"
                                aria-hidden
                            />
                            <input
                                id="users-clients-search"
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                dir={isRTL ? 'rtl' : 'ltr'}
                                placeholder={isRTL ? '...بحث' : `${t('common.search')}...`}
                                className="w-full rounded-xl border border-khabeer-stroke bg-white py-2.5 ps-4 pe-11 text-start text-[14px] text-[#333] outline-none placeholder:text-[#999] focus:border-khabeer-brand dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
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
                    <div className="p-10 text-center text-khabeer-muted dark:text-dark-text-muted">{t('users.noClients')}</div>
                ) : (
                    <>
                        <div className="overflow-x-auto rounded-b-2xl">
                            <table className="w-full min-w-[640px] border-collapse" dir={isRTL ? 'rtl' : 'ltr'}>
                                <thead>
                                    <tr className="bg-[#f8f8f8] text-[14px] font-bold text-[#333] dark:bg-dark-bg-tertiary dark:text-dark-text-primary">
                                        <th className="px-3 py-3 text-center">{t('users.table.user')}</th>
                                        <th className="px-3 py-3 text-center">{t('users.table.mobile')}</th>
                                        <th className="px-3 py-3 text-center">{t('users.table.orders')}</th>
                                        <th className="px-3 py-3 text-center">{t('users.table.joinedDate')}</th>
                                        <th className="px-3 py-3 text-center">{t('users.table.accountStatus')}</th>
                                        <th className="px-3 py-3 text-center">{t('users.table.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedRows.map((row, idx) => {
                                        const rk = rowKey(row);
                                        const open = openRowMenuId === rk;
                                        const displayName = `${row.first_name || row.displayName || ''} ${row.last_name || ''}`.trim() || row.displayName || '—';
                                        const phone = row.phone || row.phoneNumber || row.mobile || '—';
                                        const orderCount = row.ordersCount ?? row.requestsCount ?? row.totalOrders ?? '—';
                                        const joinedDate = row.createdAt
                                            ? new Date(row.createdAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-GB', {
                                                  day: 'numeric',
                                                  month: 'long',
                                                  year: 'numeric',
                                              })
                                            : '—';
                                        const active = !isProviderAccountInactive(row);

                                        return (
                                            <tr
                                                key={rk}
                                                className={clsx(
                                                    'cursor-pointer border-b border-khabeer-stroke/50 text-[14px] transition-colors hover:bg-gray-50/80 dark:border-dark-border dark:hover:bg-dark-bg-tertiary/80',
                                                    idx % 2 === 1 && 'bg-[#fafafa]/80 dark:bg-dark-bg-primary/50'
                                                )}
                                                onClick={() => openDetails(row)}
                                            >
                                                <td className="px-3 py-3 text-start">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-khabeer-stroke/50 bg-[#0077b6]/10 dark:border-dark-border">
                                                            <AvatarOrInitial name={displayName} avatarUrl={row.avatarUrl} className="text-sm" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-[#333] dark:text-dark-text-primary">{displayName}</p>
                                                            {row.email ? (
                                                                <p className="truncate text-[12px] text-[#999] dark:text-dark-text-muted">{row.email}</p>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-center text-[#333] dark:text-dark-text-primary" dir="ltr">
                                                    {phone}
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[#f0f0f0] px-2 py-1 text-xs font-medium text-[#344054] dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
                                                        {orderCount}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-center text-khabeer-muted dark:text-dark-text-secondary">{joinedDate}</td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className={clsx('inline-flex rounded-full px-3 py-1 text-[12px] font-bold', statusBadgeClass(active))}>
                                                        {active ? t('users.statusBadge.active') : t('users.statusBadge.disabled')}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <div className="relative inline-flex">
                                                        <button
                                                            type="button"
                                                            data-users-row-trigger
                                                            className="flex size-9 items-center justify-center rounded-lg text-khabeer-muted hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                                                            aria-label={t('users.table.actions')}
                                                            aria-expanded={open}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (open) {
                                                                    closeRowActionMenu();
                                                                } else {
                                                                    rowMenuTriggerRef.current = e.currentTarget;
                                                                    setOpenRowMenuId(rk);
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
                            <ClientsRowActionsMenuPortal
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

export default Users;
