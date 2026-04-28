/* eslint-disable no-undef */
/**
 * Service Worker لـ Firebase Cloud Messaging (ويب).
 * يُبنى العنوان/النص هنا بنفس قوالب الواجهة (عربي/إنجليزي) لأن SW لا يستورد من Vite.
 * يُمرَّر data كاملة مع الإشعار حتى يعمل notificationclick + التنقّل.
 *
 * إن أرسل الباكند حقل notification + data قد يظهر إشعار إضافي من FCM — نغلق الإشعارات السابقة
 * لنفس الـ registration ثم نعرض إشعارنا (واحد مرئي غالباً).
 */
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyDh2sNtgaTxIlLz9nasmzJZ9UXTJ6bmMGo',
    authDomain: 'etkan-f3ba3.firebaseapp.com',
    projectId: 'etkan-f3ba3',
    storageBucket: 'etkan-f3ba3.firebasestorage.app',
    messagingSenderId: '107080907120',
    appId: '1:107080907120:web:6abe37a7915bda2521b7b5',
});

const messaging = firebase.messaging();

/** تُحدَّث من الصفحة عبر postMessage — أولوية على lang في حمولة FCM */
var __khbUiLang = null;
self.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'khabeer-set-lang') {
        __khbUiLang = e.data.lang === 'en' ? 'en' : 'ar';
    }
});

/** مرآة لـ src/locales — يجب أن تبقى متوافقة مع notifications.types */
var NOTIF_T = {
    ar: {
        ADMIN_APPLICATION_SUBMITTED: {
            title: 'طلب انضمام جديد',
            body: 'قدّم {0} طلب انضمام جديد.',
        },
        ADMIN_WEBSITE_EXPERT_LEAD: {
            title: 'طلب وظيفة جديد من الموقع',
            body: 'تقديم طلب وظيفة جديد باسم {0}.',
        },
        ADMIN_NEW_ORDER: {
            title: 'طلب خدمة جديد',
            body: 'قام العميل {0} بطلب خدمة جديد رقم {1} من الخبير {2}.',
        },
        ADMIN_ORDER_ACCEPTED: {
            title: 'قبول طلب خدمة',
            body: 'قام الخبير {0} بقبول طلب خدمة رقم {1} الذي قدمه العميل {2}.',
        },
        ADMIN_ORDER_REJECTED: {
            title: 'رفض طلب خدمة',
            body: 'قام الخبير {0} برفض طلب خدمة رقم {1} الذي قدمه العميل {2}.',
        },
        ADMIN_ORDER_CANCELLED: {
            title: 'إلغاء طلب خدمة',
            bodyExpert:
                'قام الخبير {0} بإلغاء طلب الخدمة رقم {1} الذي قدمه العميل {2}.',
            bodySeeker:
                'قام العميل {0} بإلغاء طلب الخدمة رقم {1} الذي طلبه من الخبير {2}.',
            bodySystem: 'قام النظام بإلغاء طلب الخدمة رقم {0} بين الخبير {1} والعميل {2}.',
            bodyUnknown: 'تم إلغاء طلب الخدمة رقم {0} بين الخبير {1} والعميل {2}.',
        },
        ADMIN_ORDER_COMPLETION_REQUESTED: {
            title: 'طلب تأكيد إكمال',
            body: 'طلَب الخبير {0} تأكيد إكمال طلب خدمة رقم {1} الذي قدَّمه العميل {2}.',
        },
        ADMIN_ORDER_COMPLETED: {
            title: 'اكتمال طلب خدمة',
            body: 'تم إكمال طلب خدمة رقم {1} بين الخبير {0} والعميل {2}.',
        },
        ADMIN_SUPPORT_TICKET: {
            title: 'طلب مراسلة الدعم الفني',
            body: 'قام {0} بطلب مراسلة الدعم الفني.',
        },
        ORDER_ACCEPTED: { title: 'تم قبول الطلب', body: 'تم قبول الطلب رقم {0} من الخبير {1}.' },
        ORDER_REJECTED: { title: 'تم رفض الطلب', body: 'تم رفض الطلب رقم {0} من الخبير {1}.' },
        ORDER_COMPLETION_REQUESTED: { title: 'طلب إكمال', body: 'طُلب إكمال الطلب رقم {0} من {1}.' },
        ORDER_COMPLETION_CONFIRMED: { title: 'تأكيد الإكمال', body: 'تم تأكيد إكمال الطلب رقم {0} من {1}.' },
        ORDER_CANCELLED: { title: 'إلغاء الطلب', body: 'قام {1} بإلغاء الطلب رقم {0}.' },
        NEW_REVIEW: { title: 'تقييم جديد', body: 'تقييم جديد من {0}.' },
    },
    en: {
        ADMIN_APPLICATION_SUBMITTED: {
            title: 'New join request',
            body: '{0} submitted a new join application.',
        },
        ADMIN_WEBSITE_EXPERT_LEAD: {
            title: 'New job application from website',
            body: 'New job application submitted by {0}.',
        },
        ADMIN_NEW_ORDER: {
            title: 'New service request',
            body: 'Client {0} placed a new service request no. {1} with expert {2}.',
        },
        ADMIN_ORDER_ACCEPTED: {
            title: 'Service request accepted',
            body: 'Expert {0} accepted service request no. {1} placed by client {2}.',
        },
        ADMIN_ORDER_REJECTED: {
            title: 'Service request rejected',
            body: 'Expert {0} rejected service request no. {1} placed by client {2}.',
        },
        ADMIN_ORDER_CANCELLED: {
            title: 'Service request cancelled',
            bodyExpert:
                'Expert {0} cancelled service request no. {1} placed by client {2}.',
            bodySeeker:
                'Client {0} cancelled service request no. {1} requested from expert {2}.',
            bodySystem:
                'The system cancelled service request no. {0} between expert {1} and client {2}.',
            bodyUnknown: 'Service request no. {0} was cancelled between expert {1} and client {2}.',
        },
        ADMIN_ORDER_COMPLETION_REQUESTED: {
            title: 'Completion confirmation requested',
            body: 'Expert {0} requested completion confirmation for service request no. {1} from client {2}.',
        },
        ADMIN_ORDER_COMPLETED: {
            title: 'Service request completed',
            body: 'Service request no. {1} was completed between expert {0} and client {2}.',
        },
        ADMIN_SUPPORT_TICKET: {
            title: 'Support messaging request',
            body: '{0} requested to message support.',
        },
        ORDER_ACCEPTED: { title: 'Order accepted', body: 'Order {0} was accepted by provider {1}.' },
        ORDER_REJECTED: { title: 'Order rejected', body: 'Order {0} was rejected by provider {1}.' },
        ORDER_COMPLETION_REQUESTED: {
            title: 'Completion requested',
            body: 'Completion was requested for order {0} by {1}.',
        },
        ORDER_COMPLETION_CONFIRMED: {
            title: 'Completion confirmed',
            body: 'Completion was confirmed for order {0} by {1}.',
        },
        ORDER_CANCELLED: { title: 'Order cancelled', body: '{1} cancelled order {0}.' },
        NEW_REVIEW: { title: 'New review', body: 'New review from {0}.' },
    },
};

function canonicalizeTemplateId(id) {
    if (id == null || id === '') return null;
    var u = String(id)
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
    if (u === 'ORDER_CANCELED') return 'ORDER_CANCELLED';
    if (u === 'NEW_ORDER') return 'ADMIN_NEW_ORDER';
    if (u === 'SUPPORT_REQUEST_SENT') return 'ADMIN_SUPPORT_TICKET';
    return u;
}

function normType(raw) {
    if (raw == null || raw === '') return null;
    return String(raw)
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
}

function pickLang(d) {
    if (__khbUiLang) return __khbUiLang;
    var l = String(d.lang || d.language || 'ar')
        .trim()
        .toLowerCase();
    return l === 'en' ? 'en' : 'ar';
}

function parseLocArgs(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.map(function (x) {
        return String(x);
    });
    if (typeof raw === 'string') {
        try {
            var j = JSON.parse(raw);
            if (Array.isArray(j)) return j.map(function (x) {
                return String(x);
            });
        } catch (e) {
            return [raw];
        }
    }
    return [String(raw)];
}

function locKeyToId(key) {
    if (!key) return null;
    var u = String(key).trim();
    if (u.indexOf('notification.') === 0) u = u.slice('notification.'.length);
    var ev = u.match(/^ADMIN_EVENT_(ORDER_[A-Z_]+)_(TITLE|BODY)$/);
    if (ev) return canonicalizeTemplateId('ADMIN_' + ev[1]);
    var base = null;
    if (u.length > 6 && u.slice(-6) === '_TITLE') base = u.slice(0, -6);
    else if (u.length > 5 && u.slice(-5) === '_BODY') base = u.slice(0, -5);
    return base ? canonicalizeTemplateId(base) : null;
}

function applyIndexed(template, args) {
    if (typeof template !== 'string' || !args || !args.length) return template;
    var s = template;
    args.forEach(function (a, i) {
        s = s.split('{' + i + '}').join(String(a));
    });
    return s;
}

function hasPlaceholders(s) {
    return typeof s === 'string' && /\{[0-9]+\}/.test(s);
}

function isAdminOrderNarrative(id) {
    if (!id) return false;
    var s = String(id);
    return (
        s === 'ADMIN_ORDER_ACCEPTED' ||
        s === 'ADMIN_ORDER_REJECTED' ||
        s === 'ADMIN_ORDER_CANCELLED' ||
        s === 'ADMIN_ORDER_COMPLETION_REQUESTED' ||
        s === 'ADMIN_ORDER_COMPLETED'
    );
}

function mapEventOrderBodyLocArgsToTemplate(args) {
    var raw = args.map(function (x) {
        return String(x);
    });
    if (raw.length !== 3) return raw;
    return [raw[2], raw[0], raw[1]];
}

function resolveNarrativeBodyArgs(d, bodyArgsRaw) {
    var prov = String(d.providerName || d.provider_name || '').trim();
    var ord = String(d.orderNumber || d.order_number || '').trim();
    var seek = String(d.seekerName || d.seeker_name || '').trim();
    if (prov && ord && seek) {
        return [prov, ord, seek];
    }
    if (bodyArgsRaw.length) {
        var sliced = effectiveSliceBodyArgs(d.bodyLocKey, bodyArgsRaw, d);
        if (sliced.length === 3) {
            return mapEventOrderBodyLocArgsToTemplate(sliced);
        }
        return sliced;
    }
    return inferBodyArgs(d);
}

function inferBodyArgs(d) {
    var bk = locKeyToId(d.bodyLocKey || '');
    var t = canonicalizeTemplateId(normType(d.type));
    var num = String(d.orderNumber || d.order_number || '').trim();
    var seeker = String(d.seekerName || d.seeker_name || '').trim();
    var prov = String(d.providerName || d.provider_name || '').trim();
    var user = String(d.userName || d.user_name || d.seekerName || d.seeker_name || '').trim();
    var applicant = String(d.applicantName || d.applicant_name || '').trim();

    if (isAdminOrderNarrative(t) || isAdminOrderNarrative(bk)) {
        return [prov, num, seeker];
    }

    if (bk === 'ADMIN_NEW_ORDER' || t === 'ADMIN_NEW_ORDER') {
        return [seeker, num, prov];
    }
    if (bk === 'ADMIN_APPLICATION_SUBMITTED' || t === 'ADMIN_APPLICATION_SUBMITTED') {
        return [applicant];
    }
    if (bk === 'ADMIN_WEBSITE_EXPERT_LEAD' || t === 'ADMIN_WEBSITE_EXPERT_LEAD') {
        return [applicant];
    }
    if (bk === 'ORDER_ACCEPTED' || bk === 'ORDER_REJECTED') {
        return [num, prov];
    }
    if (
        bk === 'ORDER_COMPLETION_REQUESTED' ||
        bk === 'ORDER_COMPLETION_CONFIRMED' ||
        bk === 'ORDER_CANCELLED' ||
        t === 'ORDER_COMPLETION_REQUESTED' ||
        t === 'ORDER_COMPLETION_CONFIRMED' ||
        t === 'ORDER_CANCELLED'
    ) {
        var slugOc = readActorRoleSlugSw(d);
        var seekerOc = String(d.seekerName || d.seeker_name || '').trim();
        var provOc = String(d.providerName || d.provider_name || '').trim();
        if (slugOc === 'service-seeker') return [num, seekerOc || user];
        if (slugOc === 'service-provider') return [num, provOc || user];
        return [num, user];
    }
    if (t === 'NEW_REVIEW') {
        return [String(d.reviewerName || d.reviewer_name || '').trim()];
    }
    if (bk === 'ADMIN_SUPPORT_TICKET' || t === 'ADMIN_SUPPORT_TICKET') {
        var un = String(d.userName || d.user_name || d.seekerName || d.seeker_name || '').trim();
        return un ? [un] : [];
    }
    return [];
}

/** عقد الباكند: قبول/رفض قد يمرران مصفوفة 4 عناصر — القالب يستخدم [0] و [2] */
function effectiveSliceBodyArgs(bodyLocKey, args, d) {
    var raw = args.map(function (x) {
        return String(x);
    });
    var bk = locKeyToId(bodyLocKey || '');
    var t = canonicalizeTemplateId(normType(d.type));
    var isAR =
        bk === 'ORDER_ACCEPTED' ||
        bk === 'ORDER_REJECTED' ||
        t === 'ORDER_ACCEPTED' ||
        t === 'ORDER_REJECTED';
    if (isAR && raw.length >= 4) {
        return [raw[0], raw[2]];
    }
    return raw;
}

function readActorRoleSlugSw(d) {
    if (!d || typeof d !== 'object') return '';
    var raw = String(d.actorRole || d.actor_role || '')
        .trim()
        .toLowerCase();
    if (raw === 'service-seeker' || raw === 'service_seeker') return 'service-seeker';
    if (raw === 'service-provider' || raw === 'service_provider') return 'service-provider';
    return '';
}

function readCancellationDirectNameSw(d) {
    var keys = [
        'cancelledByName',
        'cancelled_by_name',
        'cancelledByDisplayName',
        'cancellerName',
        'cancelInitiatorName',
        'cancel_initiator_name',
    ];
    var i;
    for (i = 0; i < keys.length; i++) {
        var v = d[keys[i]];
        if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}

function readCancellationRoleFromDataSw(d) {
    var raw =
        d.cancelledBy ||
        d.cancelled_by ||
        d.cancelInitiator ||
        d.cancel_initiator ||
        d.cancellationInitiator ||
        d.cancellation_initiator ||
        '';
    return String(raw)
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
}

function normIdSw(v) {
    if (v == null) return '';
    return String(v).trim();
}

function inferCancelKindFromParticipantIdsSw(d) {
    var actorId = normIdSw(
        d.actorUid ||
            d.actor_uid ||
            d.actorUserId ||
            d.actor_user_id ||
            d.cancelledByUserId ||
            d.cancelled_by_user_id ||
            d.initiatorUserId ||
            d.initiator_user_id
    );
    var provId = normIdSw(d.providerId || d.provider_id || d.expertId || d.expert_id);
    var seekId = normIdSw(d.seekerId || d.seeker_id || d.clientId || d.client_id || d.customerId);
    if (actorId && provId && actorId === provId) return 'expert';
    if (actorId && seekId && actorId === seekId) return 'seeker';
    return null;
}

/** يطابق resolveAdminOrderCancelTemplateKind في adminNotifications.js */
function resolveAdminOrderCancelKindSw(d, prov, seek) {
    var slug = readActorRoleSlugSw(d);
    if (slug === 'service-provider') return 'expert';
    if (slug === 'service-seeker') return 'seeker';
    var fromIds = inferCancelKindFromParticipantIdsSw(d);
    if (fromIds) return fromIds;
    var role = readCancellationRoleFromDataSw(d);
    if (role === 'SYSTEM' || role === 'ADMIN') return 'system';
    if (role === 'EXPERT' || role === 'PROVIDER' || role === 'SERVICE_PROVIDER') return 'expert';
    if (role === 'CLIENT' || role === 'SEEKER' || role === 'CUSTOMER') return 'seeker';
    var direct = readCancellationDirectNameSw(d);
    if (direct) {
        var p = String(prov || '').trim();
        var s = String(seek || '').trim();
        if (p && direct === p) return 'expert';
        if (s && direct === s) return 'seeker';
    }
    return 'unknown';
}

function buildAdminOrderCancelBodySw(TC, d, effBody) {
    var p0 = effBody[0] != null ? effBody[0] : '';
    var o0 = effBody[1] != null ? effBody[1] : '';
    var s0 = effBody[2] != null ? effBody[2] : '';
    var kind = resolveAdminOrderCancelKindSw(d, p0, s0);
    if (kind === 'expert' && TC.bodyExpert) return applyIndexed(TC.bodyExpert, [p0, o0, s0]);
    if (kind === 'seeker' && TC.bodySeeker) return applyIndexed(TC.bodySeeker, [s0, o0, p0]);
    if (kind === 'system' && TC.bodySystem) return applyIndexed(TC.bodySystem, [o0, p0, s0]);
    if (TC.bodyUnknown) return applyIndexed(TC.bodyUnknown, [o0, p0, s0]);
    return '';
}

function buildLinesFromData(d) {
    var lang = pickLang(d);
    var TT = NOTIF_T[lang] || NOTIF_T.ar;
    /** دائماً من قوالب SW — لا نعرض عنوان/نص الباكند المُرسلَين مع FCM */
    var supportEarly = canonicalizeTemplateId(normType(d.type || ''));
    if (supportEarly === 'ADMIN_SUPPORT_TICKET' && TT.ADMIN_SUPPORT_TICKET) {
        var tArg = parseLocArgs(d.titleLocArgs);
        var bArg = inferBodyArgs(d);
        if (!bArg.length) {
            bArg = [lang === 'en' ? 'User' : 'مستخدم'];
        }
        var st = applyIndexed(TT.ADMIN_SUPPORT_TICKET.title, tArg);
        var sb = applyIndexed(TT.ADMIN_SUPPORT_TICKET.body, bArg);
        if (hasPlaceholders(st)) st = TT.ADMIN_SUPPORT_TICKET.title;
        if (hasPlaceholders(sb)) sb = TT.ADMIN_SUPPORT_TICKET.body;
        return { title: st, body: sb };
    }
    var titleArgs = parseLocArgs(d.titleLocArgs);
    var bodyArgsRaw = parseLocArgs(d.bodyLocArgs);
    var tmplId = canonicalizeTemplateId(
        normType(d.type) || locKeyToId(d.bodyLocKey || '') || locKeyToId(d.titleLocKey || '')
    );
    var bk = locKeyToId(d.bodyLocKey || '');
    var tt = canonicalizeTemplateId(normType(d.type));
    var isNarr = isAdminOrderNarrative(tt) || isAdminOrderNarrative(bk);
    var effBody = isNarr
        ? resolveNarrativeBodyArgs(d, bodyArgsRaw)
        : bodyArgsRaw.length
          ? effectiveSliceBodyArgs(d.bodyLocKey, bodyArgsRaw, d)
          : inferBodyArgs(d);

    var typeCanon = canonicalizeTemplateId(normType(d.type || ''));
    var isCancelTmpl =
        tmplId === 'ADMIN_ORDER_CANCELLED' ||
        bk === 'ADMIN_ORDER_CANCELLED' ||
        typeCanon === 'ADMIN_ORDER_CANCELLED';
    var cancelBodyBuilt =
        isCancelTmpl && TT.ADMIN_ORDER_CANCELLED
            ? buildAdminOrderCancelBodySw(TT.ADMIN_ORDER_CANCELLED, d, effBody)
            : '';

    var i18nTitle = '';
    var i18nBody = '';

    if (tmplId && TT[tmplId]) {
        i18nTitle = applyIndexed(TT[tmplId].title, titleArgs);
        if (tmplId === 'ADMIN_ORDER_CANCELLED' && cancelBodyBuilt) {
            i18nBody = cancelBodyBuilt;
        } else {
            i18nBody = applyIndexed(TT[tmplId].body, effBody);
        }
    }
    if (d.titleLocKey) {
        var tid = locKeyToId(d.titleLocKey);
        if (tid && TT[tid]) i18nTitle = applyIndexed(TT[tid].title, titleArgs);
    }
    if (d.bodyLocKey) {
        var bid = locKeyToId(d.bodyLocKey);
        if (bid && TT[bid]) {
            if (bid === 'ADMIN_ORDER_CANCELLED' && cancelBodyBuilt) {
                i18nBody = cancelBodyBuilt;
            } else {
                i18nBody = applyIndexed(TT[bid].body, effBody);
            }
        }
    }

    var apiTitle = String(d.title || '').trim();
    var apiBody = String(d.body || '').trim();
    var keysOnly = Boolean(d.titleLocKey || d.bodyLocKey || tmplId);

    var title = (i18nTitle || '').trim();
    if (hasPlaceholders(title)) title = '';
    if (!title) title = apiTitle;
    if (!title) title = lang === 'en' ? 'Khabeer' : 'خبير';

    var body = (i18nBody || '').trim();
    if (hasPlaceholders(body)) body = '';
    if (!body) body = apiBody;
    if (!body && keysOnly) {
        body = lang === 'en' ? 'Could not display notification text.' : 'لا يمكن عرض نص الإشعار.';
    }
    if (lang === 'ar' && body) {
        body = body.replace(/^في\s+طلب\s+الخدمة\s*[،,.\s]*/u, '').trim();
    }

    return { title: title, body: body };
}

/** يطابق getAdminNotificationTargetPath — يُستدعى بنفس data الممرَّرة للإشعار */
function pathFromNotificationData(d) {
    if (!d || typeof d !== 'object') return '/dashboard';
    var type = canonicalizeTemplateId(
        String(d.type || '')
            .trim()
            .toUpperCase()
            .replace(/-/g, '_')
    );
    var screen = String(d.screen || '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
    var appId = d.applicationId || d.application_id;
    var oid = d.orderId || d.order_id || d.orderUID || d.orderUid;
    var jobId = d.jobId || d.job_id;

    if (type === 'ADMIN_WEBSITE_EXPERT_LEAD' || screen === 'ADMIN_WEBSITE_JOBS' || screen === 'WEBSITE_JOB_LEAD') {
        if (jobId) return '/dashboard/jobs/' + encodeURIComponent(String(jobId));
        return '/dashboard/jobs';
    }

    if (type === 'ADMIN_APPLICATION_SUBMITTED' || screen === 'ADMIN_JOIN_REQUESTS' || screen === 'APPLICATION_DETAILS') {
        var applicantName =
            d.applicantName ||
            d.applicant_name ||
            d.displayName ||
            d.display_name ||
            d.expertName ||
            d.expert_name ||
            d.providerName ||
            d.provider_name ||
            d.fullName ||
            d.name;
        if (applicantName == null || String(applicantName).trim() === '') {
            var rawArgs = d.bodyLocArgs || d.bodyArgs || d.titleLocArgs;
            if (typeof rawArgs === 'string') {
                try {
                    var parsedArgs = JSON.parse(rawArgs);
                    if (Array.isArray(parsedArgs) && parsedArgs[0] != null) applicantName = parsedArgs[0];
                } catch (e) {}
            } else if (Array.isArray(rawArgs) && rawArgs[0] != null) {
                applicantName = rawArgs[0];
            }
        }
        var qsJoin = 'view=all';
        if (applicantName != null && String(applicantName).trim() !== '') {
            qsJoin += '&search=' + encodeURIComponent(String(applicantName).trim());
        }
        return '/dashboard/submitted?' + qsJoin;
    }
    var isAdminOrderType = type && String(type).indexOf('ADMIN_ORDER_') === 0;
    if (type === 'ADMIN_NEW_ORDER' || screen === 'ADMIN_SERVICE_REQUESTS' || isAdminOrderType) {
        if (oid) return '/dashboard/service-orders/' + encodeURIComponent(String(oid));
        return '/dashboard/service-orders';
    }
    if (type === 'ADMIN_SUPPORT_TICKET' || screen === 'ADMIN_SUPPORT' || screen === 'SUPPORT' || type === 'SUPPORT_REQUEST_SENT') {
        return '/dashboard';
    }
    if (screen === 'ORDER_DETAILS') {
        if (oid) return '/dashboard/service-orders/' + encodeURIComponent(String(oid));
        return '/dashboard/service-orders';
    }
    var orderFlow =
        type === 'ORDER_ACCEPTED' ||
        type === 'ORDER_REJECTED' ||
        type === 'ORDER_COMPLETION_REQUESTED' ||
        type === 'ORDER_COMPLETION_CONFIRMED' ||
        type === 'ORDER_CANCELLED' ||
        isAdminOrderType;
    if (orderFlow && oid) {
        return '/dashboard/service-orders/' + encodeURIComponent(String(oid));
    }
    if (type === 'NEW_REVIEW') {
        return '/dashboard';
    }
    if (d.path && String(d.path).charAt(0) === '/') return String(d.path);
    return '/dashboard';
}

/** كائن واحد يُمرَّر لـ Notification.data (نفس حقول FCM data) */
function dataForNotification(payload) {
    var src = payload.data && typeof payload.data === 'object' ? payload.data : {};
    var out = {};
    Object.keys(src).forEach(function (k) {
        out[k] = src[k];
    });
    /** بعض السيرفرات يضعون حقولاً داخل data كسلسلة JSON — نرفعها للجذر حتى يُقرأ actorRole وغيره */
    if (typeof out.data === 'string' && /^\s*\{/.test(out.data)) {
        try {
            var inner = JSON.parse(out.data);
            if (inner && typeof inner === 'object') {
                Object.keys(inner).forEach(function (k) {
                    if (out[k] == null || out[k] === '') out[k] = inner[k];
                });
            }
        } catch (e) {}
    }
    return out;
}

function stableTag(d) {
    var t = String(d.type || 'n');
    var id = d.orderId || d.order_id || d.applicationId || d.application_id || d.fcmMessageId || '';
    return 'khb-' + t + '-' + String(id || 'x') + '-' + String(Date.now());
}

/** يُعلم تبويبات SPA المفتوحة بتحديث البيانات (نفس منطق FCM في المقدمة) */
function notifyOpenClientsDashboardRefresh(pushData) {
    if (!self.clients || !self.clients.matchAll) return Promise.resolve();
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        clientList.forEach(function (client) {
            try {
                client.postMessage({ type: 'khabeer-dashboard-refresh', pushData: pushData });
            } catch (e) {}
        });
    });
}

messaging.onBackgroundMessage(function (payload) {
    var merged = dataForNotification(payload);
    var lines = buildLinesFromData(merged);

    var title = lines.title;
    var body = lines.body;
    var tag = stableTag(merged);

    var opts = {
        body: body || undefined,
        icon: '/favicon.svg',
        data: merged,
        tag: tag,
        renotify: true,
    };

    var show = function () {
        return self.registration.showNotification(title, opts);
    };
    var afterShow = function () {
        return notifyOpenClientsDashboardRefresh(merged);
    };
    if (self.registration.getNotifications) {
        return self.registration.getNotifications().then(function (list) {
            list.forEach(function (n) {
                try {
                    n.close();
                } catch (e) {}
            });
            return Promise.resolve(show()).then(afterShow);
        });
    }
    return Promise.resolve(show()).then(afterShow);
});

/** نفس حقول FCM في المنبثق — للمطابقة مع GET /notifications عند فتح رابط بدون تبويب */
function notificationMatchFromData(d) {
    if (!d || typeof d !== 'object') return '';
    var o = {};
    if (d.type) o.type = d.type;
    var oid = d.orderId || d.order_id;
    if (oid) o.orderId = oid;
    var aid = d.applicationId || d.application_id;
    if (aid) o.applicationId = aid;
    try {
        if (!Object.keys(o).length) return '';
        return encodeURIComponent(JSON.stringify(o));
    } catch (e) {
        return '';
    }
}

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var raw = event.notification.data;
    var data = raw && typeof raw === 'object' ? raw : {};
    if (typeof raw === 'string') {
        try {
            data = JSON.parse(raw);
        } catch (e) {
            data = {};
        }
    }
    var path = pathFromNotificationData(data);
    var nid = data.notificationId || data.notification_id || data.id;
    var payload = { type: 'khabeer-navigate', path: path, pushData: data };
    if (nid) payload.notificationId = String(nid);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            var origin = self.location.origin;
            var pick = null;
            for (var a = 0; a < clientList.length; a++) {
                var x = clientList[a];
                if (x.url.indexOf(origin) === 0 && x.focused) {
                    pick = x;
                    break;
                }
            }
            if (!pick) {
                for (var b = 0; b < clientList.length; b++) {
                    var y = clientList[b];
                    if (y.url.indexOf(origin) === 0) {
                        pick = y;
                        break;
                    }
                }
            }
            if (pick && typeof pick.focus === 'function') {
                return pick.focus().then(
                    function () {
                        try {
                            pick.postMessage(payload);
                        } catch (e) {}
                    },
                    function () {
                        try {
                            pick.postMessage(payload);
                        } catch (e) {}
                    }
                );
            }
            if (self.clients && self.clients.openWindow) {
                try {
                    var u = new URL(path, self.location.origin);
                    if (nid) {
                        u.searchParams.set('notificationReadId', String(nid));
                    } else {
                        var mc = notificationMatchFromData(data);
                        if (mc) u.searchParams.set('notificationMatch', mc);
                    }
                    return self.clients.openWindow(u.href);
                } catch (e2) {
                    return self.clients.openWindow(self.location.origin + path);
                }
            }
            return Promise.resolve();
        })
    );
});
