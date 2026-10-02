import type { APIRoute } from "astro";
import { verifiedUser, displayName, avatarUrl } from "../../../lib/auth";
import { roomDetails, rememberJoin } from "../../../lib/rooms";

export const GET: APIRoute = async context => {
  const { params, request, locals } = context;
  const { room } = params;

  if (!room || !/^[a-zA-Z0-9_-]{1,64}$/.test(room)) {
    return new Response("Invalid room name", { status: 400 });
  }

  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new Response("Invalid origin", { status: 403 });
  }

  const env = locals.runtime.env;
  const stub = env.ROOM.get(env.ROOM.idFromName(room));
  const details = await roomDetails(env, room);
  if (room.startsWith("m-") && !details) return new Response("Room not found", { status: 404 });
  const user = await verifiedUser(context);
  if (details?.mode === "member" && !user) return new Response("Sign in to join", { status: 401 });
  const headers = new Headers(request.headers);
  // Never trust identity headers supplied by the connecting client.
  headers.delete("X-Party-User");
  headers.delete("X-Party-Name");
  headers.delete("X-Party-Avatar");
  if (user) {
    headers.set("X-Party-User", user.id);
    headers.set("X-Party-Name", encodeURIComponent(displayName(user)));
    const avatar = avatarUrl(user);
    if (avatar) headers.set("X-Party-Avatar", new URL(avatar).href);
    if (details) context.locals.runtime.ctx.waitUntil(rememberJoin(env, user.id, details).catch(() => {}));
  }
  return stub.fetch(new Request(request, { headers }));
};
