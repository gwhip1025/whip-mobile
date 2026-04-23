import Constants from "expo-constants";
import { supabase } from "./supabase";

export const APP_URL: string =
  Constants.expoConfig?.extra?.appUrl ?? "https://whip1.vercel.app";

/**
 * Call a web API route using the current user's Supabase session as a Bearer token.
 * The web API supports this via createClientFromToken().
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${APP_URL}${path}`, { ...init, headers });
}

/** Convenience: parse JSON, throwing a typed Error on non-2xx. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
