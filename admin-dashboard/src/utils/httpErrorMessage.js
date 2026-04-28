/** Human-readable message from axios / Nest-style error bodies. */
export function getHttpErrorMessage(error) {
    const d = error?.response?.data;
    if (d == null) return error?.message || '';
    const m = d.message;
    if (typeof m === 'string' && m.trim()) return m.trim();
    if (Array.isArray(m) && m.length) return m.map(String).join(', ');
    if (typeof d.error === 'string' && d.error.trim()) return d.error.trim();
    const status = error?.response?.status;
    if (status === 401) return 'Unauthorized';
    if (status === 403) return 'Forbidden';
    if (status === 404) return 'Not found';
    return error?.message || '';
}
