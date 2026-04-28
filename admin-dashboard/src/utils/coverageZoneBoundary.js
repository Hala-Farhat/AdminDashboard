/**
 * مناطق التغطية — عقد boundary مع الخادم:
 * - POST/PATCH: سلسلة "lat lng, lat lng, ..." (مسافة بين lat وlng، فاصلة بين الرؤوس).
 * - GET: قد يرجع WKT POLYGON((lng lat, ...)) للعرض فقط — لا يُعاد كما هو في PATCH.
 */

/**
 * @param {string} wkt
 * @returns {string | null} محتوى الحلقة داخل POLYGON(( ... ))
 */
export function extractWktPolygonInner(wkt) {
    const s = String(wkt || '').trim();
    if (!/^POLYGON/i.test(s)) return null;
    const i = s.indexOf('((');
    if (i === -1) return null;
    const rest = s.slice(i + 2);
    const j = rest.lastIndexOf('))');
    if (j === -1) return null;
    const inner = rest.slice(0, j).trim();
    return inner || null;
}

/**
 * يحوّل حلقة WKT (رؤوس بترتيب lng lat) إلى سلسلة أزواج lat lng كما يتوقعها الـ API.
 * @param {string} wkt
 * @returns {string}
 */
export function wktPolygonInnerRingToLatLngPairString(wkt) {
    const inner = extractWktPolygonInner(String(wkt || '').trim());
    if (!inner) return '';
    const vertices = inner.split(',').map((p) => p.trim()).filter(Boolean);
    const parts = [];
    for (const vertex of vertices) {
        const nums = vertex.split(/\s+/).filter(Boolean).map(Number);
        if (nums.length < 2 || !Number.isFinite(nums[0]) || !Number.isFinite(nums[1])) continue;
        const lng = nums[0];
        const lat = nums[1];
        parts.push(`${lat} ${lng}`);
    }
    return parts.join(', ');
}

/**
 * يجهّز boundary للإرسال: إن كان WKT يُحوَّل إلى أزواج lat lng؛ وإلا يُرجع النص بعد التقليم.
 * @param {string} value
 * @returns {string}
 */
export function normalizeBoundaryForApi(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    if (/^POLYGON/i.test(s)) return wktPolygonInnerRingToLatLngPairString(s);
    return s;
}

/**
 * من حلقة Leaflet إلى سلسلة boundary للـ API (lat lng, ...، مغلقة بكرر أول نقطة إن لزم).
 * @param {Array<{ lat: number, lng: number }>} latlngs
 * @returns {string}
 */
export function leafletRingToBoundaryString(latlngs) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return '';
    const parts = latlngs.map((ll) => `${ll.lat} ${ll.lng}`);
    const first = latlngs[0];
    const last = latlngs[latlngs.length - 1];
    const closed =
        (first.lat === last.lat && first.lng === last.lng) ||
        (Math.abs(first.lat - last.lat) < 1e-9 && Math.abs(first.lng - last.lng) < 1e-9);
    if (!closed) parts.push(`${first.lat} ${first.lng}`);
    return parts.join(', ');
}

/**
 * يفك boundary إلى مصفوفة [lat, lng] لـ L.polygon.
 * يدعم WKT POLYGON((lng lat,...)) أو سلسلة أزواج lat lng.
 * @param {string} boundaryStr
 * @returns {number[][] | null}
 */
export function boundaryStringToLeafletLatLngs(boundaryStr) {
    if (!boundaryStr || typeof boundaryStr !== 'string') return null;
    try {
        const trimmed = boundaryStr.trim();
        if (!trimmed) return null;
        let inner = extractWktPolygonInner(trimmed);
        let vertexOrder = 'lnglat';
        if (inner == null) {
            inner = trimmed;
            vertexOrder = 'latlng';
        }
        const pairs = inner.split(',').map((p) => p.trim()).filter(Boolean);
        const out = [];
        for (const pair of pairs) {
            const nums = pair.split(/\s+/).filter(Boolean).map(Number);
            if (nums.length < 2 || !Number.isFinite(nums[0]) || !Number.isFinite(nums[1])) continue;
            if (vertexOrder === 'lnglat') out.push([nums[1], nums[0]]);
            else out.push([nums[0], nums[1]]);
        }
        return out.length ? out : null;
    } catch {
        return null;
    }
}
