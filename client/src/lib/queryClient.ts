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

  // Auto-detect published environment and use correct backend URL
  const isPublishedApp = window.location.hostname.endsWith('.replit.app');
  const apiBaseUrl = isPublishedApp ? 'https://washoutpro.toddkitta.repl.co' : '';
  const fullUrl = url.startsWith('/api') && apiBaseUrl ? `${apiBaseUrl}${url}` : url;
  
  // Debug logging for published app
  console.log('🚀 apiRequest DEBUG:', {
    originalUrl: url,
    hostname: window.location.hostname,
    isPublishedApp,
    apiBaseUrl,
    fullUrl,
    isApiCall: url.startsWith('/api'),
    hasBaseUrl: !!apiBaseUrl
  });
  
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

    // Auto-detect published environment and use correct backend URL
    const url = queryKey.join("/") as string;
    const isPublishedApp = window.location.hostname.endsWith('.replit.app');
    const apiBaseUrl = isPublishedApp ? 'https://washoutpro.toddkitta.repl.co' : '';
    const fullUrl = url.startsWith('/api') && apiBaseUrl ? `${apiBaseUrl}${url}` : url;
    
    const res = await fetch(fullUrl, {
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
