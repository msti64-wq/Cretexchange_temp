import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: any
): Promise<Response>;
export async function apiRequest(
  url: string,
  options?: RequestInit
): Promise<Response>;
export async function apiRequest(
  urlOrMethod: string,
  urlOrOptions?: string | RequestInit,
  data?: any
): Promise<Response> {
  // Handle both calling patterns
  let url: string;
  let options: RequestInit;
  
  if (typeof urlOrOptions === 'string') {
    // Called as apiRequest(method, url, data)
    url = urlOrOptions;
    options = {
      method: urlOrMethod,
      ...(data && { body: JSON.stringify(data) })
    };
  } else {
    // Called as apiRequest(url, options)
    url = urlOrMethod;
    options = urlOrOptions || {};
  }
  const token = localStorage.getItem('authToken');
  const headers: any = {
    ...options.headers,
    "Content-Type": "application/json",
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Published apps serve both frontend and backend from same domain
  // No need for cross-origin requests in production
  const fullUrl = url;
  
  const res = await fetch(fullUrl, {
    ...options,
    headers,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem('authToken');
    const headers: any = {};
    
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Published apps serve both frontend and backend from same domain
    const url = queryKey[0] as string; // Use first element directly instead of joining
    
    const res = await fetch(url, {
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0, // Force fresh data every time
      gcTime: 0, // Don't cache at all
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// EMERGENCY: Force complete cache clearing every time to eliminate phantom data
if (typeof window !== 'undefined') {
  queryClient.clear();
  queryClient.invalidateQueries();
  queryClient.removeQueries();
  
  // Clear all possible storage locations
  try {
    localStorage.clear();
    sessionStorage.clear();
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
  } catch (e) {
    console.warn('Cache clearing failed:', e);
  }
  
  console.log('🔥 EMERGENCY CACHE CLEAR - All caches forcibly cleared');
}

