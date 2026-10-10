/**
 * Thin client for the AMC Compass FastAPI backend.
 *
 * The bearer token lives in `sessionStorage`, not `localStorage`: this portal
 * can publish content to students, so a token that survives until the tab is
 * closed is a smaller blast radius than one that survives indefinitely. Nothing
 * here renders HTML from the API, so there is no injection path to read it.
 */

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

const TOKEN_KEY = "amc.clinical.token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the session simply will not persist across reloads */
  }
}

/** Called when the API says the session is gone, so the app can show the login page. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}, raw = false): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      `Cannot reach the API at ${API_URL}. Check that the backend is running and that VITE_API_URL is correct.`,
    );
  }

  // Only a request that carried a token can have an expired session; a 401
  // without one (a failed sign-in) falls through to show the API's own message.
  if (res.status === 401 && token) {
    setToken(null);
    onUnauthorized?.();
    throw new ApiError(401, "Your session has expired — please sign in again.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
        // FastAPI validation errors: name the field the doctor got wrong
        const first = body.detail[0];
        const field = Array.isArray(first.loc) ? first.loc.filter((p: unknown) => p !== "body").join(" → ") : "";
        detail = field ? `${field}: ${first.msg}` : first.msg;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (raw ? ((await res.text()) as unknown as T) : ((await res.json()) as T));
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};

/** Downloads a file that needs the bearer token (import templates). */
export async function downloadWithAuth(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Could not download ${filename}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
