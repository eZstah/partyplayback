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
