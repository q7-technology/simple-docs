/** The desktop is an ordinary API client (rule 4). The session is an
 * httpOnly cookie the browser keeps and sends; no script here can read it.
 * Every request carries X-Simple-Docs: 1, which the API asks of anything
 * that changes something. Paths are the API's (/v1/...); Caddy, and Vite's
 * proxy in development, serve the API under /api. */

export const BASE = "/api";

export class ApiError extends Error {
  readonly status: number;
  /** For programs: wrong_password, locked, last_admin, ... */
  readonly code: string;
  /** A field's name → what is wrong with it, when the request had something wrong in it. */
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** The API could not be reached, or what answered wasn't the API. */
export class Unreachable extends Error {
  constructor() {
    super("Can't reach Simple Docs right now. Check it's running, then try again.");
  }
}

/** What to tell a person about something that went wrong. The API's
 * messages are written for people, so they are shown as they come. */
export function messageOf(e: unknown): string {
  return e instanceof ApiError || e instanceof Unreachable ? e.message : "Something went wrong. Try again.";
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

export class ApiClient {
  /** Called when the API says the session has ended. */
  onSignedOut: (() => void) | null = null;
  private readonly fetcher: Fetcher;

  constructor(fetcher?: Fetcher) {
    this.fetcher = fetcher ?? ((url, init) => fetch(url, init));
  }

  /** JSON, or a file (a Blob) sent as it is. */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json", "X-Simple-Docs": "1" };
    let payload: BodyInit | undefined;
    if (body instanceof Blob) {
      headers["Content-Type"] = body.type || "application/octet-stream";
      payload = body;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await this.fetcher(BASE + path, { method, headers, body: payload, credentials: "same-origin" });
    } catch {
      throw new Unreachable();
    }
    if (res.status === 204) return undefined as T;
    let parsed: unknown;
    try {
      const text = await res.text();
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // a proxy's error page, say: not the API's own answer
      throw new Unreachable();
    }
    if (res.ok) return parsed as T;
    const error = (parsed as ErrorBody | null)?.error;
    if (!error?.code) throw new Unreachable();
    if (res.status === 401 && error.code === "signed_out") this.onSignedOut?.();
    throw new ApiError(res.status, error.code, error.message ?? `Simple Docs answered ${res.status}.`, error.fields ?? {});
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

export const api = new ApiClient();
