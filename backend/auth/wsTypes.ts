// backend/auth/wsTypes.ts
import type { Role } from "../../shared/roles.js";

export interface WsAuth {
  isAuthed: boolean;
  userId: string | null;
  role: Role;
}

export interface WsLike {
  send(payload: string): void;
  auth?: WsAuth;
}
