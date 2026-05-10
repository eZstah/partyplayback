import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, request, locals }) => {
  const { room } = params;

  if (!room || !/^[a-zA-Z0-9_-]{1,64}$/.test(room)) {
    return new Response("Invalid room name", { status: 400 });
  }

  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const env = locals.runtime.env;
  const stub = env.ROOM.get(env.ROOM.idFromName(room));

  return stub.fetch(request);
};
