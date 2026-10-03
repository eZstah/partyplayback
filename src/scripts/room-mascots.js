import { bootCatSimulator } from './cat-simulator.js';

export const ROOM_LINES = {
  join: ['the gang is here.', 'another witness.'], added: ['excellent taste.', 'queue fed. serotonin up.'],
  play: ['this is cinema.', 'volume up. brain off.'], pause: ['who paused my cinema?', 'i was watching that.'],
  next: ['next obsession.', 'plot twist.'], empty: ['feed the queue.', 'one link. please.'], wake: ["i'm awake. allegedly."],
};

export function bootRoomMascots() { return bootCatSimulator(); }
