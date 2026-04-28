/**
 * إشعارات الأدمن (payload من الـ API / FCM).
 * type: ADMIN_APPLICATION_SUBMITTED | ADMIN_WEBSITE_EXPERT_LEAD | ADMIN_NEW_ORDER | ADMIN_SUPPORT_TICKET
 * screen: ADMIN_JOIN_REQUESTS | ADMIN_SERVICE_REQUESTS | ADMIN_SUPPORT
 *
 * للـ UX يمكن عرض «إشعارات إدارية فقط» عبر isAdminDashboardNotificationRow (ليس شرط أمان — الـ API per-user).
 *
 * العرض: يُفضَّل بناء العنوان/النص من `notifications.types.*` (عربي/إنجليزي حسب `t`) باستخدام الحقول الأساسية
 * في `data` أو `bodyLocArgs`؛ نصّ السيرفر الجاهز يُستخدم احتياطياً إن لم يُبنَ قالب صالح.
 */
import locales from '../locales';
export const ADMIN_NOTIFICATION_TYPES = [
    'ADMIN_NEW_ORDER',
    'ADMIN_APPLICATION_SUBMITTED',
    'ADMIN_WEBSITE_EXPERT_LEAD',
    'ADMIN_SUPPORT_TICKET',
    'ADMIN_ORDER_ACCEPTED',
    'ADMIN_ORDER_REJECTED',
    'ADMIN_ORDER_CANCELLED',
    'ADMIN_ORDER_COMPLETION_REQUESTED',
    'ADMIN_ORDER_COMPLETED',
];

/** توحيد type/screen من الباكند (أحرف كبيرة، شرطات سفلية) */
function normalizeKind(raw) {
    if (raw == null || raw === '') return null;
    return String(raw)
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
}

/**
 * يطابق عقد الباكند الموحّد — مرادفات لنفس القوالب والمسارات.
 * @param {string | null | undefined} raw
 */
export function canonicalizeNotificationType(raw) {
    const t = normalizeKind(raw);
    if (!t) return null;
    const map = {
        ORDER_CANCELED: 'ORDER_CANCELLED',
        NEW_ORDER: 'ADMIN_NEW_ORDER',
        SUPPORT_REQUEST_SENT: 'ADMIN_SUPPORT_TICKET',
    };
    return map[t] ?? t;
}

/**
 * إشعار الدعم الفني — لا نستخدمه للتنقّل لشاشة أخرى (يُعلَّم مقروء فقط).
 * @param {ReturnType<typeof extractAdminPayload>} payload
 */
export function isSupportTicketNotification(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const t = canonicalizeNotificationType(payload.type);
    const d = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const scr = normalizeKind(payload.screen ?? d.screen);
    return (
        t === 'ADMIN_SUPPORT_TICKET' ||
        t === 'SUPPORT_REQUEST_SENT' ||
        scr === 'ADMIN_SUPPORT' ||
        scr === 'SUPPORT'
    );
}

/**
 * للقبول/الرفض يرسل الباكند أحياناً `[orderNumber, userName, providerName, seekerName]`
 * بينما القالب يستخدم فقط `[orderNumber, providerName]` ← الفهرس 0 و 2.
 * @param {string | null} bodyLocKey
 * @param {string[]} args
 * @param {string | null | undefined} [typeHint] نوع الإشعار إن وُجد بدون bodyLocKey
 */
export function effectiveTemplateBodyArgs(bodyLocKey, args, typeHint) {
    const raw = Array.isArray(args) ? args.map((x) => String(x)) : [];
    const bk = bodyLocKeyToTemplateId(bodyLocKey || '');
    const t = canonicalizeNotificationType(typeHint);
    const isAcceptReject =
        bk === 'ORDER_ACCEPTED' ||
        bk === 'ORDER_REJECTED' ||
        t === 'ORDER_ACCEPTED' ||
        t === 'ORDER_REJECTED';
    if (isAcceptReject && raw.length >= 4) {
        return [raw[0], raw[2]];
    }
    return raw;
}

/**
 * صف يُعرض في لوحة الأدمن: نوع إداري معروف أو بدون type (قديم).
 * @param {object} row صف بعد normalizeNotificationRow
 */
export function isAdminDashboardNotificationRow(row) {
    const p = extractAdminPayload(row);
    if (!p.type) return true;
    return ADMIN_NOTIFICATION_TYPES.includes(p.type);
}

/** @param {unknown} raw */
export function parseLocArgs(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.map((x) => String(x));
    if (typeof raw === 'string') {
        try {
            const j = JSON.parse(raw);
            if (Array.isArray(j)) return j.map((x) => String(x));
        } catch {
            return [raw];
        }
    }
    return [String(raw)];
}

/**
 * تعويض {0} {1} … مثل Flutter bodyArgs
 * @param {string} template
 * @param {string[]} args
 */
export function applyIndexedArgs(template, args) {
    if (typeof template !== 'string' || !args?.length) return template;
    let s = template;
    args.forEach((a, i) => {
        s = s.split(`{${i}}`).join(a);
    });
    return s;
}

/** يزيل مقدّمات زائدة من نص عربي جاهز من الباكند (مثل «في طلب الخدمة» قبل «قام العميل…»). */
export function trimArabicNotificationBodyPreamble(body) {
    if (typeof body !== 'string') return body;
    let s = body.trim();
    s = s.replace(/^في\s+طلب\s+الخدمة\s*[،,.\s]*/u, '').trim();
    return s;
}

/** ترجمة مسار i18n بدون React — لـ Service Worker / adminWebPush */
export function notificationT(lang, key) {
    const bundle = lang === 'en' ? locales.en : locales.ar;
    const parts = key.split('.');
    let v = bundle;
    for (const p of parts) v = v?.[p];
    return typeof v === 'string' ? v : key;
}

/**
 * يفك JSON متداخلًا في `data` كسلسلة (شائع مع FCM) ويرفع الحقول للجذر — حتى يُقرأ actorRole وغيره.
 * @param {Record<string, unknown> | null | undefined} d
 */
export function expandFcmDataObject(d) {
    if (!d || typeof d !== 'object') return {};
    const out = { ...d };
    if (typeof out.data === 'string' && /^\s*\{/.test(out.data)) {
        try {
            const inner = JSON.parse(out.data);
            if (inner && typeof inner === 'object') {
                Object.keys(inner).forEach((k) => {
                    if (out[k] == null || out[k] === '') out[k] = inner[k];
                });
            }
        } catch {
            /* ignore */
        }
    }
    return out;
}

function hasUnfilledIndexedPlaceholders(s) {
    return typeof s === 'string' && /\{[0-9]+\}/.test(s);
}

/** يوحّد أسماء القوالب مع `notifications.types` (فرق إملاء من الباكند). */
export function canonicalizeTemplateId(id) {
    if (id == null || id === '') return null;
    const u = String(id).trim().toUpperCase().replace(/-/g, '_');
    if (u === 'ORDER_CANCELED') return 'ORDER_CANCELLED';
    if (u === 'NEW_ORDER') return 'ADMIN_NEW_ORDER';
    if (u === 'SUPPORT_REQUEST_SENT') return 'ADMIN_SUPPORT_TICKET';
    return u;
}

/**
 * يستخرج اسم قالب notifications.types.<ID>
 * يدعم `notification.ADMIN_EVENT_ORDER_ACCEPTED_BODY` → `ADMIN_ORDER_ACCEPTED`
 */
export function bodyLocKeyToTemplateId(key) {
    if (!key || typeof key !== 'string') return null;
    let u = key.trim();
    if (u.startsWith('notification.')) u = u.slice('notification.'.length);
    const ev = u.match(/^ADMIN_EVENT_(ORDER_[A-Z_]+)_(TITLE|BODY)$/);
    if (ev) return canonicalizeTemplateId(`ADMIN_${ev[1]}`);
    let base = null;
    if (u.endsWith('_BODY')) base = u.slice(0, -5);
    else if (u.endsWith('_TITLE')) base = u.slice(0, -6);
    return base ? canonicalizeTemplateId(base) : null;
}

/**
 * وسائط القالب من `data` عندما لا يُرسل الباكند bodyLocArgs (نفس ترتيب القوالب في ar/en).
 * @param {ReturnType<typeof extractAdminPayload>} payload
 */
const ADMIN_ORDER_NARRATIVE_TYPES = new Set([
    'ADMIN_ORDER_ACCEPTED',
    'ADMIN_ORDER_REJECTED',
    'ADMIN_ORDER_CANCELLED',
    'ADMIN_ORDER_COMPLETION_REQUESTED',
    'ADMIN_ORDER_COMPLETED',
]);

function isAdminOrderNarrativePayload(payload) {
    const bk = bodyLocKeyToTemplateId(payload.bodyLocKey || '');
    const t = payload.type;
    return (
        (t && ADMIN_ORDER_NARRATIVE_TYPES.has(t)) ||
        (bk && ADMIN_ORDER_NARRATIVE_TYPES.has(bk))
    );
}

/**
 * عقد الباكند: `bodyLocArgs` لـ `ADMIN_EVENT_ORDER_*` = [orderNumber, seekerName, providerName]
 * قوالب الواجهة تستخدم [providerName, orderNumber, seekerName].
 */
function mapEventOrderBodyLocArgsToTemplate(args) {
    const raw = Array.isArray(args) ? args.map((x) => String(x)) : [];
    if (raw.length !== 3) return raw;
    return [raw[2], raw[0], raw[1]];
}

/**
 * قيمة موحّدة من الباكند: service-seeker | service-provider | فاضي
 * @param {Record<string, unknown>} d
 * @returns {'service-seeker' | 'service-provider' | ''}
 */
export function readActorRoleSlug(d) {
    if (!d || typeof d !== 'object') return '';
    const raw = String(d.actorRole ?? d.actor_role ?? '')
        .trim()
        .toLowerCase();
    if (raw === 'service-seeker' || raw === 'service_seeker') return 'service-seeker';
    if (raw === 'service-provider' || raw === 'service_provider') return 'service-provider';
    return '';
}

function readCancellationRoleFromData(d) {
    const raw =
        d.cancelledBy ??
        d.cancelled_by ??
        d.cancelInitiator ??
        d.cancel_initiator ??
        d.cancellationInitiator ??
        d.cancellation_initiator ??
        '';
    return String(raw)
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
}

function readCancellationDirectNameFromData(d) {
    const keys = [
        'cancelledByName',
        'cancelled_by_name',
        'cancelledByDisplayName',
        'cancellerName',
        'cancelInitiatorName',
        'cancel_initiator_name',
    ];
    for (const k of keys) {
        const v = d[k];
        if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}

/**
 * أي قالب نص لإلغاء طلب الأدمن: خبير | عميل | نظام | مجهول (يطابق actorRole والحقول الاحتياطية).
 * @param {ReturnType<typeof extractAdminPayload>} payload
 */
function normId(v) {
    if (v == null) return '';
    return String(v).trim();
}

/**
 * عند غياب actorRole: مطابقة معرف المُلغي مع providerId / seekerId إن وُجدت في data.
 */
function inferCancelKindFromParticipantIds(d) {
    const actorId = normId(
        d.actorUid ??
            d.actor_uid ??
            d.actorUserId ??
            d.actor_user_id ??
            d.cancelledByUserId ??
            d.cancelled_by_user_id ??
            d.initiatorUserId ??
            d.initiator_user_id
    );
    const provId = normId(d.providerId ?? d.provider_id ?? d.expertId ?? d.expert_id);
    const seekId = normId(d.seekerId ?? d.seeker_id ?? d.clientId ?? d.client_id ?? d.customerId);
    if (actorId && provId && actorId === provId) return 'expert';
    if (actorId && seekId && actorId === seekId) return 'seeker';
    return null;
}

function resolveAdminOrderCancelTemplateKind(payload, prov, seek) {
    const d = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const slug = readActorRoleSlug(d);
    if (slug === 'service-provider') return 'expert';
    if (slug === 'service-seeker') return 'seeker';
    const fromIds = inferCancelKindFromParticipantIds(d);
    if (fromIds) return fromIds;
    const role = readCancellationRoleFromData(d);
    if (role === 'SYSTEM' || role === 'ADMIN') return 'system';
    if (role === 'EXPERT' || role === 'PROVIDER' || role === 'SERVICE_PROVIDER') return 'expert';
    if (role === 'CLIENT' || role === 'SEEKER' || role === 'CUSTOMER') return 'seeker';
    const direct = readCancellationDirectNameFromData(d);
    if (direct) {
        const p = String(prov ?? '').trim();
        const s = String(seek ?? '').trim();
        if (p && direct === p) return 'expert';
        if (s && direct === s) return 'seeker';
    }
    return 'unknown';
}

/**
 * أولوية لحقول data الصريحة؛ وإلا تصحيح ترتيب bodyLocArgs.
 */
function resolveAdminOrderNarrativeBodyArgs(payload, argsRaw) {
    const d = payload.data || {};
    const prov = String(d.providerName ?? d.provider_name ?? '').trim();
    const ord = String(
        payload.orderNumber ?? d.orderNumber ?? d.order_number ?? ''
    ).trim();
    const seek = String(d.seekerName ?? d.seeker_name ?? '').trim();
    if (prov && ord && seek) {
        return [prov, ord, seek];
    }
    if (argsRaw.length) {
        const sliced = effectiveTemplateBodyArgs(
            payload.bodyLocKey,
            argsRaw,
            payload.type
        );
        if (sliced.length === 3) {
            return mapEventOrderBodyLocArgsToTemplate(sliced);
        }
        return sliced;
    }
    return inferBodyArgsFromPayload(payload);
}

export function inferBodyArgsFromPayload(payload) {
    const d = payload.data || {};
    const bk = bodyLocKeyToTemplateId(payload.bodyLocKey || '');
    const t = canonicalizeNotificationType(payload.type);

    const orderNum = String(payload.orderNumber ?? d.orderNumber ?? d.order_number ?? '').trim();
    const seeker = String(d.seekerName ?? d.seeker_name ?? '').trim();
    const prov = String(d.providerName ?? d.provider_name ?? '').trim();
    const user = String(d.userName ?? d.user_name ?? d.seekerName ?? d.seeker_name ?? '').trim();
    const applicant = String(d.applicantName ?? d.applicant_name ?? '').trim();

    /** [providerName, orderNumber, seekerName] — قوالب إشعارات الأدمن لتغيّر حالة الطلب */
    if (
        (t && ADMIN_ORDER_NARRATIVE_TYPES.has(t)) ||
        (bk && ADMIN_ORDER_NARRATIVE_TYPES.has(bk))
    ) {
        return [prov, orderNum, seeker];
    }

    if (bk === 'ADMIN_NEW_ORDER' || t === 'ADMIN_NEW_ORDER') {
        return [seeker, orderNum, prov];
    }
    if (bk === 'ADMIN_APPLICATION_SUBMITTED' || t === 'ADMIN_APPLICATION_SUBMITTED') {
        return [applicant];
    }
    if (bk === 'ORDER_ACCEPTED' || bk === 'ORDER_REJECTED') {
        return [orderNum, prov];
    }
    if (
        bk === 'ORDER_COMPLETION_REQUESTED' ||
        bk === 'ORDER_COMPLETION_CONFIRMED' ||
        bk === 'ORDER_CANCELLED' ||
        t === 'ORDER_COMPLETION_REQUESTED' ||
        t === 'ORDER_COMPLETION_CONFIRMED' ||
        t === 'ORDER_CANCELLED'
    ) {
        const slug = readActorRoleSlug(d);
        const seekerN = String(d.seekerName ?? d.seeker_name ?? '').trim();
        const provN = String(d.providerName ?? d.provider_name ?? '').trim();
        if (slug === 'service-seeker') return [orderNum, seekerN || user];
        if (slug === 'service-provider') return [orderNum, provN || user];
        return [orderNum, user];
    }
    if (t === 'NEW_REVIEW') {
        const reviewer = String(d.reviewerName ?? d.reviewer_name ?? '').trim();
        return [reviewer];
    }
    if (bk === 'ADMIN_SUPPORT_TICKET' || t === 'ADMIN_SUPPORT_TICKET') {
        const un = String(d.userName ?? d.user_name ?? d.seekerName ?? d.seeker_name ?? '').trim();
        return un ? [un] : [];
    }
    return [];
}

/**
 * @param {import('../api/notificationsApi.js').normalizeNotificationRow} row
 */
export function extractAdminPayload(row) {
    const data =
        row?.data && typeof row.data === 'object' ? { ...row.data } : {};
    if (data.actorRole == null && row?.actorRole != null) data.actorRole = row.actorRole;
    if (data.actor_role == null && row?.actor_role != null) data.actor_role = row.actor_role;
    const typeRaw =
        data.type ??
        data.notificationType ??
        row.type ??
        row.notificationType ??
        null;
    const type = canonicalizeNotificationType(typeRaw);
    const screen = normalizeKind(data.screen ?? row.screen) ?? null;

    const titleLocKey = data.titleLocKey ?? row.titleLocKey ?? null;
    const bodyLocKey = data.bodyLocKey ?? row.bodyLocKey ?? null;
    const titleLocArgs = parseLocArgs(data.titleLocArgs ?? row.titleLocArgs);
    const bodyLocArgs = parseLocArgs(data.bodyLocArgs ?? data.bodyArgs ?? row.bodyLocArgs ?? row.bodyArgs);

    return {
        type,
        screen,
        data,
        titleLocKey,
        bodyLocKey,
        titleLocArgs,
        bodyLocArgs,
        applicationId: data.applicationId ?? data.application_id ?? null,
        jobId: data.jobId ?? data.job_id ?? null,
        orderId: data.orderId ?? data.order_id ?? null,
        orderNumber: data.orderNumber ?? data.order_number ?? null,
    };
}

/**
 * مثل: `notification.ADMIN_EVENT_ORDER_ACCEPTED_BODY` → notifications.types.ADMIN_ORDER_ACCEPTED.body
 * @param {string} key
 */
export function backendLocKeyToI18nPath(key) {
    if (!key || typeof key !== 'string') return null;
    let u = key.trim();
    if (u.startsWith('notification.')) u = u.slice('notification.'.length);
    const tid = bodyLocKeyToTemplateId(key);
    if (!tid) return null;
    if (u.endsWith('_TITLE')) return `notifications.types.${tid}.title`;
    if (u.endsWith('_BODY')) return `notifications.types.${tid}.body`;
    return null;
}

/**
 * @param {ReturnType<typeof extractAdminPayload>} payload
 * @param {{ title?: string, body?: string }} [fallback]
 * @param {(key: string, vars?: object) => string} t
 */
export function formatAdminNotificationLines(payload, fallback, t) {
    const fb = fallback || {};
    const titleArgsRaw = payload.titleLocArgs || [];
    const argsRaw = payload.bodyLocArgs || [];

    /** نص جاهز من السيرفر — احتياطي إذا لم يُبنَ قالب كامل */
    const apiTitle = String(fb.title ?? '').trim();
    const apiBody = String(fb.body ?? '').trim();

    const tmplId = canonicalizeTemplateId(
        payload.type ||
            bodyLocKeyToTemplateId(payload.bodyLocKey || '') ||
            bodyLocKeyToTemplateId(payload.titleLocKey || '')
    );

    const effectiveTitleArgs = titleArgsRaw.length ? titleArgsRaw : [];
    const effectiveBodyArgs = isAdminOrderNarrativePayload(payload)
        ? resolveAdminOrderNarrativeBodyArgs(payload, argsRaw)
        : argsRaw.length
          ? effectiveTemplateBodyArgs(payload.bodyLocKey, argsRaw, payload.type)
          : inferBodyArgsFromPayload(payload);

    const cancelBodyTmpl =
        tmplId === 'ADMIN_ORDER_CANCELLED' ||
        bodyLocKeyToTemplateId(payload.bodyLocKey || '') === 'ADMIN_ORDER_CANCELLED';

    let adminCancelBodySubKey = null;
    /** @type {string[] | null} */
    let adminCancelBodyArgs = null;
    if (cancelBodyTmpl) {
        const prov = effectiveBodyArgs[0] ?? '';
        const ord = effectiveBodyArgs[1] ?? '';
        const seek = effectiveBodyArgs[2] ?? '';
        const kind = resolveAdminOrderCancelTemplateKind(payload, prov, seek);
        adminCancelBodySubKey =
            kind === 'expert'
                ? 'bodyExpert'
                : kind === 'seeker'
                  ? 'bodySeeker'
                  : kind === 'system'
                    ? 'bodySystem'
                    : 'bodyUnknown';
        adminCancelBodyArgs =
            kind === 'expert'
                ? [prov, ord, seek]
                : kind === 'seeker'
                  ? [seek, ord, prov]
                  : [ord, prov, seek];
    }

    let bodyArgsForTemplate = effectiveBodyArgs;

    const tryPath = (path) => {
        const v = t(path);
        if (v && v !== path) return v;
        return null;
    };

    let i18nTitle = '';
    let i18nBody = '';

    if (tmplId) {
        const titlePath = `notifications.types.${tmplId}.title`;
        const bodyPath =
            tmplId === 'ADMIN_ORDER_CANCELLED' && adminCancelBodySubKey
                ? `notifications.types.ADMIN_ORDER_CANCELLED.${adminCancelBodySubKey}`
                : `notifications.types.${tmplId}.body`;
        const tt = tryPath(titlePath);
        const bt = tryPath(bodyPath);
        if (tt) i18nTitle = applyIndexedArgs(tt, effectiveTitleArgs);
        if (bt) {
            const args = adminCancelBodyArgs ?? bodyArgsForTemplate;
            i18nBody = applyIndexedArgs(bt, args);
        }
    }

    if (payload.titleLocKey) {
        const p = backendLocKeyToI18nPath(payload.titleLocKey) || payload.titleLocKey;
        const got = tryPath(p);
        if (got) i18nTitle = applyIndexedArgs(got, effectiveTitleArgs);
    }
    if (payload.bodyLocKey) {
        let p = backendLocKeyToI18nPath(payload.bodyLocKey) || payload.bodyLocKey;
        if (cancelBodyTmpl && adminCancelBodySubKey) {
            p = `notifications.types.ADMIN_ORDER_CANCELLED.${adminCancelBodySubKey}`;
        }
        const got = tryPath(p);
        if (got) {
            const args = adminCancelBodyArgs ?? bodyArgsForTemplate;
            i18nBody = applyIndexedArgs(got, args);
        }
    }

    /** السيرفر يترك title/body فارغين عند الاعتماد على المفاتيح — لا نعتمد على نص السيرفر إلا إن وُجد */
    const displayFromKeysOnly = Boolean(
        payload.titleLocKey || payload.bodyLocKey || tmplId
    );

    /** نص الدعم من قوالب الواجهة فقط — لا نعرض ترجمة الباكند في title/body */
    const skipServerTextForSupport = tmplId === 'ADMIN_SUPPORT_TICKET';

    let title = (i18nTitle || '').trim();
    if (hasUnfilledIndexedPlaceholders(title)) title = '';
    if (!title.trim() && !skipServerTextForSupport) title = (apiTitle || '').trim();
    if (!title.trim()) title = '—';

    let body = (i18nBody || '').trim();
    if (hasUnfilledIndexedPlaceholders(body)) body = '';
    if (!body.trim() && !skipServerTextForSupport) body = (apiBody || '').trim();
    if (!body.trim() && displayFromKeysOnly) {
        body = t('notifications.keysOnlyMissing');
    }
    if (!body.trim()) body = '';

    /** إن لم يُبنَ النص من قالب فيه رقم الطلب، نُكمّل برقم من data (سلوك احتياطي فقط) */
    if (payload.type === 'ADMIN_NEW_ORDER' && !payload.bodyLocKey) {
        const ref = String(
            payload.orderNumber || effectiveBodyArgs[1] || payload.data?.orderNumber || ''
        ).trim();
        if (ref && !body.includes(ref)) {
            body = `${body} (${ref})`.trim();
        }
    }

    body = trimArabicNotificationBodyPreamble(body);

    return { title: title.trim() || '—', body: body.trim() || '' };
}

/**
 * معرّف الإشعار المخزّن من FCM `data` (للتعليم كمقروء عند النقر).
 * الباكند يمرّر أحداً من: notificationId | notification_id | id
 * @param {Record<string, unknown>} [data]
 */
export function getNotificationIdFromFcmData(data) {
    if (!data || typeof data !== 'object') return '';
    const v = data.notificationId ?? data.notification_id ?? data.id;
    const s = v == null ? '' : String(v).trim();
    return s;
}

/**
 * مسار SPA من حقل data في FCM — نفس منطق القائمة / النقر على الإشعار.
 * @param {Record<string, unknown>} [data]
 */
export function getPathFromRawNotificationData(data) {
    return getAdminNotificationTargetPath(extractAdminPayload({ data: data && typeof data === 'object' ? data : {} }));
}

/**
 * اسم مقدّم الطلب للبحث في قائمة الخبراء — من data أو من bodyLocArgs (مثل {0} في القالب).
 * @param {ReturnType<typeof extractAdminPayload>} payload
 */
function resolveJoinApplicationSearchName(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const d = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const fromData =
        d.applicantName ??
        d.applicant_name ??
        d.displayName ??
        d.display_name ??
        d.expertName ??
        d.expert_name ??
        d.providerName ??
        d.provider_name ??
        d.fullName ??
        d.full_name ??
        d.name;
    if (fromData != null && String(fromData).trim() !== '') return String(fromData).trim();
    const args = payload.bodyLocArgs;
    if (Array.isArray(args) && args[0] != null && String(args[0]).trim() !== '') {
        return String(args[0]).trim();
    }
    const ta = payload.titleLocArgs;
    if (Array.isArray(ta) && ta[0] != null && String(ta[0]).trim() !== '') {
        return String(ta[0]).trim();
    }
    return '';
}

/**
 * مسار React Router من حمولة الإشعار.
 * @param {ReturnType<typeof extractAdminPayload>} payload
 */
export function getAdminNotificationTargetPath(payload) {
    const { type, screen, data, applicationId, orderId } = payload;
    const appId = applicationId || data?.applicationId || data?.application_id;
    const jid = payload.jobId ?? data?.jobId ?? data?.job_id;
    const oid = orderId || data?.orderId || data?.order_id;
    const scr = normalizeKind(screen ?? data?.screen);

    if (
        type === 'ADMIN_WEBSITE_EXPERT_LEAD' ||
        scr === 'ADMIN_WEBSITE_JOBS' ||
        scr === 'WEBSITE_JOB_LEAD'
    ) {
        if (jid) {
            return `/dashboard/jobs/${encodeURIComponent(String(jid))}`;
        }
        return '/dashboard/jobs';
    }

    if (
        type === 'ADMIN_APPLICATION_SUBMITTED' ||
        scr === 'ADMIN_JOIN_REQUESTS' ||
        scr === 'APPLICATION_DETAILS'
    ) {
        const name = resolveJoinApplicationSearchName(payload);
        const params = new URLSearchParams();
        params.set('view', 'all');
        if (name) params.set('search', name);
        return `/dashboard/submitted?${params.toString()}`;
    }

    if (
        type === 'ADMIN_NEW_ORDER' ||
        scr === 'ADMIN_SERVICE_REQUESTS' ||
        (type && String(type).startsWith('ADMIN_ORDER_'))
    ) {
        if (oid) {
            return `/dashboard/service-orders/${encodeURIComponent(String(oid))}`;
        }
        return '/dashboard/service-orders';
    }

    if (
        type === 'ADMIN_SUPPORT_TICKET' ||
        scr === 'ADMIN_SUPPORT' ||
        scr === 'SUPPORT' ||
        type === 'SUPPORT_REQUEST_SENT'
    ) {
        /** لا يُفتح مسار الدعم من الإشعار — يبقى المستخدم على لوحة التحكم */
        return '/dashboard';
    }

    if (scr === 'ORDER_DETAILS') {
        if (oid) {
            return `/dashboard/service-orders/${encodeURIComponent(String(oid))}`;
        }
        return '/dashboard/service-orders';
    }

    const orderFlowTypes = new Set([
        'ORDER_ACCEPTED',
        'ORDER_REJECTED',
        'ORDER_COMPLETION_REQUESTED',
        'ORDER_COMPLETION_CONFIRMED',
        'ORDER_CANCELLED',
        'ADMIN_ORDER_ACCEPTED',
        'ADMIN_ORDER_REJECTED',
        'ADMIN_ORDER_CANCELLED',
        'ADMIN_ORDER_COMPLETION_REQUESTED',
        'ADMIN_ORDER_COMPLETED',
    ]);
    if (type && orderFlowTypes.has(type) && oid) {
        return `/dashboard/service-orders/${encodeURIComponent(String(oid))}`;
    }

    if (type === 'NEW_REVIEW') {
        return '/dashboard';
    }

    return '/dashboard';
}
