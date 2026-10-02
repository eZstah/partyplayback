import type { APIRoute } from "astro";
import { verifiedUser, privateJson, sameOrigin, displayName } from "../../lib/auth";
import { readContact, contactEmail, sendContact } from "../../lib/contact";
import { CONTACT_EMAIL, CONTACT_INBOX } from "../../lib/legal";

export const POST: APIRoute = async context => {
  const { request } = context;
  if (!sameOrigin(request)) return privateJson({ message: "Send your message from youple.tv." }, 403);
  const env = context.locals.runtime.env;
  let input: unknown;
  try { input = await request.json(); } catch { return privateJson({ message: "Please try again." }, 400); }
  const origin = new URL(request.url).origin;
  const form = readContact(input, origin);
  // Bots that fill the hidden field see the usual success and get nothing sent.
  if (!form.ok) return form.spam ? privateJson({ sent: true }) : privateJson({ message: form.message }, 400);
  // Typos don't count against the limit; only messages that would be sent do.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.CONTACT_LIMIT && !(await env.CONTACT_LIMIT.limit({ key: ip })).success) {
    return privateJson({ message: "That's a lot of messages. Wait a minute and try again." }, 429);
  }
  if (!env.RESEND_API_KEY) return privateJson({ message: `The form isn't set up yet. Email ${CONTACT_EMAIL} instead.` }, 503);
  const user = await verifiedUser(context);
  const screen = (input as Record<string, unknown>).screen;
  const email = contactEmail(CONTACT_INBOX, form.value, {
    userAgent: request.headers.get("User-Agent"),
    screen: typeof screen === "string" && /^\d{2,5}x\d{2,5}$/.test(screen) ? screen : undefined,
    user: user ? { id: user.id, email: user.email, name: displayName(user) } : null,
  }, origin);
  if (!(await sendContact(env.RESEND_API_KEY, email))) return privateJson({ message: `Couldn't send right now. Try again, or email ${CONTACT_EMAIL}.` }, 502);
  return privateJson({ sent: true });
};
