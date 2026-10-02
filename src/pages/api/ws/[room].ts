import type { APIRoute } from "astro";
import { verifiedUser, displayName } from "../../../lib/auth";
import { roomDetails } from "../../../lib/rooms";

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
  if (user) {
    headers.set("X-Party-User", user.id);
    headers.set("X-Party-Name", encodeURIComponent(displayName(user)));
  }
  return stub.fetch(new Request(request, { headers }));
};
