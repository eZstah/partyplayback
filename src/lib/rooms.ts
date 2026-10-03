export type RoomDetails = { slug: string; title: string; mode: "guest" | "member"; ownerId?: string; createdAt: number };

export function roomStub(env: Env, slug: string) {
  return env.ROOM.get(env.ROOM.idFromName(slug));
}

export async function roomDetails(env: Env, slug: string): Promise<RoomDetails | null> {
  const response = await roomStub(env, slug).fetch("https://room.internal/info");
  return response.json();
}

export async function ownedRooms(env: Env, userId: string): Promise<RoomDetails[]> {
  const stub = roomStub(env, "account:" + userId);
  const response = await stub.fetch("https://room.internal/catalog");
  return response.json();
}

export async function joinedRooms(env: Env, userId: string): Promise<RoomDetails[]> {
  const response = await roomStub(env, "account:" + userId).fetch("https://room.internal/joined");
  return response.json();
}

// Remembers a friend's saved room so it shows up in this member's own list.
export async function rememberJoin(env: Env, userId: string, room: RoomDetails) {
  if (room.mode !== "member" || room.ownerId === userId) return;
  const { slug, title, mode, createdAt } = room;
  await roomStub(env, "account:" + userId).fetch("https://room.internal/joined", { method: "POST", body: JSON.stringify({ slug, title, mode, createdAt }) });
}

// A member's own saved rooms first, then friends' rooms they have joined.
export async function accountRooms(env: Env, userId: string) {
  const [owned, joined] = await Promise.all([ownedRooms(env, userId), joinedRooms(env, userId)]);
  return [
    ...owned.map(room => ({ ...room, joined: false })),
    ...joined.filter(room => !owned.some(own => own.slug === room.slug)).map(room => ({ ...room, joined: true })),
  ];
}

// Closes a saved room for everyone inside and takes it off its owner's list.
export async function deleteRoom(env: Env, slug: string, ownerId: string) {
  await roomStub(env, slug).fetch("https://room.internal/delete", { method: "POST" });
  await roomStub(env, "account:" + ownerId).fetch("https://room.internal/catalog", { method: "DELETE", body: JSON.stringify({ slug }) });
}

// Takes a friend's room off this member's list.
export async function forgetJoin(env: Env, userId: string, slug: string) {
  await roomStub(env, "account:" + userId).fetch("https://room.internal/joined", { method: "DELETE", body: JSON.stringify({ slug }) });
}
