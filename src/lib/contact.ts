// Messages from the contact page go out through Resend's HTTP API from the
// verified youple.tv domain. The Worker needs a RESEND_API_KEY secret.
export const CONTACT_FROM = "youple.tv <contact@youple.tv>";

export type ContactKind = "message" | "bug";

export type ContactInput = {
  kind: ContactKind;
  name: string;
  email: string;
  message: string;
  page: string;
};

export type ContactMeta = {
  userAgent?: string | null;
  screen?: string;
  user?: { id: string; email?: string | null; name?: string } | null;
};

const EMAIL = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]{2,}$/;

function clean(value: unknown, max: number, multiline = false) {
  if (typeof value !== "string") return "";
  const text = multiline
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\n{4,}/g, "\n\n\n")
    : value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
  return text.trim().slice(0, max);
}

// Only links to youple.tv itself are kept as the page a bug happened on.
export function cleanPage(value: unknown, origin: string) {
  const text = clean(value, 300);
  if (!text) return "";
  try {
    const url = new URL(text, origin);
    return url.origin === origin ? url.pathname + url.search : "";
  } catch { return ""; }
}

// Returns the cleaned form, or the message to show next to it.
export function readContact(input: unknown, origin: string): { ok: true; value: ContactInput } | { ok: false; message: string; spam?: true } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Please try again." };
  const body = input as Record<string, unknown>;
  // The hidden "website" field is only ever filled in by bots.
  if (typeof body.website === "string" && body.website.trim()) return { ok: false, message: "Thanks!", spam: true };
  const kind = body.kind === "bug" ? "bug" : body.kind === "message" ? "message" : null;
  if (!kind) return { ok: false, message: "Choose message or bug report." };
  const email = clean(body.email, 254);
  if (!EMAIL.test(email)) return { ok: false, message: "Add an email address so we can reply." };
  const message = clean(body.message, 5000, true);
  if (message.length < 5) return { ok: false, message: kind === "bug" ? "Tell us what went wrong." : "Write a message first." };
  return { ok: true, value: { kind, email, message, name: clean(body.name, 80), page: kind === "bug" ? cleanPage(body.page, origin) : "" } };
}

export function contactEmail(to: string, form: ContactInput, meta: ContactMeta, origin: string) {
  const who = form.name || form.email;
  const firstLine = form.message.split("\n")[0].slice(0, 60);
  const subject = form.kind === "bug" ? `Bug: ${firstLine}` : `Message from ${who}`;
  const details = [
    `From: ${form.name ? `${form.name} <${form.email}>` : form.email}`,
    ...(form.kind === "bug" ? [
      `Page: ${form.page ? origin + form.page : "not given"}`,
      `Browser: ${clean(meta.userAgent, 400) || "unknown"}`,
      ...(meta.screen ? [`Screen: ${meta.screen}`] : []),
    ] : []),
    `Account: ${meta.user ? `${meta.user.name || "Member"} (${meta.user.email || "no email"}, ${meta.user.id})` : "not signed in"}`,
  ];
  return {
    from: CONTACT_FROM,
    to: [to],
    reply_to: form.email,
    subject: `[youple.tv] ${subject}`,
    text: `${form.message}\n\n---\n${details.join("\n")}\n`,
  };
}

export async function sendContact(apiKey: string, email: ReturnType<typeof contactEmail>, send: typeof fetch = fetch) {
  try {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(email),
    });
    if (!response.ok) console.error("Resend rejected a contact message", response.status, await response.text().catch(() => ""));
    return response.ok;
  } catch (error) {
    console.error("Couldn't reach Resend", error);
    return false;
  }
}
