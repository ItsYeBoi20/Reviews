import "server-only";
import { cookies } from "next/headers";
import type { UserPublic } from "@verdict/shared";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Server-side API call that forwards the viewer's session cookie.
 * Returns null on 404 (and 401) so pages can render "not found"/"signed out".
 */
export async function api<T>(path: string): Promise<T | null> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export const getViewer = () => api<UserPublic>("/auth/me");
