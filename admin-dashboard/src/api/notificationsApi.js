/**
 * إشعارات المستخدم (لوحة الأدمن — ويب)
 *
 * - GET /notifications: إشعارات المستخدم الحالي فقط (مستخرجة من firebaseUid في التوكن). كل صف لحساب واحد.
 * - الحقول: title / body نص جاهز للعرض (مثلاً عربي) للقوائم؛ data يحمل type, orderId, screen, … للتنقّل.
 * - titleLocKey / bodyLocKey و titleLocArgs / bodyLocArgs: اختياري لبناء النص بلغة الجهاز (مثل Flutter).
 * - Push: POST /users/me/fcm — Body JSON: { fcmToken (مطلوب), deviceType? , lang? (ar|en) } + Authorization Bearer.
 *   الاستجابة غالباً تتضمّن `id` (أو ما يعادله) لاستخدامه في DELETE /users/me/fcm/:id عند تسجيل الخروج.
 *
 * @see registerWebFcmToken
 * @see deleteWebFcmRegistration
 */
import api from './apiConfig';
import { extractAdminPayload, getNotificationIdFromFcmData } from '../utils/adminNotifications';

const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

function normStr(v) {
    if (v == null) return '';
    return String(v).trim();
}

/** مطابقة صف من GET /notifications مع حمولة FCM (نفس type + orderId أو applicationId). */
function rowMatchesPushPayload(pushPayload, rowNormalized) {
    const rp = extractAdminPayload(rowNormalized);
    if (!pushPayload?.type || !rp.type || pushPayload.type !== rp.type) return false;

    const po = normStr(pushPayload.orderId);
    const ro = normStr(rp.orderId);
    const pa = normStr(pushPayload.applicationId);
    const ra = normStr(rp.applicationId);

    if (po) {
        if (po !== ro) return false;
        if (pa && ra && pa !== ra) return false;
        return true;
    }
    if (pa) return pa === ra;
    return false;
}

function isRowVisiblyUnread(n) {
    const x = normalizeNotificationRow(n);
    if (!x.id) return false;
    return !x.read && !x.isRead && !x.readAt && !x.read_at;
}

/**
 * يفك غلاف الاستجابة الشائع { success, data } أو يعيد الجسم كما هو.
 * @param {import('axios').AxiosResponse} res
 */
function unwrapListBody(res) {
    const body = res?.data;
    if (!body || typeof body !== 'object') return { items: [], unreadCount: 0 };
    if (body.success === false) {
        const msg = typeof body.message === 'string' && body.message.trim() ? body.message : 'Request failed';
        throw new Error(msg);
    }
    return body.data !== undefined ? body.data : body;
}

function isNotificationRead(row) {
    if (row == null) return true;
    if (row.read === true || row.isRead === true) return true;
    if (row.read === false || row.isRead === false) return false;
    return Boolean(row.readAt || row.read_at);
}

function parseNotificationsListResponse(res) {
    const data = unwrapListBody(res);
    const rawItems = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.notifications)
          ? data.notifications
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
              ? data
              : [];

    const items = rawItems.map(normalizeNotificationRow);

    let unreadCount = data?.unreadCount ?? data?.unread ?? data?.unreadTotal;
    if (typeof unreadCount !== 'number' || Number.isNaN(unreadCount)) {
        unreadCount = items.filter((x) => !isNotificationRead(x)).length;
    }

    return {
        items,
        unreadCount,
        page: data?.page,
        totalPages: data?.totalPages,
        total: data?.total,
    };
}

/**
 * GET — قائمة إشعارات المستخدم الحالي (حسب التوكن).
 * المسار الأساسي المتفق عليه: GET /notifications. يُجرّب بدائل إن رُدّ 404.
 * @param {string} token
 * @param {{ page?: number, limit?: number }} [opts]
 */
export async function fetchNotifications(token, { page = 1, limit = 40 } = {}) {
    const paths = [
        '/notifications',
        '/users/me/notifications',
        '/manage/notifications',
        '/manage/users/me/notifications',
    ];
    const config = {
        headers: {
            ...authHeaders(token),
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        },
        params: {
            page,
            limit,
            _t: Date.now(),
        },
    };

    let lastErr = null;
    for (const url of paths) {
        try {
            const res = await api.get(url, config);
            return parseNotificationsListResponse(res);
        } catch (e) {
            lastErr = e;
            const status = e?.response?.status;
            if (status === 404 || status === 405) continue;
            throw e;
        }
    }
    if (lastErr) throw lastErr;
    throw new Error('Notifications endpoint not found');
}

/**
 * توحيد شكل السجل مهما اختلف اسم الحقل في الـ API.
 */
export function normalizeNotificationRow(raw) {
    if (!raw || typeof raw !== 'object') return { id: '', data: {}, raw: raw };
    const id = raw.id ?? raw._id ?? raw.notificationId ?? '';
    let data = raw.data ?? raw.payload;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            data = {};
        }
    }
    if (!data || typeof data !== 'object') data = {};

    /** عقد موحّد: المفاتيح قد تأتي على الصف أو داخل `data` */
    const mergeFromRoot = (k) => {
        if (data[k] != null) return;
        if (raw[k] != null) data[k] = raw[k];
    };
    mergeFromRoot('titleLocKey');
    mergeFromRoot('bodyLocKey');
    mergeFromRoot('titleLocArgs');
    mergeFromRoot('bodyLocArgs');
    mergeFromRoot('lang');
    mergeFromRoot('type');
    mergeFromRoot('screen');
    /** FCM/API: قد يُرسل الباكند actorRole على الجذر — لازم يدخل data لبناء النص مثل الجرس */
    mergeFromRoot('actorRole');
    mergeFromRoot('actor_role');

    const read =
        raw.read === true || raw.isRead === true
            ? true
            : raw.read === false || raw.isRead === false
              ? false
              : Boolean(raw.readAt || raw.read_at);

    const title =
        raw.title ??
        raw.subject ??
        (typeof data.title === 'string' ? data.title : undefined) ??
        undefined;
    const body =
        raw.body ??
        raw.message ??
        raw.content ??
        (typeof data.body === 'string' ? data.body : undefined) ??
        undefined;

    return {
        ...raw,
        id,
        data,
        read,
        isRead: read,
        title,
        body,
        createdAt: raw.createdAt ?? raw.created_at ?? raw.timestamp ?? null,
    };
}

/**
 * تعليم الإشعار كمقروء — مسارات شائعة؛ الفشل الصامت يُترك للواجهة.
 * @param {string} token
 * @param {string} notificationId
 */
/**
 * بعد نقر Push: إن وُجد معرّف في data يُستدعى PATCH مباشرة؛ وإلا نبحث في آخر صفحة من GET /notifications
 * عن أول إشعار غير مقروء يطابق نفس النوع + (orderId أو applicationId) كما في حمولة FCM.
 * @param {string} token
 * @param {Record<string, unknown>} pushData — حقول FCM data (نفسها في SW / المنبثق)
 * @returns {Promise<string | null>} id المعلَّم أو null
 */
export async function markNotificationReadByPushData(token, pushData) {
    if (!token || !pushData || typeof pushData !== 'object') return null;

    const explicit = getNotificationIdFromFcmData(pushData);
    if (explicit) {
        await markNotificationRead(token, explicit);
        return explicit;
    }

    const pushPayload = extractAdminPayload({ data: pushData });
    if (!pushPayload.type) return null;

    let res;
    try {
        res = await fetchNotifications(token, { page: 1, limit: 100 });
    } catch {
        return null;
    }

    const unreadRows = (res.items || []).map((r) => normalizeNotificationRow(r)).filter(isRowVisiblyUnread);

    const hasAnchor = Boolean(normStr(pushPayload.orderId) || normStr(pushPayload.applicationId));

    if (hasAnchor) {
        for (const n of unreadRows) {
            if (rowMatchesPushPayload(pushPayload, n)) {
                await markNotificationRead(token, n.id);
                return n.id;
            }
        }
        return null;
    }

    const sameType = unreadRows.filter((n) => extractAdminPayload(n).type === pushPayload.type);
    if (sameType.length === 1) {
        const id = sameType[0].id;
        await markNotificationRead(token, id);
        return id;
    }
    return null;
}

export async function markNotificationRead(token, notificationId) {
    if (!notificationId) return;
    const id = encodeURIComponent(notificationId);
    try {
        await api.patch(
            `/notifications/${id}/read`,
            {},
            {
                headers: authHeaders(token),
            }
        );
        return;
    } catch {
        /* fallback */
    }
    try {
        await api.put(
            `/notifications/${id}/read`,
            {},
            {
                headers: authHeaders(token),
            }
        );
    } catch {
        try {
            await api.post(
                `/notifications/${id}/mark-read`,
                {},
                {
                    headers: authHeaders(token),
                }
            );
        } catch {
            /* ignore */
        }
    }
}

/**
 * تعيين كل الإشعارات كمقروء — يُجرّب مسارات شائعة.
 * @param {string} token
 */
export async function markAllNotificationsRead(token) {
    if (!token) return;
    const paths = [
        { method: 'post', url: '/notifications/read-all' },
        { method: 'patch', url: '/notifications/read-all' },
        { method: 'post', url: '/users/me/notifications/read-all' },
        { method: 'put', url: '/users/me/notifications/read-all' },
    ];
    const cfg = {
        headers: {
            ...authHeaders(token),
            'Content-Type': 'application/json',
        },
    };
    let lastErr = null;
    for (const { method, url } of paths) {
        try {
            await api[method](url, {}, cfg);
            return;
        } catch (e) {
            lastErr = e;
            const status = e?.response?.status;
            if (status === 404 || status === 405) continue;
            throw e;
        }
    }
    if (lastErr) {
        const err = new Error('Mark-all-read endpoint not found');
        err.cause = lastErr;
        throw err;
    }
}

/**
 * يستخرج معرّف تسجيل FCM من جسم الاستجابة (أشكال شائعة من الباكند).
 * @param {{ data?: unknown }} res
 * @returns {string | null}
 */
function extractFcmRegistrationIdFromResponse(res) {
    const d = res?.data;
    if (d == null || typeof d !== 'object') return null;
    const inner = d.data != null && typeof d.data === 'object' ? d.data : d;
    const id =
        inner.id ??
        inner._id ??
        inner.fcmId ??
        inner.fcm_id ??
        inner.registrationId ??
        inner.registration_id;
    if (id == null) return null;
    const s = String(id).trim();
    return s !== '' ? s : null;
}

/**
 * إلغاء تسجيل جهاز FCM — DELETE /users/me/fcm/:fcmRegistrationId
 * @param {string} token Bearer JWT
 * @param {string} fcmRegistrationId المعرف الذي أعاده POST /users/me/fcm
 */
export async function deleteWebFcmRegistration(token, fcmRegistrationId) {
    if (!token || !fcmRegistrationId) {
        console.warn('[deleteWebFcm] تم التخطي: لا يوجد JWT أو معرّف التسجيل');
        return;
    }
    const id = encodeURIComponent(String(fcmRegistrationId).trim());
    try {
        await api.delete(`/users/me/fcm/${id}`, {
            headers: authHeaders(token),
        });
    } catch (e) {
        if (e?.response?.status === 404) return;
        throw e;
    }
}

/**
 * حذف تسجيل FCM للجلسة الحالية بدون معرّف (مثلاً لم يُعاد id من POST سابقاً).
 * يُجرّب DELETE /users/me/fcm — إن لم يدعم الباكند يرجع 404 ويُتجاهل.
 * @param {string} token
 */
export async function deleteWebFcmCurrentSession(token) {
    if (!token) return;
    try {
        await api.delete('/users/me/fcm', {
            headers: authHeaders(token),
        });
    } catch (e) {
        const s = e?.response?.status;
        if (s === 404 || s === 405) return;
        throw e;
    }
}

/**
 * تسجيل أو تحديث توكن FCM — POST /users/me/fcm
 * Body: { fcmToken (مطلوب), deviceType? (اختياري), lang? (ar|en اختياري) }
 *
 * @param {string} token Bearer JWT (Firebase idToken)
 * @param {string} fcmToken من getToken (Firebase Messaging)
 * @param {{ deviceType?: string, lang?: 'ar'|'en' }} [opts]
 * @returns {Promise<string | null>} معرّف التسجيل في السيرفر إن وُجد في الاستجابة — لحذفه عند تسجيل الخروج
 */
/**
 * إشعار جماعي للعملاء أو مقدمي الخدمة — POST /manage/notifications/broadcast?audience=clients|providers
 * @param {string} token
 * @param {{ audience: 'clients' | 'providers', titleAr: string, bodyAr: string, titleEn: string, bodyEn: string }} payload
 */
export async function postBroadcastNotification(token, payload) {
    if (!token) throw new Error('No token');
    const { audience, titleAr, bodyAr, titleEn, bodyEn } = payload;
    if (audience !== 'clients' && audience !== 'providers') {
        throw new Error('Invalid audience');
    }
    return api.post(
        '/manage/notifications/broadcast',
        { titleAr, bodyAr, titleEn, bodyEn },
        {
            params: { audience },
            headers: {
                ...authHeaders(token),
                'Content-Type': 'application/json',
            },
        }
    );
}

export async function registerWebFcmToken(token, fcmToken, opts = {}) {
    if (!token || !fcmToken) {
        console.warn('[registerWebFcm] تم التخطي: لا يوجد JWT أو fcmToken');
        return null;
    }
    const langRaw = opts.lang ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('language') : null) ?? 'ar';
    const lang = langRaw === 'en' ? 'en' : 'ar';
    const body = {
        fcmToken,
        deviceType: opts.deviceType ?? 'web',
        lang,
    };
    try {
        const res = await api.post('/users/me/fcm', body, {
            headers: {
                ...authHeaders(token),
                'Content-Type': 'application/json',
            },
        });
        const masked =
            fcmToken.length > 20
                ? `${fcmToken.slice(0, 10)}…${fcmToken.slice(-8)}`
                : '[قصير]';
        const regId = extractFcmRegistrationIdFromResponse(res);
        console.log('[registerWebFcm] نجاح POST /users/me/fcm', {
            httpStatus: res.status,
            responseData: res.data,
            registrationId: regId ?? '(غير مُعاد في الاستجابة)',
            sent: { deviceType: body.deviceType, lang: body.lang, fcmTokenPreview: masked },
        });
        return regId;
    } catch (e) {
        console.error('[registerWebFcm] فشل POST /users/me/fcm', {
            httpStatus: e?.response?.status,
            responseData: e?.response?.data,
            message: e?.message,
        });
        throw e;
    }
}
