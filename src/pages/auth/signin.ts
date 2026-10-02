import type { APIRoute } from "astro";
import { authClient, sameOrigin, privateJson, safeReturnTo, redirectOrigin } from "../../lib/auth";

export const POST: APIRoute = async context => {
  if (!sameOrigin(context.request)) return privateJson({ message: "Please sign in from youple.tv." }, 403);
  const client = authClient(context);
  if (!client) return privateJson({ message: "Sign-in coming soon." }, 503);
  let input: unknown;
  try { input = await context.request.json(); } catch { return privateJson({ message: "Please try again." }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return privateJson({ message: "Choose a sign-in method." }, 400);
  const body = input as Record<string, unknown>;
  if (body.provider !== "google" && body.provider !== "discord" && body.provider !== "magic") return privateJson({ message: "Choose a sign-in method." }, 400);
  const callback = new URL("/auth/callback", redirectOrigin(context));
  callback.searchParams.set("next", safeReturnTo(body.next));
  if (body.provider === "magic") {
    if (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return privateJson({ message: "Enter a valid email address." }, 400);
    }
    const { error } = await client.auth.signInWithOtp({ email: body.email.trim(), options: { emailRedirectTo: callback.href } });
    return error ? privateJson({ message: "Couldn't send the link. Try again shortly." }, 400)
      : privateJson({ message: "Check your inbox. Open the sign-in link in this browser." });
  }
  const { data, error } = await client.auth.signInWithOAuth({ provider: body.provider, options: { redirectTo: callback.href, skipBrowserRedirect: true } });
  return error || !data.url ? privateJson({ message: "Unavailable right now. Try another option." }, 400)
    : privateJson({ url: data.url });
};
