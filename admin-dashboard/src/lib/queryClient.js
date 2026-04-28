import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
        },
    },
});
