import api from './apiConfig';

const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

/**
 * Unwraps standard API envelope: { success, message, data }.
 * @param {import('axios').AxiosResponse} res
 */
export function unwrapDashboardEnvelope(res) {
    const body = res?.data;
    if (!body || typeof body !== 'object') return null;
    if (body.success === false) {
        const msg = typeof body.message === 'string' && body.message.trim() ? body.message : 'Request failed';
        throw new Error(msg);
    }
    return body.data !== undefined ? body.data : body;
}

/** @typedef {'day'|'week'|'month'|'year'} DashboardPeriod */

function dashHeaders(token, lang) {
    const headers = {
        ...authHeaders(token),
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
    };
    if (lang) {
        headers['x-lang'] = lang;
    }
    return headers;
}

function dashParams(extra = {}) {
    return { _t: Date.now(), ...extra };
}

/**
 * GET /manage/dashboard/home — aggregated payload (optional fallback).
 * بدون page/limit أو *Limit في الـ query؛ الباكند يحدد الأحجام.
 * @param {string} token
 * @param {object} [options]
 * @param {'ar'|'en'} [options.lang]
 * @param {DashboardPeriod} [options.period]
 */
export function fetchDashboardHome(token, options = {}) {
    const { lang, period = 'month' } = options;

    return api.get('/manage/dashboard/home', {
        headers: dashHeaders(token, lang),
        params: dashParams({
            period,
            ...(lang ? { lang } : {}),
        }),
    });
}

/** GET /manage/dashboard/summary */
export function fetchDashboardSummary(token, { lang } = {}) {
    return api.get('/manage/dashboard/summary', {
        headers: dashHeaders(token, lang),
        params: dashParams(lang ? { lang } : {}),
    });
}

/**
 * بحث موحّد في لوحة الأدمن — GET /manage/dashboard/search
 * Query: q (إلزامي، 2–120 حرفاً)، limit (1–30، افتراضي 8)، lang، _t
 * @param {string} token
 * @param {{ q: string, limit?: number, lang?: 'ar'|'en' }} options
 */
export function fetchDashboardGlobalSearch(token, { q, limit = 8, lang } = {}) {
    const query = String(q ?? '').trim();
    const lim = Math.min(30, Math.max(1, Number.isFinite(Number(limit)) ? Number(limit) : 8));
    return api.get('/manage/dashboard/search', {
        headers: dashHeaders(token, lang),
        params: dashParams({
            q: query,
            limit: lim,
            ...(lang ? { lang } : {}),
        }),
    });
}

/**
 * يفك جسم الاستجابة إلى أقسام مصفوفات للعرض (مرن مع أسماء مفاتيح مختلفة من الباكند).
 * @param {unknown} data — ناتج unwrapDashboardEnvelope
 * @returns {Array<{ key: string, items: object[] }>}
 */
export function parseDashboardGlobalSearchSections(data) {
    if (data == null) return [];
    if (Array.isArray(data)) {
        return data.length ? [{ key: 'results', items: data }] : [];
    }
    if (typeof data !== 'object') return [];

    /** @type {Array<{ key: string, items: object[] }>} */
    const sections = [];
    const seen = new Set();

    const add = (key, items) => {
        if (!Array.isArray(items) || items.length === 0) return;
        const k = String(key);
        if (seen.has(k)) return;
        seen.add(k);
        sections.push({ key: k, items });
    };

    for (const [key, val] of Object.entries(data)) {
        if (key === 'meta' || key === 'total' || key === 'success' || key === 'message') continue;
        if (key === 'query' || key === 'limit') continue;

        if (key === 'fields' && val && typeof val === 'object' && !Array.isArray(val)) {
            for (const [fk, fav] of Object.entries(val)) {
                if (Array.isArray(fav) && fav.length) add(fk, fav);
            }
            continue;
        }

        if (Array.isArray(val) && val.length) {
            add(key, val);
        } else if (val && typeof val === 'object' && Array.isArray(val.items) && val.items?.length) {
            add(key, val.items);
        }
    }

    const order = [
        'serviceRequests',
        'serviceOrders',
        'orders',
        'providers',
        'experts',
        'clients',
        'users',
        'seekers',
        'customers',
        'categories',
        'subCategories',
        'applications',
        'joinRequests',
    ];
    sections.sort((a, b) => {
        const ia = order.indexOf(a.key);
        const ib = order.indexOf(b.key);
        if (ia === -1 && ib === -1) return String(a.key).localeCompare(String(b.key));
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });
    return sections;
}

/**
 * GET /manage/dashboard/join-requests
 * GET /manage/dashboard/join-requests/mine
 * @param {string} token
 * @param {object} [options]
 * @param {'ar'|'en'} [options.lang]
 * @param {boolean} [options.mine=false] - when true, fetch only UNDER_REVIEW reviewed by current admin
 * @param {number} [options.limit] - optional limit for /mine endpoint (default handled by backend)
 */
export function fetchDashboardJoinRequests(token, { lang, mine = false, limit } = {}) {
    const endpoint = mine ? '/manage/dashboard/join-requests/mine' : '/manage/dashboard/join-requests';
    const params = {
        ...dashParams(),
        ...(mine && Number.isFinite(Number(limit)) && Number(limit) > 0 ? { limit: Number(limit) } : {}),
    };

    return api.get(endpoint, {
        headers: dashHeaders(token, lang),
        params,
    });
}

/**
 * GET /manage/dashboard/join-requests/list — جدول طلبات الانضمام (الجميع) مع ملخص وتخصصات للفلتر.
 * Query (كلها اختيارية): joinPeriod all|day|week|month|year، accountStatus، applicationStatus،
 * subCategoryId، search، page، limit، lang، _t
 * @param {string} token
 * @param {object} [options]
 * @param {'ar'|'en'} [options.lang]
 * @param {number} [options.page]
 * @param {number} [options.limit]
 * @param {'all'|'day'|'week'|'month'|'year'} [options.joinPeriod='all']
 * @param {'all'|'active'|'inactive'} [options.accountStatus]
 * @param {'all'|'SUBMITTED'|'UNDER_REVIEW'|'APPROVED'|'REJECTED'} [options.applicationStatus]
 * @param {string} [options.subCategoryId]
 * @param {string} [options.search]
 */
export function fetchDashboardJoinRequestsList(token, options = {}) {
    const {
        lang,
        page = 1,
        limit = 10,
        joinPeriod = 'all',
        accountStatus = 'all',
        applicationStatus = 'all',
        subCategoryId,
        search,
    } = options;

    const params = dashParams({
        page,
        limit,
        joinPeriod,
        ...(accountStatus != null && accountStatus !== '' ? { accountStatus } : {}),
        ...(applicationStatus != null && applicationStatus !== '' ? { applicationStatus } : {}),
        ...(subCategoryId && subCategoryId !== 'all' ? { subCategoryId } : {}),
        ...(typeof search === 'string' && search.trim() ? { search: search.trim() } : {}),
        ...(lang ? { lang } : {}),
    });

    return api.get('/manage/dashboard/join-requests/list', {
        headers: dashHeaders(token, lang),
        params,
    });
}

/**
 * فلترة تاريخ التسجيل → query `createdPeriod` (all, day, week, month, year).
 * @param {'all'|'day'|'week'|'month'|'year'} preset
 * @returns {string}
 */
export function mapJobsCreatedPeriod(preset) {
    if (preset == null || preset === '' || preset === 'all') return 'all';
    return String(preset);
}

/**
 * GET /manage/dashboard/jobs — قائمة طلبات الوظائف.
 * Query: createdPeriod, cityMode, subCategoryId, readStatus, search, page, limit, lang, _t
 * @param {string} token
 * @param {object} [options]
 * @param {'ar'|'en'} [options.lang]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {'all'|'day'|'week'|'month'|'year'} [options.createdPeriod='all'] — فترة تسجيل
 * @param {'all'|'RIYADH'|'OTHER'} [options.cityMode='all']
 * @param {'all'|'unread'|'read'} [options.readStatus='all']
 * @param {string} [options.subCategoryId] — UUID التخصص
 * @param {string} [options.search] — اسم أو جوال
 */
export function fetchDashboardJobs(token, options = {}) {
    const {
        lang,
        page = 1,
        limit = 10,
        createdPeriod = 'all',
        cityMode = 'all',
        readStatus = 'all',
        subCategoryId,
        search,
    } = options;

    const params = dashParams({
        page,
        limit,
        createdPeriod: createdPeriod || 'all',
        cityMode: cityMode || 'all',
        readStatus: readStatus || 'all',
        ...(subCategoryId && subCategoryId !== 'all' ? { subCategoryId } : {}),
        ...(typeof search === 'string' && search.trim() ? { search: search.trim() } : {}),
        ...(lang ? { lang } : {}),
    });

    return api.get('/manage/dashboard/jobs', {
        headers: dashHeaders(token, lang),
        params,
    });
}

/**
 * GET /manage/dashboard/jobs/:id — تفاصيل طلب وظيفة (خبير) واحد.
 * @param {string} token
 * @param {string} jobId
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function fetchDashboardJobById(token, jobId, options = {}) {
    const { lang } = options;
    if (jobId == null || String(jobId).trim() === '') {
        return Promise.reject(new Error('jobId is required'));
    }
    return api.get(`/manage/dashboard/jobs/${encodeURIComponent(String(jobId).trim())}`, {
        headers: dashHeaders(token, lang),
        params: dashParams(lang ? { lang } : {}),
    });
}

/**
 * PATCH /manage/dashboard/jobs/:id/read — تعليم طلب التوظيف كمقروء (متابعة).
 * @param {string} token
 * @param {string} jobId
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function patchDashboardJobRead(token, jobId, options = {}) {
    const { lang } = options;
    if (jobId == null || String(jobId).trim() === '') {
        return Promise.reject(new Error('jobId is required'));
    }
    return api.patch(
        `/manage/dashboard/jobs/${encodeURIComponent(String(jobId).trim())}/read`,
        {},
        { headers: dashHeaders(token, lang), params: dashParams(lang ? { lang } : {}) }
    );
}

/**
 * GET /manage/dashboard/join-requests/:joinRequestId — تفاصيل طلب انضمام واحد (يُستخدم لحلّ applicationId → providerId).
 * @param {string} token
 * @param {string} joinRequestId — غالباً نفس applicationId في الإشعار
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function fetchDashboardJoinRequestById(token, joinRequestId, options = {}) {
    const { lang } = options;
    if (!joinRequestId || String(joinRequestId).trim() === '') {
        return Promise.reject(new Error('joinRequestId is required'));
    }
    return api.get(`/manage/dashboard/join-requests/${encodeURIComponent(String(joinRequestId).trim())}`, {
        headers: dashHeaders(token, lang),
        params: dashParams(lang ? { lang } : {}),
    });
}

/**
 * @param {import('axios').AxiosResponse} res
 * @returns {{ providerId: string, applicationId: string, raw: object } | null}
 */
export function parseJoinRequestDetailResponse(res) {
    const body = res?.data;
    if (!body || typeof body !== 'object' || body.success === false) return null;
    const d = body.data && typeof body.data === 'object' ? body.data : {};
    const providerId = d.providerId ?? d.provider_id ?? d.expertId ?? d.expert_id;
    if (providerId == null || String(providerId).trim() === '') return null;
    const applicationId =
        d.applicationId ??
        d.application_id ??
        d.joinRequestId ??
        d.join_request_id ??
        d.id ??
        '';
    return {
        providerId: String(providerId).trim(),
        applicationId: applicationId != null && applicationId !== '' ? String(applicationId).trim() : '',
        raw: d,
    };
}

/**
 * GET /manage/dashboard/my-join-requests — طلبات مرتبطة بالمراجع الحالي فقط.
 * filter: all|reviewing|approved|rejected (إن لم تُرسل تُعامل كـ all). limit افتراضي 20.
 * joinPeriod: all|day|week|month|year (مثل قائمة الجميع).
 * @param {string} token
 * @param {object} [options]
 * @param {'ar'|'en'} [options.lang]
 * @param {number} [options.page]
 * @param {number} [options.limit=20]
 * @param {'all'|'approved'|'rejected'|'reviewing'} [options.filter]
 * @param {'all'|'active'|'inactive'} [options.accountStatus]
 * @param {string} [options.subCategoryId]
 * @param {string} [options.search]
 * @param {'all'|'day'|'week'|'month'|'year'} [options.joinPeriod='all']
 */
export function fetchDashboardMyJoinRequests(token, options = {}) {
    const {
        lang,
        page = 1,
        limit = 20,
        filter,
        accountStatus,
        subCategoryId,
        search,
        joinPeriod = 'all',
    } = options;

    const params = dashParams({
        page,
        limit,
        joinPeriod,
        ...(typeof filter === 'string' && filter.trim() ? { filter: filter.trim() } : {}),
        ...(accountStatus != null && accountStatus !== '' ? { accountStatus } : {}),
        ...(subCategoryId && subCategoryId !== 'all' ? { subCategoryId } : {}),
        ...(typeof search === 'string' && search.trim() ? { search: search.trim() } : {}),
        ...(lang ? { lang } : {}),
    });

    return api.get('/manage/dashboard/my-join-requests', {
        headers: dashHeaders(token, lang),
        params,
    });
}

/**
 * GET /manage/dashboard/customers — قائمة العملاء (باحثو الخدمة) مع فلاتر وترقيم.
 * @param {string} token
 * @param {object} [options]
 * @param {'ar'|'en'} [options.lang]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20] — حتى 100
 * @param {'all'|'day'|'week'|'month'|'year'} [options.joinPeriod='all'] — على users.createdAt
 * @param {'all'|'active'|'inactive'} [options.accountStatus='all']
 * @param {string} [options.search] — اسم / بريد / جوال (يُعالج في الخادم)
 */
export function fetchDashboardCustomers(token, options = {}) {
    const { lang, page = 1, limit = 20, joinPeriod = 'all', accountStatus = 'all', search } = options;
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const params = dashParams({
        page,
        limit: safeLimit,
        joinPeriod,
        ...(accountStatus != null && accountStatus !== '' ? { accountStatus } : {}),
        ...(typeof search === 'string' && search.trim() ? { search: search.trim() } : {}),
        ...(lang ? { lang } : {}),
    });

    return api.get('/manage/dashboard/customers', {
        headers: dashHeaders(token, lang),
        params,
    });
}

/**
 * GET /manage/dashboard/customers/:firebaseUid/details — تفاصيل عميل (شخصي + عناوين).
 * @param {string} token
 * @param {string} firebaseUid
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function fetchDashboardCustomerDetails(token, firebaseUid, options = {}) {
    const { lang } = options;
    return api.get(`/manage/dashboard/customers/${encodeURIComponent(firebaseUid)}/details`, {
        headers: dashHeaders(token, lang),
        params: dashParams(lang ? { lang } : {}),
    });
}

/**
 * @param {import('axios').AxiosResponse} res
 * @returns {{ data: object[], meta: Record<string, unknown> }}
 */
export function parseDashboardCustomersResponse(res) {
    return parseDashboardExpertsResponse(res);
}

/**
 * @param {import('axios').AxiosResponse} res
 * @returns {{ data: object[], meta: Record<string, unknown>, summary: Record<string, unknown>, specializations: object[] }}
 */
/** تخصصات الفلتر من رد القائمة — يدعم مفاتيح بديلة إن لم يُرسل الباكند `specializations`. */
function pickSpecializationsArrayFromListBody(body) {
    if (!body || typeof body !== 'object') return [];
    if (Array.isArray(body.specializations) && body.specializations.length > 0) return body.specializations;
    if (Array.isArray(body.subCategories) && body.subCategories.length > 0) return body.subCategories;
    if (Array.isArray(body.filterSubCategories) && body.filterSubCategories.length > 0) {
        return body.filterSubCategories;
    }
    return [];
}

export function parseJoinRequestsListResponse(res) {
    const { data, meta, summary } = parseDashboardExpertsResponse(res);
    const body = res?.data;
    const specializations = pickSpecializationsArrayFromListBody(body);
    return { data, meta, summary, specializations };
}

/**
 * GET /manage/dashboard/service-requests — جدول طلبات الخدمة مع ملخص وتخصصات للفلتر.
 * Query: bookingPeriod all|day|week|month|year (على scheduledAt)، statusGroup، subCategoryId، search، page، limit، lang، _t
 * @param {string} token
 * @param {object} [options]
 * @param {'ar'|'en'} [options.lang]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10] — حتى 100
 * @param {'all'|'day'|'week'|'month'|'year'} [options.bookingPeriod='all']
 * @param {'all'|'awaitingExpert'|'inProgress'|'pendingCompletion'|'completed'|'cancelled'|'rejected'} [options.statusGroup='all']
 * @param {string} [options.subCategoryId]
 * @param {string} [options.search]
 */
export function fetchDashboardServiceRequests(token, options = {}) {
    const {
        lang,
        page = 1,
        limit = 10,
        bookingPeriod = 'all',
        statusGroup = 'all',
        subCategoryId,
        search,
    } = options;

    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));

    const params = dashParams({
        page,
        limit: safeLimit,
        ...(bookingPeriod && bookingPeriod !== 'all' ? { bookingPeriod } : {}),
        ...(statusGroup && statusGroup !== 'all' ? { statusGroup } : {}),
        ...(subCategoryId && subCategoryId !== 'all' ? { subCategoryId } : {}),
        ...(typeof search === 'string' && search.trim() ? { search: search.trim() } : {}),
        ...(lang ? { lang } : {}),
    });

    return api.get('/manage/dashboard/service-requests', {
        headers: dashHeaders(token, lang),
        params,
    });
}

/**
 * GET /manage/dashboard/service-requests/:orderId — تفاصيل طلب خدمة واحد.
 * orderId: UUID v4 (404 إذا غير صالح أو غير موجود).
 * Query: lang، _t (اختياري — يُضاف تلقائياً عبر dashParams).
 *
 * أهم الحقول المتوقعة في data:
 * orderNumber، status، uiBucket، statusLabel / statusLabelAr / statusLabelEn،
 * subCategoryId، specialization، scheduledAt، description، attachments، cancelReason،
 * address (تنفيذ)، location { lat, lng }، providerAddress، providerLocation،
 * client / expert (مثلاً publicId وتقييم الخبير)،
 * eventTimestamps: orderCreatedAt، expertAcceptedAt، expertRejectedAt، serviceCompletedAt، orderCancelledAt (ISO أو null)،
 * completedSteps: [{ step، at، label، labelAr، labelEn }] — step ∈
 * orderCreated | expertAccepted | expertRejected | serviceFinished | orderCancelled
 *
 * @param {string} token
 * @param {string} orderId
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function fetchDashboardServiceRequestDetails(token, orderId, options = {}) {
    const { lang } = options;
    if (!orderId || String(orderId).trim() === '') {
        return Promise.reject(new Error('orderId is required'));
    }
    return api.get(`/manage/dashboard/service-requests/${encodeURIComponent(String(orderId).trim())}`, {
        headers: dashHeaders(token, lang),
        params: dashParams(lang ? { lang } : {}),
    });
}

/**
 * @param {import('axios').AxiosResponse} res
 * @returns {{ data: object[], meta: Record<string, unknown>, summary: Record<string, unknown>, specializations: object[] }}
 */
export function parseServiceRequestsListResponse(res) {
    return parseJoinRequestsListResponse(res);
}

/**
 * @param {import('axios').AxiosResponse} res
 * @returns {{ data: object[], meta: Record<string, unknown>, specializations: object[] }}
 */
export function parseMyJoinRequestsListResponse(res) {
    const { data, meta } = parseDashboardExpertsResponse(res);
    const body = res?.data;
    const specializations =
        body && typeof body === 'object' && Array.isArray(body.specializations) ? body.specializations : [];
    return { data, meta, specializations };
}

/** @deprecated use parseMyJoinRequestsListResponse */
export function parseDashboardMyJoinRequestsResponse(res) {
    return parseMyJoinRequestsListResponse(res);
}

/**
 * GET /manage/dashboard/new-users — مخطط المستخدمين الجدد.
 * data: { period, timezone, chartAsOf?, totals: { customers, experts }, series: Point[] }.
 * كل نقطة: bucket, date, periodStart, labelAr, labelEn, customers, experts، واختياري customersCumulative / expertsCumulative.
 * الواجهة تعرض totals في الأسطورة، وتستخدم labelAr|labelEn لتسميات المحور السيني، وتضبط سقف المحور الصادي من
 * max(أقصى تراكمي في السلسلة، totals.customers، totals.experts) ثم سقف المحور مع شبكة بخطوة ثابتة من الصفر؛ المنحنى يعرض النمو عبر
 * customersCumulative / expertsCumulative (أو مجموع تراكمي من customers/experts إن غاب التراكمي من الـ API).
 */
export function fetchDashboardNewUsers(token, { lang, period = 'month' } = {}) {
    return api.get('/manage/dashboard/new-users', {
        headers: dashHeaders(token, lang),
        params: dashParams({ period, ...(lang ? { lang } : {}) }),
    });
}

/** GET /manage/dashboard/orders/summary */
export function fetchDashboardOrdersSummary(token, { lang, period = 'month' } = {}) {
    return api.get('/manage/dashboard/orders/summary', {
        headers: dashHeaders(token, lang),
        params: dashParams({ period, ...(lang ? { lang } : {}) }),
    });
}

/** GET /manage/dashboard/orders/top-services */
export function fetchDashboardTopServices(token, { lang, period = 'month' } = {}) {
    return api.get('/manage/dashboard/orders/top-services', {
        headers: dashHeaders(token, lang),
        params: dashParams({ period, ...(lang ? { lang } : {}) }),
    });
}

/** GET /manage/dashboard/orders/recent — آخر الطلبات كما يحددها الباكند (بدون period / ordersBucket / page / limit) */
export function fetchDashboardRecentOrders(token, { lang } = {}) {
    return api.get('/manage/dashboard/orders/recent', {
        headers: dashHeaders(token, lang),
        params: dashParams(),
    });
}

/** GET /manage/dashboard/experts/featured — بدون limit في الـ query؛ اللغة عبر x-lang */
export function fetchDashboardFeaturedExperts(token, { lang } = {}) {
    return api.get('/manage/dashboard/experts/featured', {
        headers: dashHeaders(token, lang),
        params: dashParams(),
    });
}

/** GET /manage/dashboard/experts/map-points — بدون limit في الـ query */
export function fetchDashboardMapPoints(token, { lang } = {}) {
    return api.get('/manage/dashboard/experts/map-points', {
        headers: dashHeaders(token, lang),
        params: dashParams(),
    });
}

/** GET /manage/dashboard/reviews/recent — بدون page/limit في الـ query */
export function fetchDashboardRecentReviews(token, { lang } = {}) {
    return api.get('/manage/dashboard/reviews/recent', {
        headers: dashHeaders(token, lang),
        params: dashParams(),
    });
}

/**
 * GET /manage/dashboard/experts — قائمة الخبراء مع فلاتر وترقيم.
 * Query (أمثلة): accountStatus=active|inactive|all، applicationStatus=APPROVED|…|all،
 * subCategoryId، search، page، limit، joinPeriod (day | week | month | year — أو إسقاطه للكل)
 * @param {string} token
 * @param {object} [options]
 * @param {'ar'|'en'} [options.lang]
 * @param {number} [options.page]
 * @param {number} [options.limit]
 * @param {string} [options.accountStatus] active | inactive | all
 * @param {string} [options.applicationStatus] APPROVED | REJECTED | UNDER_REVIEW | SUBMITTED | DRAFT | all
 * @param {string} [options.subCategoryId]
 * @param {string} [options.search]
 * @param {string} [options.joinPeriod] day | week | month | year
 */
export function fetchDashboardExperts(token, options = {}) {
    const {
        lang,
        page = 1,
        limit = 10,
        accountStatus,
        applicationStatus,
        subCategoryId,
        search,
        joinPeriod,
    } = options;

    const params = dashParams({
        page,
        limit,
        ...(accountStatus != null && accountStatus !== '' ? { accountStatus } : {}),
        ...(applicationStatus != null && applicationStatus !== '' ? { applicationStatus } : {}),
        ...(subCategoryId && subCategoryId !== 'all' ? { subCategoryId } : {}),
        ...(typeof search === 'string' && search.trim() ? { search: search.trim() } : {}),
        ...(typeof joinPeriod === 'string' && joinPeriod.trim() ? { joinPeriod: joinPeriod.trim() } : {}),
    });

    return api.get('/manage/dashboard/experts', {
        headers: dashHeaders(token, lang),
        params,
    });
}

/**
 * يختار كائن الملخص من أشكال الرد الشائعة (root، داخل data عندما يكون object، meta).
 * @param {Record<string, unknown>} body
 */
function pickSummaryFromDashboardBody(body) {
    if (!body || typeof body !== 'object') return {};
    const candidates = [
        body.summary,
        body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data.summary : null,
        body.meta && typeof body.meta === 'object' ? body.meta.summary : null,
    ].filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    const nonEmpty = candidates.find((c) => Object.keys(c).length > 0);
    return nonEmpty ?? candidates[0] ?? {};
}

/**
 * يوحّد مفاتيح الملخص (camelCase + مرادفات snake_case) لصفحات الداشبورد.
 * @param {Record<string, unknown>} summary
 */
function normalizeDashboardSummary(summary) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return {};
    const s = { ...summary };
    const firstDefined = (...keys) => {
        for (const k of keys) {
            const v = s[k];
            if (v != null && v !== '') return v;
        }
        return undefined;
    };
    const experts = firstDefined('expertsTotal', 'experts_total', 'totalExperts', 'total_experts');
    if (experts != null) s.expertsTotal = experts;
    const active = firstDefined('activeAccounts', 'active_accounts', 'active');
    if (active != null) s.activeAccounts = active;
    const inactive = firstDefined('inactiveAccounts', 'inactive_accounts', 'inactive');
    if (inactive != null) s.inactiveAccounts = inactive;
    const tReq = firstDefined('totalRequests', 'total_requests', 'requestsTotal', 'requests_total');
    if (tReq != null) s.totalRequests = tReq;
    const uRev = firstDefined('underReviewTotal', 'under_review_total');
    if (uRev != null) s.underReviewTotal = uRev;
    let requests = s.requests;
    if (requests == null && s.requestsByStatus && typeof s.requestsByStatus === 'object') {
        requests = s.requestsByStatus;
    }
    if (requests == null && s.requests_by_status && typeof s.requests_by_status === 'object') {
        requests = s.requests_by_status;
    }
    if (requests != null) s.requests = requests;
    return s;
}

/**
 * يفك رد GET /manage/dashboard/experts: data[] + meta.
 * @param {import('axios').AxiosResponse} res
 * @returns {{ data: object[], meta: Record<string, unknown>, summary: Record<string, unknown> }}
 */
export function parseDashboardExpertsResponse(res) {
    const body = res?.data;
    if (!body || typeof body !== 'object') {
        return { data: [], meta: {}, summary: {} };
    }
    if (body.success === false) {
        const msg = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : 'Request failed';
        throw new Error(msg);
    }
    const rawData = body.data;
    const data = Array.isArray(rawData)
        ? rawData
        : rawData && typeof rawData === 'object' && Array.isArray(rawData.items)
          ? rawData.items
          : rawData && typeof rawData === 'object' && Array.isArray(rawData.records)
            ? rawData.records
            : [];
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const summary = normalizeDashboardSummary(pickSummaryFromDashboardBody(body));
    return { data, meta, summary };
}

/**
 * مسار REST الوحيد لمناطق التغطية في لوحة الإدارة — GET/POST/PATCH/DELETE.
 * لا تستخدم `manage/locations/zones` أو أي مسار آخر لهذه الوظيفة.
 */
const COVERAGE_ZONES_PATH = '/manage/dashboard/coverage-zones';

/**
 * GET — قائمة مناطق التغطية (أدمن).
 * @param {string} token
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function fetchDashboardCoverageZones(token, { lang } = {}) {
    return api.get(COVERAGE_ZONES_PATH, {
        headers: dashHeaders(token, lang),
        params: dashParams(lang ? { lang } : {}),
    });
}

/**
 * يفك رد GET coverage-zones: { items, minExpertsForSufficientCoverage }.
 * @param {import('axios').AxiosResponse} res
 * @returns {{ items: object[], minExpertsForSufficientCoverage: number }}
 */
export function parseCoverageZonesListResponse(res) {
    const body = res?.data;
    if (!body || typeof body !== 'object') {
        return { items: [], minExpertsForSufficientCoverage: 3 };
    }
    if (body.success === false) {
        const msg = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : 'Request failed';
        throw new Error(msg);
    }
    const data = body.data;
    if (!data || typeof data !== 'object') {
        return { items: [], minExpertsForSufficientCoverage: 3 };
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const min = data.minExpertsForSufficientCoverage;
    const minExpertsForSufficientCoverage =
        Number.isFinite(Number(min)) && Number(min) >= 0 ? Number(min) : 3;
    return { items, minExpertsForSufficientCoverage };
}

/**
 * POST /manage/dashboard/coverage-zones
 * Body: { nameAr, nameEn, boundary, isActive? }
 * boundary: أزواج "lat lng" مفصولة بفاصلة (نفس ترتيب الخريطة). يُفضّل عدم إرسال WKT من GET كما هو؛ الواجهة تحوّله عند الحفظ.
 * @param {string} token
 * @param {Record<string, unknown>} body
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function createDashboardCoverageZone(token, body, { lang } = {}) {
    return api.post(COVERAGE_ZONES_PATH, body, {
        headers: dashHeaders(token, lang),
    });
}

/**
 * PATCH — تعديل جزئي (أسماء، boundary، isActive).
 * boundary: نفس عقد POST (lat lng, ...). تجنّب إعادة WKT من GET دون تحويل.
 * @param {string} token
 * @param {string} id
 * @param {Record<string, unknown>} body
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function patchDashboardCoverageZone(token, id, body, { lang } = {}) {
    return api.patch(`${COVERAGE_ZONES_PATH}/${encodeURIComponent(id)}`, body, {
        headers: dashHeaders(token, lang),
    });
}

/**
 * DELETE
 * @param {string} token
 * @param {string} id
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function deleteDashboardCoverageZone(token, id, { lang } = {}) {
    return api.delete(`${COVERAGE_ZONES_PATH}/${encodeURIComponent(id)}`, {
        headers: dashHeaders(token, lang),
    });
}

/** كتالوج لوحة الإدارة — GET شجرة فقط؛ التعديلات عبر `catalogApi` تحت نفس البادئة. */
const DASHBOARD_CATALOG_PATH = '/manage/dashboard/catalog';

/**
 * GET /manage/dashboard/catalog — { items: [ category → subCategories → services ] }.
 * @param {string} token
 * @param {{ lang?: 'ar'|'en' }} [options]
 */
export function fetchDashboardCatalog(token, { lang } = {}) {
    return api.get(DASHBOARD_CATALOG_PATH, {
        headers: dashHeaders(token, lang),
        params: dashParams(lang ? { lang } : {}),
    });
}

/**
 * @param {import('axios').AxiosResponse} res
 * @returns {{ items: object[] }}
 */
export function parseDashboardCatalogResponse(res) {
    const body = res?.data;
    if (!body || typeof body !== 'object') {
        return { items: [] };
    }
    if (body.success === false) {
        const msg = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : 'Request failed';
        throw new Error(msg);
    }
    const data = body.data;
    if (!data || typeof data !== 'object') {
        return { items: [] };
    }
    const items = Array.isArray(data.items) ? data.items : [];
    return { items };
}

/** POST/PATCH/DELETE للكتالوج من لوحة الإدارة — استخدم `catalogApi` (نفس المسار تحت `/manage/dashboard/catalog/`). */
