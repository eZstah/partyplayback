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

export function privateJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://partyplayback.local");
    return url.origin === "https://partyplayback.local" ? url.pathname + url.search : "/";
  } catch { return "/"; }
}

export function displayName(user: { user_metadata: Record<string, unknown> }) {
  const value = user.user_metadata.full_name || user.user_metadata.name || user.user_metadata.preferred_username;
  return typeof value === "string" ? value.slice(0, 32) : "Member";
}
