import axios from 'axios';

/** Override في `.env` للتطوير المحلي مثلاً: `VITE_API_BASE_URL=http://localhost:3000` */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || 'https://api.khabeerapp.com').replace(/\/$/, '');

const api = axios.create({
    baseURL: API_BASE_URL,
});

// Add a request interceptor to include the lang parameter
api.interceptors.request.use(
    (config) => {
        const lang = localStorage.getItem('language') || 'ar';
        config.params = {
            ...config.params,
            lang: lang,
        };
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;
