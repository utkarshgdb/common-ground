// Tokens: random 32 bytes (base64url); only SHA-256 hashes are stored (PRD §13).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function tokenMatches(token: string | undefined | null, hash: string | null | undefined): boolean {
  if (!token || !hash) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const ALPHA = "abcdefghijkmnpqrstuvwxyz23456789";
export function newRoomId(len = 10): string {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHA[b % ALPHA.length]).join("");
}

export const memberCookie = (roomId: string) => `cg_m_${roomId}`;
export const coordCookie = (roomId: string) => `cg_c_${roomId}`;
