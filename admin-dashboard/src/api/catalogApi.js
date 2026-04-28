import api from './apiConfig';

const getHeaders = (token) => ({
    Authorization: `Bearer ${token}`
});

/** مسار كتالوج لوحة الإدارة — POST/PATCH/DELETE (مع GET الشجرة من dashboardApi). */
const DASHBOARD_CATALOG_BASE = '/manage/dashboard/catalog';

function manageCatalogHeaders(token, lang) {
    return {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(lang ? { 'x-lang': lang } : {})
    };
}

/**
 * قراءة المجال العام: `/catalog/*`.
 * تعديل/حذف/إنشاء من لوحة الإدارة: `/manage/dashboard/catalog/*` (انظر دوال الإدارة أدناه).
 */
export const catalogApi = {
    // --- Public/Catalog Endpoints ---

    /**
     * Get all categories
     * @param {string} token
     */
    getCategories: async (token) => {
        return api.get(`/catalog/categories`, {
            headers: getHeaders(token)
        });
    },

    /**
     * Get one category by ID
     * @param {string} token
     * @param {string} categoryId
     */
    getCategory: async (token, categoryId) => {
        return api.get(`/catalog/categories/${categoryId}`, {
            headers: getHeaders(token)
        });
    },

    /**
     * Get one subcategory by ID
     * @param {string} token
     * @param {string} subCategoryId
     */
    getSubCategory: async (token, subCategoryId) => {
        return api.get(`/catalog/sub-categories/${subCategoryId}`, {
            headers: getHeaders(token)
        });
    },

    /**
     * Get services for a subcategory
     * @param {string} token
     * @param {string} subCategoryId
     */
    getServices: async (token, subCategoryId) => {
        return api.get(`/catalog/sub-categories/${subCategoryId}/services`, {
            headers: getHeaders(token)
        });
    },

    // --- Dashboard catalog (POST / PATCH / DELETE) — /manage/dashboard/catalog/... ---

    createCategory: async (token, data, options = {}) => {
        return api.post(`${DASHBOARD_CATALOG_BASE}/categories`, data, {
            headers: manageCatalogHeaders(token, options.lang)
        });
    },

    updateCategory: async (token, categoryId, data, options = {}) => {
        return api.patch(`${DASHBOARD_CATALOG_BASE}/categories/${encodeURIComponent(categoryId)}`, data, {
            headers: manageCatalogHeaders(token, options.lang)
        });
    },

    deleteCategory: async (token, categoryId, options = {}) => {
        return api.delete(`${DASHBOARD_CATALOG_BASE}/categories/${encodeURIComponent(categoryId)}`, {
            headers: manageCatalogHeaders(token, options.lang)
        });
    },

    createSubCategory: async (token, categoryId, data, options = {}) => {
        return api.post(
            `${DASHBOARD_CATALOG_BASE}/categories/${encodeURIComponent(categoryId)}/sub-categories`,
            data,
            {
                headers: manageCatalogHeaders(token, options.lang)
            }
        );
    },

    updateSubCategory: async (token, subCategoryId, data, options = {}) => {
        return api.patch(`${DASHBOARD_CATALOG_BASE}/sub-categories/${encodeURIComponent(subCategoryId)}`, data, {
            headers: manageCatalogHeaders(token, options.lang)
        });
    },

    deleteSubCategory: async (token, subCategoryId, options = {}) => {
        return api.delete(`${DASHBOARD_CATALOG_BASE}/sub-categories/${encodeURIComponent(subCategoryId)}`, {
            headers: manageCatalogHeaders(token, options.lang)
        });
    },

    createService: async (token, subCategoryId, data, options = {}) => {
        return api.post(
            `${DASHBOARD_CATALOG_BASE}/sub-categories/${encodeURIComponent(subCategoryId)}/services`,
            data,
            {
                headers: manageCatalogHeaders(token, options.lang)
            }
        );
    },

    updateService: async (token, serviceId, data, options = {}) => {
        return api.patch(`${DASHBOARD_CATALOG_BASE}/services/${encodeURIComponent(serviceId)}`, data, {
            headers: manageCatalogHeaders(token, options.lang)
        });
    },

    deleteService: async (token, serviceId, options = {}) => {
        return api.delete(`${DASHBOARD_CATALOG_BASE}/services/${encodeURIComponent(serviceId)}`, {
            headers: manageCatalogHeaders(token, options.lang)
        });
    }
};
