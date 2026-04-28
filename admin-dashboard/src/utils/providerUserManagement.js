/** First usable id for PATCH /manage/dashboard/users/:identifier/deactivate|activate. */
export function pickManageId(...candidates) {
    for (const c of candidates) {
        if (c !== undefined && c !== null && c !== '') return String(c);
    }
    return null;
}

/** From GET /manage/users/provider/:id — returns boolean or null if unknown. */
export function deriveIsActiveFromProviderDetail(d) {
    if (!d || typeof d !== 'object') return null;
    const u = d.personalInfo || d.user || {};
    const sp = d.serviceProvider || d.provider || d.professionalInfo || {};
    const su = sp.user && typeof sp.user === 'object' ? sp.user : {};
    const vals = [d.isActive, u.isActive, su.isActive, sp.isActive];
    for (const v of vals) {
        if (v === false || v === 'false') return false;
    }
    for (const v of vals) {
        if (v === true || v === 'true') return true;
    }
    return null;
}

/** Readable message from axios / Nest-style error bodies. */
export function getApiErrorMessage(err) {
    const d = err?.response?.data;
    if (!d) return typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : null;
    if (typeof d.message === 'string' && d.message.trim()) return d.message.trim();
    if (Array.isArray(d.message)) {
        const parts = d.message.filter((m) => typeof m === 'string' && m.trim());
        if (parts.length) return parts.join(', ');
    }
    if (typeof d.error === 'string' && d.error.trim()) return d.error.trim();
    if (d.error && typeof d.error.message === 'string' && d.error.message.trim()) return d.error.message.trim();
    return null;
}

export function errorIndicatesAlreadyInactive(err) {
    const msg = (getApiErrorMessage(err) || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes('معطل') || msg.includes('معطّل')) return true;
    if (msg.includes('already') && (msg.includes('deactivat') || msg.includes('inactive') || msg.includes('disabled')))
        return true;
    if (msg.includes('is already') && (msg.includes('inactive') || msg.includes('disabled'))) return true;
    return false;
}

export function errorIndicatesAlreadyActive(err) {
    const msg = (getApiErrorMessage(err) || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes('already') && (msg.includes('activ') || msg.includes('enabled'))) return true;
    if (msg.includes('نشط') || msg.includes('مفعّل')) return true;
    return false;
}

/**
 * مرشحات لـ PATCH /manage/dashboard/users/:identifier/activate|deactivate
 * حيث يقبل الـ API إما firebaseUid أو providerId (بالترتيب: فيربيس ثم providerId).
 */
export function gatherDashboardUserActivateIdentifiers(row, detailPayload) {
    const out = [];
    const seen = new Set();
    const add = (v) => {
        if (v === undefined || v === null || v === '') return;
        const s = String(v);
        if (seen.has(s)) return;
        seen.add(s);
        out.push(s);
    };
    const addFromUser = (u) => {
        if (!u || typeof u !== 'object') return;
        add(u.firebaseUid);
        add(u.firebase_uid);
        add(u.uid);
    };

    if (row && typeof row === 'object') {
        add(row.manageUserId);
        add(row.firebaseUid);
        add(row.firebase_uid);
        add(row.uid);
        add(row.providerId);
    }

    if (detailPayload && typeof detailPayload === 'object') {
        const d = detailPayload;
        const sp = d.serviceProvider || d.provider || d.professionalInfo || {};
        const u = d.personalInfo || d.user || {};
        const su = sp.user && typeof sp.user === 'object' ? sp.user : null;
        add(d.firebaseUid);
        add(d.providerId);
        add(sp.providerId);
        addFromUser(u);
        if (su) addFromUser(su);
    }

    return out;
}

/** @deprecated استخدم gatherDashboardUserActivateIdentifiers */
export const gatherFirebaseUidsOnly = gatherDashboardUserActivateIdentifiers;

/**
 * @deprecated Prefer gatherDashboardUserActivateIdentifiers.
 * Ordered candidates (يشمل معرفات غير Firebase — للتوافق مع شاشات قديمة).
 */
export function gatherManageUserIds(row, detailPayload) {
    const out = [];
    const seen = new Set();
    const add = (v) => {
        if (v === undefined || v === null || v === '') return;
        const s = String(v);
        if (seen.has(s)) return;
        seen.add(s);
        out.push(s);
    };
    const addFromUser = (u) => {
        if (!u || typeof u !== 'object') return;
        add(u.firebaseUid);
        add(u.firebase_uid);
        add(u.uid);
    };

    if (detailPayload && typeof detailPayload === 'object') {
        const d = detailPayload;
        const sp = d.serviceProvider || d.provider || d.professionalInfo || {};
        const u = d.personalInfo || d.user || {};
        const su = sp.user && typeof sp.user === 'object' ? sp.user : null;
        addFromUser(u);
        addFromUser(su);
        add(d.firebaseUid);
        add(d.userId);
        add(sp.userId);
        add(sp.user_id);
        add(resolveManageUserIdFromProviderDetailData(d));
        add(resolveManageUserIdFromClientDetailData(d));
        add(u.id);
        if (su) add(su.id);
    }

    add(resolveManageUserIdFromRow(row));
    return out;
}

export async function patchManageUserActive(api, userIds, action, headers) {
    let lastErr;
    for (let i = 0; i < userIds.length; i++) {
        const uid = userIds[i];
        try {
            await api.patch(`/manage/dashboard/users/${encodeURIComponent(uid)}/${action}`, {}, { headers });
            return;
        } catch (err) {
            lastErr = err;
            const st = err?.response?.status;
            if (st === 401 || st === 403) throw err;
            const tryNext = st === 404 && i < userIds.length - 1;
            if (!tryNext) throw err;
        }
    }
    throw lastErr;
}

export function resolveManageUserId(app = {}, sp = {}) {
    const u = sp.user || app.user || {};
    const pi = app.personalInfo || sp.personalInfo || {};
    const fromUser = pickManageId(u.firebaseUid, u.firebase_uid, u.id);
    if (fromUser) return fromUser;
    const fromPersonal = pickManageId(pi.firebaseUid, pi.firebase_uid, pi.id);
    if (fromPersonal) return fromPersonal;
    return pickManageId(
        u.uid,
        app.firebaseUid,
        app.firebase_uid,
        app.userFirebaseUid,
        app.user_firebase_uid,
        app.userId,
        app.user_id,
        app.ownerUserId,
        app.owner_user_id,
        sp.firebaseUid,
        sp.firebase_uid,
        sp.userId,
        sp.user_id,
        sp.userFirebaseUid,
        sp.user_firebase_uid
    );
}

/** Re-resolve from a table row (cached rows + nested provider). */
export function resolveManageUserIdFromRow(row) {
    if (!row) return null;
    if (row.manageUserId) return String(row.manageUserId);
    const direct = pickManageId(row.firebaseUid, row.firebase_uid, row.uid, row.id);
    if (direct) return direct;
    const sp = row.provider || {};
    return resolveManageUserId(
        {
            personalInfo: row.personalInfo,
            firebaseUid: row.firebaseUid,
            userId: row.userId,
            user_id: row.user_id,
        },
        sp
    );
}

/** Service-seeker / client GET payload (no serviceProvider block). */
export function resolveManageUserIdFromClientDetailData(data) {
    if (!data || typeof data !== 'object') return null;
    const userData = data.personalInfo || data.user || {};
    return pickManageId(
        userData.firebaseUid,
        userData.firebase_uid,
        userData.id,
        userData.uid,
        data.firebaseUid,
        data.userId
    );
}

/** Same field resolution as ProviderDetails — list API often omits user ids. */
export function resolveManageUserIdFromProviderDetailData(data) {
    if (!data || typeof data !== 'object') return null;
    const spData = data.serviceProvider || data.provider || data.professionalInfo || {};
    const userData = data.personalInfo || data.user || spData?.user || {};
    const nestedUser = spData.user && typeof spData.user === 'object' ? spData.user : {};
    return pickManageId(
        userData.firebaseUid,
        userData.firebase_uid,
        userData.id,
        userData.uid,
        nestedUser.firebaseUid,
        nestedUser.firebase_uid,
        nestedUser.id,
        data.firebaseUid,
        data.userId
    );
}

export function isProviderAccountInactive(row) {
    return row && (row.isActive === false || row.isActive === 'false');
}

/** Client / service-seeker detail — same active flags as generic user payload. */
export function deriveIsActiveFromClientDetail(d) {
    if (!d || typeof d !== 'object') return null;
    const u = d.personalInfo || d.user || {};
    const vals = [d.isActive, d.active, u.isActive, u.active];
    for (const v of vals) {
        if (v === false || v === 'false') return false;
    }
    for (const v of vals) {
        if (v === true || v === 'true') return true;
    }
    return null;
}

/** Clients table row menu: only account active/disabled (no application workflow). */
export function clientRowMenuMode(row) {
    if (!row) return 'fallback';
    return isProviderAccountInactive(row) ? 'disabled' : 'active';
}
