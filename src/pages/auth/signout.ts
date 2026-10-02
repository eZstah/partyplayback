import type { APIRoute } from "astro";
import { authClient, sameOrigin, privateJson } from "../../lib/auth";

export const POST: APIRoute = async context => {
  if (!sameOrigin(context.request)) return privateJson({ message: "Please sign out from youple.tv." }, 403);
  const client = authClient(context);
  if (client) {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return privateJson({ message: "Couldn't sign out. Please try again." }, 400);
  }
  return privateJson({ ok: true });
};
