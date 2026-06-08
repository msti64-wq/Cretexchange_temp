import { QueryClient, QueryFunction } from "@tanstack/react-query";

export function formatApiErrorMessage(status: number, statusText: string, text: string) {
  let message = text || statusText;
  let missingFields: string[] = [];
  let invalidFields: string[] = [];

  try {
    const payload = JSON.parse(text || "{}") as {
      message?: unknown;
      error?: unknown;
      missingFields?: unknown;
      invalidFields?: unknown;
    };

    if (typeof payload.message === "string" && payload.message.trim()) {
      message = payload.message;
    } else if (typeof payload.error === "string" && payload.error.trim()) {
      message = payload.error;
    }

    if (Array.isArray(payload.missingFields)) {
      missingFields = payload.missingFields.filter((field): field is string => typeof field === "string" && field.trim().length > 0);
    }

    if (Array.isArray(payload.invalidFields)) {
      invalidFields = payload.invalidFields.filter((field): field is string => typeof field === "string" && field.trim().length > 0);
    }
  } catch {
    // Non-JSON errors should keep the original response text.
  }

  const details = [
    missingFields.length ? `Missing fields: ${missingFields.join(", ")}` : "",
    invalidFields.length ? `Invalid fields: ${invalidFields.join(", ")}` : "",
  ].filter(Boolean);

  return `${status}: ${[message, ...details].join(" ")}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(formatApiErrorMessage(res.status, res.statusText, text));
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

// Clear React Query cache once on load
if (typeof window !== 'undefined') {
  queryClient.clear();
  queryClient.invalidateQueries(); 
  queryClient.removeQueries();
  console.log('🔄 Query cache cleared once');
}
