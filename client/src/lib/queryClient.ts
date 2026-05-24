import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Throws an Error whose `message` is the server's user-facing error message —
 * extracted from a `{ message: string }` JSON body when present. Falls back to
 * status text. Status code is attached as a property so callers can branch on
 * it without parsing the message.
 */
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function throwIfResNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const contentType = res.headers.get('content-type') ?? '';
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    if (contentType.includes('application/json')) {
      const body = await res.json();
      if (body && typeof body.message === 'string') message = body.message;
    } else {
      const text = (await res.text()).trim();
      if (text) message = text;
    }
  } catch {
    // ignore parse failure — keep the statusText fallback
  }
  throw new ApiError(message, res.status);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
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
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
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
