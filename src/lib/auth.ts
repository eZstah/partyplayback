import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { APIContext } from "astro";

type AuthContext = Pick<APIContext, "request" | "cookies" | "locals">;

export function authClient(context: AuthContext) {
  const env = context.locals.runtime.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const stored = new Map(parseCookieHeader(context.request.headers.get("cookie") || "")
    .filter(cookie => cookie.value !== undefined).map(cookie => [cookie.name, cookie.value!]));
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { path: "/", sameSite: "lax", httpOnly: true, secure: new URL(context.request.url).protocol === "https:" },
    cookies: {
      getAll: () => [...stored].map(([name, value]) => ({ name, value })),
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          stored.set(name, value);
          context.cookies.set(name, value, { ...options, sameSite: "lax", httpOnly: true, secure: new URL(context.request.url).protocol === "https:" });
        }
      },
    },
  });
}

export async function verifiedUser(context: AuthContext) {
  const client = authClient(context);
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export function sameOrigin(request: Request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

// Local preview rewrites request URLs to the youple.tv route, so it sets
// AUTH_REDIRECT_ORIGIN to send provider redirects back to localhost instead.
export function redirectOrigin(context: AuthContext) {
  const override = context.locals.runtime.env.AUTH_REDIRECT_ORIGIN;
  try { if (override) return new URL(override).origin; } catch {}
  return new URL(context.request.url).origin;
}

export function privateJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://youple.local");
    return url.origin === "https://youple.local" ? url.pathname + url.search : "/";
  } catch { return "/"; }
}

export function displayName(user: { user_metadata: Record<string, unknown> }) {
  const chosen = cleanDisplayName(user.user_metadata.display_name);
  if (chosen) return chosen;
  const value = user.user_metadata.full_name || user.user_metadata.name || user.user_metadata.preferred_username;
  return typeof value === "string" ? value.slice(0, 32) : "Member";
}

// The name a member picks on their profile; null when it isn't usable.
export function cleanDisplayName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return name && name.length <= 32 ? name : null;
}

export function avatarUrl(user: { user_metadata: Record<string, unknown> }) {
  const value = user.user_metadata.avatar_url || user.user_metadata.picture;
  if (typeof value !== "string") return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
}
