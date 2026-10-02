import type { APIRoute } from "astro";
import { verifiedUser, privateJson, sameOrigin } from "../../lib/auth";
import { roomStub, ownedRooms, type RoomDetails } from "../../lib/rooms";

export const GET: APIRoute = async context => {
  const user = await verifiedUser(context);
  return user ? privateJson({ rooms: await ownedRooms(context.locals.runtime.env, user.id) }) : privateJson({ rooms: [] });
};

export const POST: APIRoute = async context => {
  if (!sameOrigin(context.request)) return privateJson({ message: "Create your room from youple.tv." }, 403);
  let input: unknown;
  try { input = await context.request.json(); } catch { return privateJson({ message: "Please try again." }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return privateJson({ message: "Choose a room type." }, 400);
  const body = input as Record<string, unknown>;
  if (body.mode !== "guest" && body.mode !== "member") return privateJson({ message: "Choose a room type." }, 400);
  const user = body.mode === "member" ? await verifiedUser(context) : null;
  if (body.mode === "member" && !user) return privateJson({ message: "Sign in to create your own member room.", signIn: true }, 401);
  const env = context.locals.runtime.env;
  const roomId = crypto.randomUUID().replaceAll("-", "");
  const moods = ["Cosmic", "Cozy", "Happy", "Dreamy", "Bouncy", "Sunny", "Lucky", "Mellow"];
  const snacks = ["Popcorn", "Peaches", "Waffles", "Cookies", "Noodles", "Cherries", "Pancakes", "Mochi"];
  const guestTitle = moods[parseInt(roomId.slice(0, 2), 16) % moods.length] + " " + snacks[parseInt(roomId.slice(2, 4), 16) % snacks.length];
  const details: RoomDetails = {
    slug: (body.mode === "member" ? "m-" : "g-") + roomId,
    title: body.mode === "guest" ? guestTitle : (typeof body.title === "string" ? body.title.trim().slice(0, 64) : "") || "Good company",
    mode: body.mode, createdAt: Date.now(), ...(user ? { ownerId: user.id } : {}),
  };
  if (user) {
    const rooms = await ownedRooms(env, user.id);
    if (rooms.length >= 50) return privateJson({ message: "You already have 50 member rooms. Reopen one of them below." }, 409);
  }
  await roomStub(env, details.slug).fetch("https://room.internal/initialize", { method: "POST", body: JSON.stringify(details) });
  if (user) await roomStub(env, "account:" + user.id).fetch("https://room.internal/catalog", { method: "POST", body: JSON.stringify(details) });
  return privateJson({ url: "/room/" + details.slug, room: { slug: details.slug, title: details.title, mode: details.mode } }, 201);
};
