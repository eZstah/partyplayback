import type { APIRoute } from "astro";
import { authClient, sameOrigin, privateJson, cleanDisplayName, displayName } from "../../lib/auth";

export const POST: APIRoute = async context => {
  if (!sameOrigin(context.request)) return privateJson({ message: "Update your profile from youple.tv." }, 403);
  const client = authClient(context);
  if (!client) return privateJson({ message: "Sign-in coming soon." }, 503);
  const { data: current, error: userError } = await client.auth.getUser();
  if (userError || !current.user) return privateJson({ message: "Sign in to edit your profile." }, 401);
  let input: unknown;
  try { input = await context.request.json(); } catch { return privateJson({ message: "Please try again." }, 400); }
  const name = cleanDisplayName((input as Record<string, unknown> | null)?.name);
  if (!name) return privateJson({ message: "Use 1 to 32 characters." }, 400);
  const { data, error } = await client.auth.updateUser({ data: { display_name: name } });
  if (error || !data.user) return privateJson({ message: "Couldn't save. Please try again." }, 400);
  return privateJson({ name: displayName(data.user) });
};
