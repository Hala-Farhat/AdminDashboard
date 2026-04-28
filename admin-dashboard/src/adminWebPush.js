/**
 * إشعارات FCM في المتصفح للأدمن (اختياري).
 * بعد تسجيل الدخول يُرسل التوكن عبر POST /users/me/fcm (انظر registerWebFcmToken).
 * يتطلب VITE_FIREBASE_VAPID_KEY وملف public/firebase-messaging-sw.js متوافق مع نفس مشروع Firebase.
 */
import { app } from './firebase';
import { deleteWebFcmCurrentSession, deleteWebFcmRegistration, registerWebFcmToken } from './api/notificationsApi';
import { runDashboardDataRefreshFromPushData } from './lib/dashboardDataRefresh';
import {
    expandFcmDataObject,
    extractAdminPayload,
    formatAdminNotificationLines,
    getNotificationIdFromFcmData,
    getPathFromRawNotificationData,
    notificationT,
} from './utils/adminNotifications';

let warned;

/** آخر fcmToken أُرسل بنجاح للسيرفر — لتجنّب POST مزدوج (Strict Mode / إعادة mount). */
let lastPostedFcmToken = null;

/** معرّف تسجيل FCM في السيرفر (من استجابة POST) — لـ DELETE /users/me/fcm/:id عند تسجيل الخروج */
const FCM_REG_ID_STORAGE_KEY = 'khabeer_fcm_registration_id';

function clearFcmClientState() {
    lastPostedFcmToken = null;
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(FCM_REG_ID_STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * سلسلة وعود: كل init ينتظر اللي قبله حتى لا يعمل getToken/register مرتين بالتوازي.
 */
let initTail = Promise.resolve();

/**
 * مسح حالة التسجيل المحلية (رفض صلاحية، أو خروج بدون استدعاء حذف السيرفر).
 */
export function resetAdminFcmRegistrationState() {
    clearFcmClientState();
}

/**
 * إلغاء تسجيل FCM على السيرفر ثم مسح الحالة المحلية — يُستدعى قبل signOut عند كل تسجيل خروج.
 * - مع `khabeer_fcm_registration_id`: DELETE /users/me/fcm/:id
 * - بدونه: يُجرّب DELETE /users/me/fcm (إن دعمه الباكند) لإزالة اشتراك هذا المتصفح
 * لا يمنع تسجيل الخروج عند فشل الشبكة — يُسجّل تحذيراً فقط.
 * @param {string | null | undefined} bearerToken JWT ما زال صالحاً
 */
export async function unregisterWebFcmOnServer(bearerToken) {
    if (typeof window === 'undefined') {
        clearFcmClientState();
        return;
    }

    /** يُصفّر قبل أي شيء حتى يعيد `initAdminWebPush` استدعاء POST بعد الدخول التالي حتى بنفس الجهاز */
    lastPostedFcmToken = null;

    let id = null;
    try {
        id = localStorage.getItem(FCM_REG_ID_STORAGE_KEY);
    } catch {
        /* ignore */
    }

    if (!bearerToken?.trim()) {
        clearFcmClientState();
        return;
    }

    try {
        if (id) {
            await deleteWebFcmRegistration(bearerToken, id);
        } else {
            await deleteWebFcmCurrentSession(bearerToken);
        }
    } catch (e) {
        console.warn('[adminWebPush] فشل إلغاء FCM على السيرفر', e?.response?.status ?? e?.message);
    }

    clearFcmClientState();
}

/** يمرّر مسار التنقّل + بيانات Push لتعليم الإشعار كمقروء (معرّف و/أو مطابقة مع القائمة) — يُستمع له في DashboardLayout */
function dispatchAdminNavigate(path, detail) {
    if (typeof path !== 'string' || !path.startsWith('/')) return;
    const d = { path };
    if (detail?.notificationId) d.notificationId = String(detail.notificationId);
    if (detail?.pushData && typeof detail.pushData === 'object') {
        d.pushData = detail.pushData;
    }
    window.dispatchEvent(new CustomEvent('khabeer-admin-navigate', { detail: d }));
}


/**
 * FCM في المقدمة (التبويب مفتوح): لا يظهر منبثق النظام تلقائياً — نعرضه يدوياً.
 * في الخلفية يتولى firebase-messaging-sw.js الـ showNotification.
 * @param {object} payload — حميلة FCM (notification + data)
 */
function showForegroundSystemNotification(payload) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') {
        if (import.meta.env.DEV) {
            console.log('[adminWebPush] بدون إذن إشعارات المتصفح — لن يظهر المنبثق. الحالة:', Notification.permission);
        }
        return;
    }

    const d = expandFcmDataObject(
        payload.data && typeof payload.data === 'object' ? payload.data : {}
    );
    const lang = typeof localStorage !== 'undefined' && localStorage.getItem('language') === 'en' ? 'en' : 'ar';

    const row = {
        data: d,
        title: payload.notification?.title ?? d.title ?? d.notification_title,
        body: payload.notification?.body ?? d.body ?? d.bodyText,
    };
    const p = extractAdminPayload(row);
    const lines = formatAdminNotificationLines(
        p,
        { title: row.title, body: row.body },
        (key) => notificationT(lang, key)
    );

    let titleStr = lines.title.trim();
    if (titleStr === '—') titleStr = '';
    let bodyStr = lines.body.trim();

    if (!titleStr && !bodyStr) {
        /** إشعار data-only تقريباً — نفس المنطق بلغة الواجهة */
        const typeU = String(d.type || '')
            .toUpperCase()
            .replace(/-/g, '_');
        if (typeU === 'ADMIN_NEW_ORDER') {
            titleStr = notificationT(lang, 'notifications.types.ADMIN_NEW_ORDER.title');
            bodyStr = d.orderNumber
                ? `${notificationT(lang, 'notifications.foregroundMini.order')} ${d.orderNumber}`
                : notificationT(lang, 'notifications.foregroundMini.genericNew');
        } else if (typeU === 'ADMIN_APPLICATION_SUBMITTED') {
            titleStr = notificationT(lang, 'notifications.types.ADMIN_APPLICATION_SUBMITTED.title');
            bodyStr = notificationT(lang, 'notifications.foregroundMini.joinBody');
        } else if (typeU === 'ADMIN_WEBSITE_EXPERT_LEAD') {
            titleStr = notificationT(lang, 'notifications.types.ADMIN_WEBSITE_EXPERT_LEAD.title');
            const an = String(d.applicantName || d.applicant_name || '').trim();
            const tpl = notificationT(lang, 'notifications.types.ADMIN_WEBSITE_EXPERT_LEAD.body');
            bodyStr = an ? tpl.replace(/\{0\}/g, an) : tpl.replace(/\{0\}/g, lang === 'en' ? '—' : '—');
        } else if (typeU === 'ADMIN_SUPPORT_TICKET') {
            titleStr = notificationT(lang, 'notifications.types.ADMIN_SUPPORT_TICKET.title');
            const un = String(d.userName || d.user_name || d.seekerName || d.seeker_name || '').trim();
            const tpl = notificationT(lang, 'notifications.types.ADMIN_SUPPORT_TICKET.body');
            bodyStr = un ? tpl.replace(/\{0\}/g, un) : tpl.replace(/\{0\}/g, lang === 'en' ? 'User' : 'مستخدم');
        } else {
            if (import.meta.env.DEV) {
                console.log('[adminWebPush] حمولة FCM بدون عنوان/نص — أضف title/body في data من الباكند للمنبثق');
            }
            titleStr = notificationT(lang, 'notifications.foregroundMini.appName');
            bodyStr = notificationT(lang, 'notifications.foregroundMini.genericNew');
        }
    }

    try {
        const tag = `khb-${d.type || 'n'}-${d.orderId || d.applicationId || Date.now()}`;
        const n = new Notification(titleStr || notificationT(lang, 'notifications.foregroundMini.appName'), {
            body: bodyStr || undefined,
            icon: '/favicon.svg',
            tag,
            silent: false,
            data: d,
        });
        n.onclick = (ev) => {
            const data = ev.target?.data ?? d;
            const path = getPathFromRawNotificationData(data);
            const notificationId = getNotificationIdFromFcmData(data);
            const pushData = { ...(typeof data === 'object' && data ? data : {}) };
            dispatchAdminNavigate(path, {
                ...(notificationId ? { notificationId } : {}),
                pushData,
            });
            window.focus();
            n.close();
        };
    } catch (err) {
        console.warn('[adminWebPush] فشل عرض Notification:', err);
    }
}

/**
 * @param {string} bearerToken JWT
 * @returns {Promise<(() => void) | undefined>} unsubscribe لـ onMessage
 */
export async function initAdminWebPush(bearerToken) {
    if (typeof window === 'undefined' || !bearerToken) return undefined;
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim?.();
    if (!vapidKey) {
        console.warn('[adminWebPush] تخطي: لا يوجد VITE_FIREBASE_VAPID_KEY');
        return undefined;
    }

    const result = initTail.then(() => runInit(bearerToken, vapidKey));
    initTail = result.catch(() => {});
    return result;
}

async function runInit(bearerToken, vapidKey) {
    try {
        const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');
        const supported = await isSupported();
        if (!supported) {
            console.warn('[adminWebPush] تخطي: FCM غير مدعوم في هذا المتصفح');
            return undefined;
        }

        const messaging = getMessaging(app);
        const current = await getToken(messaging, { vapidKey });
        if (!current) {
            console.warn('[adminWebPush] getToken فارغ — لم يُستدعَ registerWebFcm');
            return undefined;
        }

        /** POST في كل تهيئة بعد تسجيل دخول — حتى نفس الجهاز يُعاد الربط؛ أجهزة متعددة = عدة تسجيلات على السيرفر */
        const regId = await registerWebFcmToken(bearerToken, current);
        lastPostedFcmToken = current;
        if (regId && typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(FCM_REG_ID_STORAGE_KEY, regId);
            } catch {
                /* ignore */
            }
        }

        /** طلب إذن إشعارات المتصفح إن لزم — بدونها لا يظهر المنبثق حتى مع FCM */
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
        }

        return onMessage(messaging, (payload) => {
            showForegroundSystemNotification(payload);
            window.dispatchEvent(new CustomEvent('admin-notifications-refresh'));
            const raw = payload?.data && typeof payload.data === 'object' ? payload.data : {};
            runDashboardDataRefreshFromPushData(raw);
        });
    } catch (e) {
        if (!warned) {
            warned = true;
            console.warn('[adminWebPush] FCM web disabled or misconfigured:', e?.message || e);
        }
        return undefined;
    }
}
