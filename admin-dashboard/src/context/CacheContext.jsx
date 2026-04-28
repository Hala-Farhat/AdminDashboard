import { createContext, useContext, useState, useCallback } from 'react';

const CacheContext = createContext();

export const useCache = () => {
    return useContext(CacheContext);
};

export const CacheProvider = ({ children }) => {
    const [cache, setCache] = useState(new Map());

    const getData = useCallback((key) => {
        return cache.get(key);
    }, [cache]);

    const setData = useCallback((key, data) => {
        setCache(prev => {
            const newCache = new Map(prev);
            newCache.set(key, {
                data,
                timestamp: Date.now()
            });
            return newCache;
        });
    }, []);

    const invalidate = useCallback((key) => {
        setCache(prev => {
            const newCache = new Map(prev);
            // If key is a generic prefix (e.g., 'providers'), remove all keys starting with it
            // Otherwise remove exact match
            const exactMatch = newCache.delete(key);
            if (!exactMatch) {
                // Try partial matching for keys like 'providers_pending_en' invalidating 'providers'
                for (const k of newCache.keys()) {
                    if (k.startsWith(key)) {
                        newCache.delete(k);
                    }
                }
            }
            return newCache;
        });
    }, []);

    const clearCache = useCallback(() => {
        setCache(new Map());
    }, []);

    return (
        <CacheContext.Provider value={{ getData, setData, invalidate, clearCache }}>
            {children}
        </CacheContext.Provider>
    );
};
