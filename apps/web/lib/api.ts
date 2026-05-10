const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getApiUrl() {
  if (typeof window === "undefined") return CONFIGURED_API_URL;
  const configured = new URL(CONFIGURED_API_URL);
  const browserHost = window.location.hostname;
  const configuredIsLoopback = ["localhost", "127.0.0.1", "0.0.0.0"].includes(configured.hostname);
  const browserIsLoopback = ["localhost", "127.0.0.1", "0.0.0.0"].includes(browserHost);
  if (configuredIsLoopback && !browserIsLoopback) {
    configured.hostname = browserHost;
  }
  return configured.toString().replace(/\/$/, "");
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ApiOptions = RequestInit & {
  authRequired?: boolean;
  skipJson?: boolean;
};

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ctd_token");
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("ctd_token");
  window.localStorage.removeItem("ctd_restaurant_id");
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export function getStoredRestaurantId() {
  if (typeof window === "undefined") return null;
  const explicit = window.localStorage.getItem("ctd_restaurant_id");
  if (explicit) return explicit;
  const token = getStoredToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(window.atob(token.split(".")[1] ?? ""));
    return payload.restaurant_id ?? null;
  } catch {
    return null;
  }
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const authRequired = options.authRequired ?? !path.startsWith("/auth/");
  const token = getStoredToken();
  if (authRequired && !token) {
    clearStoredSession();
    redirectToLogin();
    throw new ApiError("Authentification requise", 401);
  }
  const restaurantId = getStoredRestaurantId();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (restaurantId) headers.set("X-Restaurant-Id", restaurantId);

  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}/api/v1${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error && error.message !== "Failed to fetch"
        ? error.message
        : "Connexion API impossible. Vérifiez le réseau ou réessayez.",
      0,
    );
  }
  if (response.status === 401 && authRequired) {
    clearStoredSession();
    redirectToLogin();
  }
  if (!response.ok) {
    let message = `Erreur API ${response.status}`;
    try {
      const payload = await response.json();
      message = typeof payload.detail === "string" ? payload.detail : message;
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status);
  }
  if (options.skipJson || response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function authHint() {
  return "Connectez-vous puis renseignez le restaurant courant pour utiliser les actions.";
}
