import { queryClient } from './queryClient';
import { expandFcmDataObject, extractAdminPayload } from '../utils/adminNotifications';

/**
 * يحدد أي أجزاء من لوحة التحكم تُحدَّث عند استلام حمولة FCM / إشعار.
 * @param {ReturnType<typeof extractAdminPayload>} payload
 * @returns {Array<'home'|'serviceRequests'|'jobs'>}
 */
function scopesForNotificationPayload(payload) {
    if (!payload || typeof payload !== 'object') return ['home'];

    const t = payload.type;
    const d = payload.data && typeof payload.data === 'object' ? payload.data : {};

    if (!t) {
        if (payload.orderId ?? d.orderId ?? d.order_id) return ['home', 'serviceRequests'];
        if (payload.jobId ?? d.jobId ?? d.job_id) return ['home', 'jobs'];
        if (payload.applicationId ?? d.applicationId ?? d.application_id) return ['home', 'jobs'];
        return ['home'];
    }

    if (t === 'ADMIN_APPLICATION_SUBMITTED' || t === 'ADMIN_WEBSITE_EXPERT_LEAD') return ['home', 'jobs'];

    const orderTypes = new Set([
        'ADMIN_NEW_ORDER',
        'ADMIN_ORDER_ACCEPTED',
        'ADMIN_ORDER_REJECTED',
        'ADMIN_ORDER_CANCELLED',
        'ADMIN_ORDER_COMPLETION_REQUESTED',
        'ADMIN_ORDER_COMPLETED',
    ]);
    if (orderTypes.has(t)) return ['home', 'serviceRequests'];

    if (t === 'ADMIN_SUPPORT_TICKET') return ['home'];

    if (t === 'NEW_REVIEW') return ['home'];

    return ['home'];
}

/**
 * بعد وصول إشعار (FCM مقدّمة أو رسالة من SW): إبطال استعلامات React Query + تحديث الهوم صامتاً.
 * @param {Record<string, unknown> | null | undefined} rawData — `payload.data` من FCM
 */
export function runDashboardDataRefreshFromPushData(rawData) {
    if (typeof window === 'undefined') return;

    const expanded = expandFcmDataObject(rawData && typeof rawData === 'object' ? rawData : {});
    const payload = extractAdminPayload({ data: expanded });
    const scopes = scopesForNotificationPayload(payload);

    if (scopes.includes('serviceRequests')) {
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'serviceRequests'] });
    }
    if (scopes.includes('jobs')) {
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'jobs'] });
    }
    if (scopes.includes('home')) {
        const d = payload.data && typeof payload.data === 'object' ? payload.data : {};
        const orderIdRaw =
            payload.orderId ??
            d.orderId ??
            d.order_id;
        const orderId =
            orderIdRaw != null && String(orderIdRaw).trim() !== ''
                ? String(orderIdRaw).trim()
                : null;
        window.dispatchEvent(
            new CustomEvent('admin-dashboard-data-refresh', {
                detail: { scopes, orderId },
            })
        );
    }
}
