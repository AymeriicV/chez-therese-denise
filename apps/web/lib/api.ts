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

function labelForValidationField(field: string) {
  const labels: Record<string, string> = {
    email: "Email",
    password: "Mot de passe initial",
    first_name: "Prénom",
    last_name: "Nom",
    role: "Rôle",
    position: "Poste",
    phone: "Téléphone",
    user_id: "Employé",
    start_at: "Début",
    end_at: "Fin",
    break_minutes: "Pause",
    comment: "Commentaire",
    is_day_off: "Repos",
    weekly_target_minutes: "Objectif hebdomadaire",
    morning_start: "Matin début",
    morning_end: "Matin fin",
    evening_start: "Soir début",
    evening_end: "Soir fin",
    week_start: "Semaine",
    day_date: "Jour",
  };
  return labels[field] ?? field.replaceAll("_", " ");
}

function friendlyValidationMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return fallback;
  const parts = detail
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as { loc?: unknown; msg?: unknown };
      const path = Array.isArray(entry.loc) ? entry.loc.map(String) : [];
      const field = path[path.length - 1] ?? "champ";
      const message = typeof entry.msg === "string" ? entry.msg : "valeur invalide";
      return `${labelForValidationField(field)}: ${message}`;
    })
    .filter(Boolean);
  return parts.length > 0 ? `Erreur de validation: ${parts.join(" / ")}` : fallback;
}

type ApiOptions = RequestInit & {
  authRequired?: boolean;
  skipJson?: boolean;
};

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ctd_token");
}

export function decodeTokenPayload(token: string | null) {
  if (!token) return null;
  try {
    const payload = token.split(".")[1] ?? "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

export function getSessionClaims() {
  if (typeof window === "undefined") return null;
  return decodeTokenPayload(getStoredToken());
}

export function getSessionRole() {
  return getSessionClaims()?.role ?? null;
}

export function getSessionRestaurantId() {
  return getSessionClaims()?.restaurant_id ?? null;
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
  return getSessionRestaurantId();
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
      message =
        response.status === 422
          ? friendlyValidationMessage(payload, message)
          : typeof payload.detail === "string"
            ? payload.detail
            : message;
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
