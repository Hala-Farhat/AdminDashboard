import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

import {
    Briefcase,
    ChevronsRight,
    Globe,
    Home,
    Loader2,
    Lock,
    LogOut,
    Menu,
    Palette,
    PanelRightClose,
    Search,
    User,
    UserRound,
    ChevronDown
} from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import AdminNotificationsBell from '../components/AdminNotificationsBell';
import clsx from 'clsx';
import AvatarOrInitial from '../components/AvatarOrInitial';
import { markNotificationRead, markNotificationReadByPushData } from '../api/notificationsApi';
import { runDashboardDataRefreshFromPushData } from '../lib/dashboardDataRefresh';
import khabeerMark from '../assets/Group.svg';
import iconNavHome from '../assets/images/icon/Home Icon Selected.svg';
import iconNavExperts from '../assets/images/icon/Manager.svg';
import iconNavClients from '../assets/images/icon/Home Icon Selected (1).svg';
import iconNavCategories from '../assets/images/icon/Home Icon Selected (2).svg';
import iconNavServices from '../assets/images/icon/Icon.svg';
import iconNavLocations from '../assets/images/icon/Home Icon Selected (3).svg';
import iconMenuCollapsedHover from '../assets/images/icon/Menu Icon.svg';

/** Grey #666 SVG stroke/fill → Figma active brand #0077b6 */
const NAV_ICON_ACTIVE_FILTER = 'invert(42%) sepia(93%) saturate(1400%) hue-rotate(163deg) brightness(0.95) contrast(101%)';

const DashboardLayout = () => {
    const { user, logout, token } = useAuth();
    const { language, t } = useLanguage();

    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    /** يمنع تكرار التنقّل/التعليم عند تلقي نفس الحمولة من window + navigator.serviceWorker */
    const swNavDedupeRef = useRef({ key: '', t: 0 });

    /** تنقّل من النقر على إشعار النظام + تعليم كمقروء (معرّف من FCM أو مطابقة type/orderId مع GET /notifications) */
    useEffect(() => {
        const refreshBell = () => {
            window.dispatchEvent(new CustomEvent('admin-notifications-refresh'));
        };
        const markLocalRead = (id) => {
            if (!id) return;
            window.dispatchEvent(new CustomEvent('admin-notification-mark-read', { detail: { id: String(id) } }));
        };
        const markReadIfNeeded = (notificationId, pushData) => {
            if (!token) return;
            const merged =
                pushData && typeof pushData === 'object' ? { ...pushData } : {};
            if (notificationId) merged.notificationId = String(notificationId);
            if (!Object.keys(merged).length) return;
            void markNotificationReadByPushData(token, merged)
                .then((markedId) => {
                    markLocalRead(markedId);
                    refreshBell();
                })
                .catch(() => {
                    refreshBell();
                });
        };
        const runNav = (path, notificationId, pushData) => {
            if (typeof path !== 'string' || !path.startsWith('/')) return;
            const key = `${path}\0${notificationId || ''}\0${pushData ? JSON.stringify(pushData) : ''}`;
            const now = Date.now();
            if (
                swNavDedupeRef.current.key === key &&
                now - swNavDedupeRef.current.t < 1500
            ) {
                return;
            }
            swNavDedupeRef.current = { key, t: now };
            navigate(path);
            markReadIfNeeded(notificationId, pushData);
        };
        const onCustom = (e) => runNav(e?.detail?.path, e?.detail?.notificationId, e?.detail?.pushData);
        const onSwPort = (e) => {
            if (e.data?.type !== 'khabeer-navigate' || typeof e.data.path !== 'string') return;
            runNav(e.data.path, e.data.notificationId, e.data.pushData);
        };
        /** بعض المتصفحات تُسلّم client.postMessage من الـ SW إلى window وليس إلى navigator.serviceWorker */
        const onWindowMessage = (e) => {
            if (e.origin && e.origin !== window.location.origin) return;
            if (e.data?.type === 'khabeer-dashboard-refresh') {
                runDashboardDataRefreshFromPushData(e.data?.pushData);
                return;
            }
            onSwPort(e);
        };
        window.addEventListener('khabeer-admin-navigate', onCustom);
        navigator.serviceWorker?.addEventListener('message', onSwPort);
        window.addEventListener('message', onWindowMessage);
        return () => {
            window.removeEventListener('khabeer-admin-navigate', onCustom);
            navigator.serviceWorker?.removeEventListener('message', onSwPort);
            window.removeEventListener('message', onWindowMessage);
        };
    }, [navigate, token]);

    /** فتح من إشعار الخلفية بدون تبويب: ?notificationReadId= أو ?notificationMatch= (JSON من الـ SW) */
    useEffect(() => {
        const id = searchParams.get('notificationReadId');
        const matchEnc = searchParams.get('notificationMatch');
        if (!token || (!id && !matchEnc)) return;

        const clearParams = () => {
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete('notificationReadId');
                    next.delete('notificationMatch');
                    return next;
                },
                { replace: true }
            );
        };
        const refreshBell = () => {
            window.dispatchEvent(new CustomEvent('admin-notifications-refresh'));
        };

        if (id) {
            void markNotificationRead(token, id)
                .then(() => {
                    window.dispatchEvent(
                        new CustomEvent('admin-notification-mark-read', { detail: { id: String(id) } })
                    );
                    clearParams();
                    refreshBell();
                })
                .catch(() => {
                    clearParams();
                    refreshBell();
                });
            return;
        }
        let pushData;
        try {
            pushData = JSON.parse(decodeURIComponent(matchEnc));
        } catch {
            clearParams();
            return;
        }
        if (!pushData || typeof pushData !== 'object') {
            clearParams();
            return;
        }
        void markNotificationReadByPushData(token, pushData)
            .then((markedId) => {
                if (markedId) {
                    window.dispatchEvent(
                        new CustomEvent('admin-notification-mark-read', { detail: { id: String(markedId) } })
                    );
                }
                clearParams();
                refreshBell();
            })
            .catch(() => {
                clearParams();
                refreshBell();
            });
    }, [searchParams, token, setSearchParams]);

    /** لغة الواجهة → Service Worker (إشعارات الخلفية تستخدم نفس الترجمة) */
    useEffect(() => {
        const msg = { type: 'khabeer-set-lang', lang: language === 'en' ? 'en' : 'ar' };
        const send = () => {
            const c = navigator.serviceWorker?.controller;
            if (c) c.postMessage(msg);
        };
        send();
        void navigator.serviceWorker?.ready?.then((reg) => reg.active?.postMessage(msg));
    }, [language]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [showExpandHint, setShowExpandHint] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [logoutSubmitting, setLogoutSubmitting] = useState(false);
    const [logoutError, setLogoutError] = useState('');
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileMenuWrapRef = useRef(null);

    const isHomeRoute = location.pathname === '/dashboard' || location.pathname === '/dashboard/';
    const headerSearch = isHomeRoute ? (searchParams.get('q') ?? '') : '';

    const setHeaderSearch = (value) => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                const v = typeof value === 'string' ? value : '';
                if (v) next.set('q', v);
                else next.delete('q');
                return next;
            },
            { replace: true }
        );
    };

    useEffect(() => {
        if (isHomeRoute) return;
        setSearchParams(
            (prev) => {
                if (!prev.has('q')) return prev;
                const next = new URLSearchParams(prev);
                next.delete('q');
                return next;
            },
            { replace: true }
        );
    }, [isHomeRoute, setSearchParams]);

    useEffect(() => {
        if (!profileMenuOpen) return;
        const onDoc = (e) => {
            if (profileMenuWrapRef.current && !profileMenuWrapRef.current.contains(e.target)) {
                setProfileMenuOpen(false);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setProfileMenuOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [profileMenuOpen]);

    const isRTL = language === 'ar';
    const isExpertsPath = location.pathname.includes('/dashboard/submitted')
        || location.pathname.includes('/dashboard/approved')
        || location.pathname.includes('/dashboard/rejected')
        || location.pathname.includes('/dashboard/under-review');
    const isJobsPath = location.pathname.includes('/dashboard/jobs');

    const navItems = useMemo(() => ([
        {
            id: 'home',
            to: '/dashboard',
            label: isRTL ? 'الرئيسية' : 'Home',
            iconSrc: iconNavHome,
            isActive: location.pathname === '/dashboard' || location.pathname === '/dashboard/'
        },
        {
            id: 'experts',
            to: '/dashboard/submitted?view=all',
            label: isRTL ? 'الخبراء' : 'Experts',
            iconSrc: iconNavExperts,
            isActive: isExpertsPath
        },
        {
            id: 'clients',
            to: '/dashboard/users',
            label: isRTL ? 'العملاء' : 'Clients',
            iconSrc: iconNavClients,
            isActive: location.pathname.includes('/dashboard/users')
        },
        {
            id: 'categories',
            to: '/dashboard/categories',
            label: isRTL ? 'المجالات' : 'Categories',
            iconSrc: iconNavCategories,
            isActive: location.pathname.includes('/dashboard/categories')
        },
        {
            id: 'services',
            to: '/dashboard/service-orders',
            label: isRTL ? 'طلبات الخدمة' : 'Service Requests',
            iconSrc: iconNavServices,
            isActive: location.pathname.includes('/dashboard/service-orders')
        },
        {
            id: 'jobs',
            to: '/dashboard/jobs',
            label: isRTL ? 'الوظائف' : 'Jobs',
            iconSrc: null,
            LucideIcon: Briefcase,
            isActive: isJobsPath
        },
        {
            id: 'locations',
            to: '/dashboard/locations',
            label: isRTL ? 'المناطق' : 'Locations',
            iconSrc: iconNavLocations,
            isActive: location.pathname.includes('/dashboard/locations')
        }
    ]), [isExpertsPath, isJobsPath, isRTL, location.pathname]);

    const breadcrumb = useMemo(() => {
        const p = location.pathname;
        if (p.includes('/dashboard/profile')) {
            return { icon: UserRound, parent: t('dashboard.breadcrumb.home'), current: t('dashboard.breadcrumb.profile') };
        }
        if (isExpertsPath) {
            return { icon: UserRound, parent: t('dashboard.breadcrumb.home'), current: t('dashboard.breadcrumb.experts') };
        }
        if (p.includes('/dashboard/client/')) {
            return { icon: UserRound, parent: t('dashboard.breadcrumb.home'), current: t('clientDetails.pageTitle') };
        }
        if (p.includes('/dashboard/users')) {
            return { icon: UserRound, parent: t('dashboard.breadcrumb.home'), current: t('dashboard.breadcrumb.clients') };
        }
        if (/^\/dashboard\/jobs\/[^/]+/.test(p)) {
            return {
                icon: null,
                parent: t('dashboard.breadcrumb.home'),
                current: t('jobRequestDetail.breadcrumb'),
            };
        }
        if (p === '/dashboard/jobs' || p === '/dashboard/jobs/') {
            return { icon: null, parent: t('dashboard.breadcrumb.home'), current: t('dashboard.breadcrumb.jobs') };
        }
        if (/^\/dashboard\/categories\/sub\/[^/]+\/services\/[^/]+\/experts\/?$/.test(p)) {
            return {
                icon: null,
                parent: t('dashboard.breadcrumb.home'),
                current: t('categories.serviceExpertsBreadcrumb')
            };
        }
        if (p.includes('/dashboard/categories')) {
            return { icon: null, parent: t('dashboard.breadcrumb.home'), current: t('dashboard.breadcrumb.categories') };
        }
        if (p.includes('/dashboard/locations')) {
            return { icon: null, parent: t('dashboard.breadcrumb.home'), current: t('dashboard.breadcrumb.locations') };
        }
        {
            if (/^\/dashboard\/service-orders\/[^/]+\/?$/.test(p)) {
                return {
                    icon: null,
                    parent: t('dashboard.breadcrumb.home'),
                    current: t('serviceOrdersPage.serviceOrderDetailBreadcrumb'),
                };
            }
        }
        if (p.includes('/dashboard/service-orders')) {
            return { icon: null, parent: t('dashboard.breadcrumb.home'), current: t('dashboard.breadcrumb.serviceOrders') };
        }
        if (p.includes('/dashboard/provider/')) {
            return { icon: UserRound, parent: t('dashboard.breadcrumb.home'), current: t('providerDetails.title') };
        }
        if (p === '/dashboard' || p === '/dashboard/') {
            return { icon: Home, parent: null, current: t('dashboard.breadcrumb.home') };
        }
        return { icon: Home, parent: t('dashboard.breadcrumb.home'), current: t('dashboard.title') };
    }, [isExpertsPath, location.pathname, t]);

    const handleLogoutClick = () => {
        setLogoutError('');
        setShowLogoutConfirm(true);
    };

    const confirmLogout = async () => {
        setLogoutError('');
        setLogoutSubmitting(true);
        try {
            await logout();
            setShowLogoutConfirm(false);
            navigate('/login');
        } catch (err) {
            console.error(err);
            setLogoutError(t('dashboard.logoutFcmFailed'));
        } finally {
            setLogoutSubmitting(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F5F5F5] transition-colors duration-300 dark:bg-dark-bg-primary">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl max-w-sm w-full p-6 transform transition-all border border-gray-100 dark:border-dark-border">
                        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
                            <LogOut className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                        <h3 className="text-lg font-bold text-center text-gray-900 dark:text-dark-text-primary mb-2">
                            {t('dashboard.logout')}
                        </h3>
                        <p className="text-center text-gray-500 dark:text-dark-text-secondary mb-6">
                            {t('common.areYouSure')}
                        </p>
                        {logoutError ? (
                            <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400" role="alert">
                                {logoutError}
                            </p>
                        ) : null}
                        <div className="flex justify-center gap-3">
                            <button
                                type="button"
                                disabled={logoutSubmitting}
                                onClick={() => {
                                    if (!logoutSubmitting) setShowLogoutConfirm(false);
                                }}
                                className="px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-dark-bg-elevated rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                disabled={logoutSubmitting}
                                onClick={confirmLogout}
                                className="inline-flex min-w-[7.5rem] items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-500/30 hover:shadow-red-500/40 transition-all disabled:cursor-not-allowed disabled:opacity-90"
                            >
                                {logoutSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                        <span>{t('common.confirm')}</span>
                                    </>
                                ) : (
                                    t('common.confirm')
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Figma 278:24325 Sidebar (104px مطوي) / 15:2808 موسّع — بدون شريط تمرير ظاهر على عمود الروابط */}
            <aside
                dir={isRTL ? 'rtl' : 'ltr'}
                className={clsx(
                    'fixed inset-y-0 z-50 box-border flex h-screen min-h-0 flex-col justify-between bg-white',
                    isSidebarCollapsed ? 'py-8' : 'py-10',
                    'border-solid border-khabeer-stroke transition-[width,transform] duration-300 ease-in-out dark:border-dark-border dark:bg-dark-bg-secondary',
                    'w-sidebar',
                    isSidebarCollapsed && 'lg:w-sidebar-collapsed',
                    'max-lg:shadow-xl',
                    isRTL ? 'right-0 border-l' : 'left-0 border-r',
                    isSidebarOpen ? 'translate-x-0' : (isRTL ? 'max-lg:translate-x-full' : 'max-lg:-translate-x-full'),
                    'lg:translate-x-0'
                )}
            >
                {/* 15:2808 expanded / 125:17963 collapsed */}
                <div
                    className={clsx(
                        'flex min-h-0 w-full flex-1 flex-col',
                        isSidebarCollapsed ? 'gap-6' : 'gap-10',
                        isSidebarCollapsed ? 'items-center' : 'items-stretch'
                    )}
                >
                    <div
                        className={clsx(
                            'flex w-full shrink-0 flex-col gap-4',
                            isSidebarCollapsed ? 'items-center' : 'items-stretch'
                        )}
                    >
                        <div
                            className={clsx(
                                'flex w-full items-center',
                                isSidebarCollapsed ? 'max-w-[104px] justify-center px-0' : 'justify-between px-10'
                            )}
                        >
                            {!isSidebarCollapsed && (
                                <div
                                    className="flex min-w-0 shrink-0 items-center gap-2.5"
                                    dir={isRTL ? 'rtl' : 'ltr'}
                                >
                                    {isRTL ? (
                                        <>
                                            <img
                                                src={khabeerMark}
                                                alt=""
                                                className="h-7 w-[31px] shrink-0 object-contain object-center"
                                            />
                                            <span className="min-w-0 font-heading text-[1.35rem] font-extrabold leading-tight text-black antialiased dark:text-white">
                                                {t('dashboard.brandName')}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <img
                                                src={khabeerMark}
                                                alt=""
                                                className="h-7 w-[31px] shrink-0 object-contain object-center"
                                            />
                                            <span className="min-w-0 font-heading text-lg font-bold leading-tight tracking-tight text-black dark:text-white">
                                                {t('dashboard.brandName')}
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setShowExpandHint(false);
                                    setIsSidebarCollapsed((prev) => !prev);
                                }}
                                onMouseEnter={() => {
                                    if (isSidebarCollapsed) setShowExpandHint(true);
                                }}
                                onMouseLeave={() => setShowExpandHint(false)}
                                className={clsx(
                                    'group relative hidden size-6 shrink-0 items-center justify-center overflow-hidden rounded-[5px] lg:flex',
                                    !isSidebarCollapsed &&
                                        'text-khabeer-muted hover:text-gray-900 dark:text-dark-text-secondary dark:hover:text-dark-text-primary'
                                )}
                                aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            >
                                {isSidebarCollapsed ? (
                                    <>
                                        <img
                                            src={khabeerMark}
                                            alt=""
                                            draggable={false}
                                            className="size-full max-h-full max-w-full shrink-0 select-none object-contain object-center transition-opacity group-hover:hidden"
                                        />
                                        <img
                                            src={iconMenuCollapsedHover}
                                            alt=""
                                            draggable={false}
                                            className="absolute inset-0 hidden size-full shrink-0 select-none object-contain object-center group-hover:block dark:opacity-90"
                                        />
                                    </>
                                ) : (
                                    <PanelRightClose
                                        className={clsx('size-5', !isRTL && 'scale-x-[-1]')}
                                        aria-hidden
                                    />
                                )}
                            </button>
                        </div>
                        <div className="h-px w-full shrink-0 bg-khabeer-stroke dark:bg-dark-border" />
                    </div>

                    <nav
                        className={clsx(
                            'khabeer-sidebar-scroll flex min-h-0 w-full flex-1 flex-col',
                            isSidebarCollapsed ? 'items-center' : 'items-stretch'
                        )}
                    >
                        {navItems.map((item) => {
                            const isHome = item.id === 'home';
                            return (
                                <NavLink
                                    key={item.id}
                                    to={item.to}
                                    end={item.id === 'home'}
                                    onClick={() => setIsSidebarOpen(false)}
                                    className={clsx(
                                        'relative box-border flex w-full shrink-0 text-[20px] leading-normal transition-colors',
                                        isSidebarCollapsed ? 'h-16 min-h-16 py-3' : 'h-20 py-6',
                                        isSidebarCollapsed
                                            ? 'items-center justify-center px-0'
                                            : 'items-center justify-start gap-4 px-10',
                                        item.isActive
                                            ? 'font-bold text-khabeer-brand'
                                            : 'font-normal text-khabeer-muted hover:text-khabeer-brand dark:text-dark-text-secondary'
                                    )}
                                >
                                    {item.LucideIcon ? (
                                        <item.LucideIcon
                                            aria-hidden
                                            className={clsx(
                                                'size-6 shrink-0',
                                                item.isActive
                                                    ? 'text-khabeer-brand'
                                                    : 'text-khabeer-muted dark:text-dark-text-secondary'
                                            )}
                                        />
                                    ) : (
                                        <img
                                            src={item.iconSrc}
                                            alt=""
                                            width={24}
                                            height={24}
                                            draggable={false}
                                            className={clsx(
                                                'size-6 shrink-0 select-none rounded-[5px] object-contain',
                                                !item.isActive && isHome && 'opacity-50 saturate-0',
                                                item.isActive && !isHome && 'dark:opacity-90'
                                            )}
                                            style={
                                                item.isActive && !isHome
                                                    ? { filter: NAV_ICON_ACTIVE_FILTER }
                                                    : undefined
                                            }
                                        />
                                    )}
                                    {!isSidebarCollapsed && (
                                        <span className="whitespace-nowrap">{item.label}</span>
                                    )}
                                    {item.isActive && (
                                        <span
                                            className={clsx(
                                                'absolute end-0 h-12 w-[4px] rounded-[2px] bg-khabeer-brand',
                                                isSidebarCollapsed ? 'top-2' : 'top-4'
                                            )}
                                        />
                                    )}
                                </NavLink>
                            );
                        })}
                    </nav>
                </div>

                {isSidebarCollapsed && showExpandHint && (
                    <div
                        role="tooltip"
                        className={clsx(
                            'pointer-events-none absolute z-20 hidden lg:flex',
                            'items-center shadow-[0px_5px_10px_0px_rgba(0,0,0,0.25)]',
                            'rounded-lg bg-khabeer-brand py-2.5 pe-3 ps-3 text-[14px] font-medium leading-normal text-white',
                            isRTL ? 'left-[-114px] top-[33px]' : 'left-full top-[33px] ms-3'
                        )}
                    >
                        <span className="whitespace-nowrap">
                            {isRTL ? 'فتح النافذة الجانبية' : 'Open sidebar'}
                        </span>
                        <span
                            className={clsx(
                                'pointer-events-none absolute top-1/2 h-0 w-0 -translate-y-1/2 border-y-[7px] border-solid border-transparent',
                                isRTL
                                    ? '-right-1 border-l-[9px] border-l-khabeer-brand'
                                    : '-left-1 border-r-[9px] border-r-khabeer-brand'
                            )}
                            aria-hidden
                        />
                    </div>
                )}

                <div
                    className={clsx(
                        'flex w-full shrink-0 flex-col gap-4',
                        isSidebarCollapsed ? 'items-center' : 'items-stretch'
                    )}
                >
                    <div className="h-px w-full bg-khabeer-stroke dark:bg-dark-border" />
                    <button
                        type="button"
                        onClick={handleLogoutClick}
                        className={clsx(
                            'box-border flex h-12 w-full shrink-0 items-center text-[20px] font-normal leading-normal text-khabeer-danger transition-opacity hover:opacity-90',
                            isSidebarCollapsed ? 'max-w-[104px] justify-center px-0' : 'justify-start gap-4 px-10'
                        )}
                    >
                        <LogOut className="size-8 shrink-0 rounded-[5px]" strokeWidth={1.75} />
                        {!isSidebarCollapsed && <span className="whitespace-nowrap">{t('dashboard.logout')}</span>}
                    </button>
                </div>
            </aside>

            <div
                className={clsx(
                    'flex h-full min-h-0 min-w-0 flex-col overflow-hidden transition-[padding] duration-300',
                    /* فيزيائي: RTL سايد يمين → pr | LTR سايد يسار → pl */
                    isRTL
                        ? (isSidebarCollapsed ? 'lg:pr-sidebar-collapsed' : 'lg:pr-sidebar')
                        : (isSidebarCollapsed ? 'lg:pl-sidebar-collapsed' : 'lg:pl-sidebar')
                )}
            >
                {/* صف الأدوات: en = لغة … حساب (أقصى اليمين) | ar = حساب (أقصى اليسار) … لغة */}
                <header
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={clsx(
                        'flex w-full shrink-0 flex-col gap-2 border-b border-khabeer-stroke bg-white px-4 py-4 transition-colors duration-300 dark:border-dark-border dark:bg-dark-bg-secondary',
                        'sm:gap-3',
                        /* Figma 127:2704 / Header 127:2706: عرض = 100% عمود المحتوى (~1334 عند 1440−سايدبار) | ارتفاع = 80px | أفقي 40px */
                        'lg:box-border lg:h-[80px] lg:min-h-[80px] lg:max-h-[80px] lg:gap-0 lg:px-10 lg:py-0'
                    )}
                >
                    <div
                        dir="ltr"
                        className={clsx(
                            /* ltr فيزيائي + order: عربي user=1 يسار | إنجليزي bread=1 يسار */
                            'flex w-full min-h-0 min-w-0 flex-row flex-wrap items-center gap-3 sm:gap-4 lg:gap-4',
                            'lg:h-full lg:min-h-0',
                            isHomeRoute &&
                                (isRTL
                                    ? /* عربي: يمين/وسط: 1fr +بحث+أدوات بعرض المحتوى حتى لا يفيض المستخدم فوق البحث */
                                      'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,min(100%,22.375rem))_auto] lg:items-center lg:gap-4 lg:min-w-0 xl:gap-6'
                                    : /* LTR: العمودان 1+2 يتقلّصان؛ أدوات المستخدم auto تحجز عرضها فلا تتداخل مع البحث */
                                      'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,min(100%,22.375rem))_auto] lg:items-center lg:gap-4 lg:min-w-0 xl:gap-6'),
                            !isHomeRoute && 'flex-nowrap'
                        )}
                    >
                    <div
                        className={clsx(
                            /* عربي: أقصى اليمين (حيال السايدبار) | إنجليزي: أقصى اليسار */
                            'flex min-w-0 w-full items-center py-1',
                            isRTL ? 'justify-end' : 'justify-start',
                            !isHomeRoute && 'flex-1',
                            isHomeRoute &&
                                'lg:box-border lg:h-[68px] lg:min-h-[68px] lg:max-h-[68px] lg:items-center lg:rounded-xl lg:p-4',
                            isHomeRoute ? (isRTL ? 'order-3' : 'order-1') : (isRTL ? 'order-2' : 'order-1')
                        )}
                    >
                    <nav
                        dir={isRTL ? 'rtl' : 'ltr'}
                        className="flex max-w-full min-w-0 items-center justify-start gap-2 text-[18px] leading-normal sm:gap-2"
                        aria-label="Breadcrumb"
                    >
                        {breadcrumb.parent != null && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setIsSidebarOpen(true)}
                                    className="flex size-10 shrink-0 items-center justify-center rounded-[5px] text-khabeer-muted transition-colors hover:bg-gray-50 hover:text-gray-900 lg:hidden dark:hover:bg-dark-bg-tertiary dark:hover:text-dark-text-primary"
                                    aria-label={t('common.menu')}
                                >
                                    <Menu className="size-6" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate('/dashboard')}
                                    className="flex shrink-0 items-center gap-2 rounded-xl px-2 py-1 text-[#999] transition-colors hover:text-khabeer-brand dark:text-dark-text-muted dark:hover:text-dark-accent-blue"
                                >
                                    <Home className="size-6 shrink-0" strokeWidth={1.5} />
                                    <span className="hidden font-medium sm:inline">{breadcrumb.parent}</span>
                                </button>
                                <ChevronsRight
                                    className={clsx('size-6 shrink-0 text-khabeer-stroke', isRTL && 'rotate-180')}
                                    strokeWidth={1.25}
                                    aria-hidden
                                />
                            </>
                        )}
                        <div
                            className={clsx(
                                'flex min-w-0 items-center gap-2 text-khabeer-brand dark:text-dark-accent-blue',
                                /* عربي: نص ثم أيقونة | إنجليزي: أيقونة ثم نص */
                                isHomeRoute && 'gap-2 sm:gap-3'
                            )}
                        >
                            {breadcrumb.icon ? (
                                isHomeRoute ? (
                                    isRTL ? (
                                        <>
                                            <span className="truncate font-medium">{breadcrumb.current}</span>
                                            <img
                                                src={iconNavHome}
                                                alt=""
                                                width={24}
                                                height={24}
                                                draggable={false}
                                                className="size-6 shrink-0 select-none object-contain"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <img
                                                src={iconNavHome}
                                                alt=""
                                                width={24}
                                                height={24}
                                                draggable={false}
                                                className="size-6 shrink-0 select-none object-contain"
                                            />
                                            <span className="truncate font-medium">{breadcrumb.current}</span>
                                        </>
                                    )
                                ) : (
                                    <>
                                        <breadcrumb.icon className="size-6 shrink-0" strokeWidth={1.5} />
                                        <span className="truncate font-medium">{breadcrumb.current}</span>
                                    </>
                                )
                            ) : (
                                <span className="truncate font-medium">{breadcrumb.current}</span>
                            )}
                        </div>
                        {breadcrumb.parent == null && (
                            <button
                                type="button"
                                onClick={() => setIsSidebarOpen(true)}
                                className={clsx(
                                    'flex size-10 shrink-0 items-center justify-center rounded-[5px] text-khabeer-muted transition-colors hover:bg-gray-50 lg:hidden dark:hover:bg-dark-bg-tertiary',
                                    /* Push hamburger to outer edge: in RTL outer = left = margin-inline-end */
                                    isRTL ? 'ms-auto' : 'me-auto'
                                )}
                                aria-label={t('common.menu')}
                            >
                                <Menu className="size-6" />
                            </button>
                        )}
                    </nav>
                    </div>
                    {isHomeRoute && (
                    <div
                        className={clsx(
                            'order-2 flex min-w-0 w-full max-w-[358px] shrink-0 justify-center justify-self-center px-0.5 sm:px-1',
                            'sm:mx-auto lg:mx-0 lg:w-full lg:max-w-none',
                            isRTL
                                ? 'lg:justify-end lg:ps-2 lg:pe-0 xl:ps-3'
                                : 'lg:justify-start lg:ps-2 lg:pe-0 xl:ps-3'
                        )}
                    >
                        <label className="sr-only" htmlFor="dashboard-header-search">
                            {t('dashboard.headerSearchPlaceholder')}
                        </label>
                        {/* Figma 278:24326 Email Input Field: حدّ خارجي 16px، داخلي 12px، 358×48، gap-8 */}
                        <div
                            className={clsx(
                                'box-border w-full min-w-[120px] max-w-[358px] grow-0 overflow-hidden rounded-2xl border border-khabeer-stroke bg-white dark:border-dark-border dark:bg-dark-bg-secondary',
                                isRTL && 'lg:ms-auto'
                            )}
                            dir={isRTL ? 'rtl' : 'ltr'}
                        >
                            <div
                                className="box-border flex h-12 w-full min-h-12 items-center gap-2 rounded-xl bg-white px-4 py-2 dark:bg-dark-bg-secondary"
                                dir={isRTL ? 'rtl' : 'ltr'}
                            >
                                {isRTL ? (
                                    <>
                                        <Search className="pointer-events-none size-6 shrink-0 text-khabeer-muted" strokeWidth={1.5} aria-hidden />
                                        <input
                                            id="dashboard-header-search"
                                            type="search"
                                            value={headerSearch}
                                            onChange={(e) => setHeaderSearch(e.target.value)}
                                            placeholder={t('dashboard.headerSearchPlaceholder')}
                                            dir="rtl"
                                            lang="ar"
                                            autoComplete="off"
                                            className="min-h-0 min-w-0 flex-1 appearance-none border-0 bg-transparent py-0 text-start text-[14px] leading-normal text-[#333] shadow-none placeholder:text-[#999] focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 dark:text-dark-text-primary dark:placeholder:text-dark-text-muted"
                                        />
                                    </>
                                ) : (
                                    <>
                                        <input
                                            id="dashboard-header-search"
                                            type="search"
                                            value={headerSearch}
                                            onChange={(e) => setHeaderSearch(e.target.value)}
                                            placeholder={t('dashboard.headerSearchPlaceholder')}
                                            dir="ltr"
                                            autoComplete="off"
                                            className="min-h-0 min-w-0 flex-1 appearance-none border-0 bg-transparent py-0 text-start text-[14px] leading-normal text-[#333] shadow-none placeholder:text-[#999] focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 dark:text-dark-text-primary dark:placeholder:text-dark-text-muted"
                                        />
                                        <Search className="pointer-events-none size-6 shrink-0 text-khabeer-muted" strokeWidth={1.5} aria-hidden />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    )}
                    <div
                        className={clsx(
                            'flex w-full min-w-0 flex-row items-center gap-4 sm:gap-6',
                            isRTL
                                ? 'max-w-full justify-end flex-row-reverse sm:ps-0'
                                : 'justify-end',
                            isHomeRoute ? (isRTL ? 'order-1' : 'order-3') : (isRTL ? 'order-1' : 'order-2'),
                            !isHomeRoute && 'flex-1',
                            isHomeRoute && 'lg:min-w-0 lg:max-w-max lg:shrink-0',
                            isHomeRoute && isRTL && 'lg:pe-2 xl:pe-4',
                            isHomeRoute && !isRTL && 'lg:ps-2 xl:ps-4'
                        )}
                        dir="ltr"
                    >
                        <LanguageSwitcher variant="pill" className="shrink-0" />
                        <div className="shrink-0">
                            <AdminNotificationsBell />
                        </div>
                        <div
                            className="hidden h-[51px] w-px shrink-0 bg-khabeer-stroke sm:block dark:bg-dark-border"
                        />
                        <div
                            ref={profileMenuWrapRef}
                            className="relative max-w-[min(100%,240px)] shrink-0"
                        >
                            <button
                                type="button"
                                id="dashboard-user-menu-trigger"
                                aria-haspopup="menu"
                                aria-expanded={profileMenuOpen}
                                aria-controls="dashboard-user-menu"
                                title={t('dashboard.userMenu.menuAria')}
                                onClick={() => {
                                    setProfileMenuOpen((o) => !o);
                                }}
                                className={clsx(
                                    'flex w-full max-w-[min(100%,240px)] items-center gap-2 rounded-full border border-khabeer-stroke pb-0.5 ps-2 pe-2 pt-0 transition-colors hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-bg-tertiary',
                                    profileMenuOpen && 'border-khabeer-brand/40 dark:border-dark-accent-blue/40'
                                )}
                            >
                                <div className="flex size-[50px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-khabeer-stroke/50 bg-[#0077b6]/10 dark:border-dark-border">
                                    <AvatarOrInitial
                                        name={
                                            user?.first_name
                                                ? `${user.first_name} ${user.last_name || ''}`.trim()
                                                : user?.displayName || user?.email || ''
                                        }
                                        avatarUrl={user?.avatarUrl}
                                        className="text-lg"
                                    />
                                </div>
                                <div
                                    className={clsx(
                                        'min-w-0 flex-1',
                                        isRTL ? 'text-end' : 'text-start'
                                    )}
                                >
                                    <p className="truncate text-[18px] font-medium leading-tight text-[#333] dark:text-dark-text-primary">
                                        {user?.first_name
                                            ? `${user.first_name} ${user.last_name || ''}`.trim()
                                            : (user?.displayName || user?.email || (isRTL ? 'اسم الأدمن' : 'Admin'))}
                                    </p>
                                </div>
                                <ChevronDown
                                    className={clsx(
                                        'size-6 shrink-0 text-khabeer-muted transition-transform duration-200',
                                        profileMenuOpen && 'rotate-180'
                                    )}
                                    strokeWidth={1.5}
                                    aria-hidden
                                />
                            </button>
                            {profileMenuOpen ? (
                                <div
                                    id="dashboard-user-menu"
                                    role="menu"
                                    aria-labelledby="dashboard-user-menu-trigger"
                                    dir={isRTL ? 'rtl' : 'ltr'}
                                    className="absolute end-0 top-full z-[100] mt-1 min-w-[min(100vw-2rem,17rem)] rounded-xl border border-khabeer-stroke bg-white py-1 shadow-lg dark:border-dark-border dark:bg-dark-bg-secondary"
                                >
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="flex w-full items-center gap-2 px-3 py-2.5 text-[14px] text-[#333] transition-colors hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                                        onClick={() => {
                                            navigate('/dashboard/profile/general');
                                            setProfileMenuOpen(false);
                                        }}
                                    >
                                        <User className="size-4 shrink-0 opacity-80" strokeWidth={1.5} aria-hidden />
                                        {t('dashboard.userMenu.editProfile')}
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="flex w-full items-center gap-2 px-3 py-2.5 text-[14px] text-[#333] transition-colors hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                                        onClick={() => {
                                            navigate('/dashboard/profile/appearance');
                                            setProfileMenuOpen(false);
                                        }}
                                    >
                                        <Palette className="size-4 shrink-0 opacity-80" strokeWidth={1.5} aria-hidden />
                                        {t('profile.settings.appearance')}
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="flex w-full items-center gap-2 px-3 py-2.5 text-[14px] text-[#333] transition-colors hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                                        onClick={() => {
                                            navigate('/dashboard/profile/language');
                                            setProfileMenuOpen(false);
                                        }}
                                    >
                                        <Globe className="size-4 shrink-0 opacity-80" strokeWidth={1.5} aria-hidden />
                                        {t('profile.settings.language')}
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="flex w-full items-center gap-2 px-3 py-2.5 text-[14px] text-[#333] transition-colors hover:bg-gray-50 dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                                        onClick={() => {
                                            navigate('/dashboard/profile/security');
                                            setProfileMenuOpen(false);
                                        }}
                                    >
                                        <Lock className="size-4 shrink-0 opacity-80" strokeWidth={1.5} aria-hidden />
                                        {t('profile.settings.security')}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    </div>
                </header>

                <main
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F5F5F5] p-4 transition-colors duration-300 dark:bg-dark-bg-primary lg:p-8"
                >
                    <div className="mx-auto w-full max-w-7xl">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
