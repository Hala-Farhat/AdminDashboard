import { API_BASE_URL } from './apiConfig';

/**
 * Formats an image URL to ensure it's absolute.
 * If the URL is relative (starts with /), it prepends the API_BASE_URL.
 * If the URL is already absolute or null/undefined, it returns it as is.
 * 
 * @param {string} url - The image URL to format
 * @returns {string} The formatted absolute URL
 */
export const formatImageUrl = (url) => {
    if (!url) return null;

    // If it's already an absolute URL (starts with http or https), return it
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }

    // Handle blob URLs (used for local previews)
    if (url.startsWith('blob:')) {
        return url;
    }

    // If it's a relative path, prepend the base URL
    // Ensure we don't have double slashes
    const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const path = url.startsWith('/') ? url : `/${url}`;

    return `${baseUrl}${path}`;
};
