import type { APIRoute } from "astro";
import { authClient, safeReturnTo } from "../../lib/auth";

export const GET: APIRoute = async context => {
  const url = new URL(context.request.url);
  const client = authClient(context);
  const code = url.searchParams.get("code");
  if (client && code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return new Response(null, { status: 303, headers: { Location: safeReturnTo(url.searchParams.get("next")), "Cache-Control": "private, no-store" } });
  }
  return new Response(null, { status: 303, headers: { Location: "/?signin=1&auth_error=1", "Cache-Control": "private, no-store" } });
};
