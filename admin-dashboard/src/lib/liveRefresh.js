/** إعدادات مشتركة لقوائم React Query — بدون polling؛ التحديث عند الإشعار أو التركيز/الإعادة اتصال */

export const listQueryDefaults = {
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
};
