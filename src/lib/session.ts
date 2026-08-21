import crypto from "node:crypto";
import { cookies } from "next/headers";
import { one } from "./db";
import type { Owner, Project } from "./types";

/**
 * Sessions are signed cookies — no session table, no external auth library.
 * Two independent kinds, because there are two kinds of person:
 *
 *   owner  — signed in with Google. Can create trips and edit their own.
 *   guest  — arrived through a share link. Identified by name, not authenticated.
 *
 * A guest cookie carries which trips the browser has been given access to, and
 * which traveller the person said they were. Identification, not authentication:
 * anyone could claim to be anyone. That is a deliberate trade — the alternative
 * is accounts, which is the thing this whole design exists to avoid.
 */

const OWNER_COOKIE = "it_owner";
const GUEST_COOKIE = "it_guest";
const OWNER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const GUEST_MAX_AGE = 60 * 60 * 24 * 90; // 90 days — trips get planned months ahead

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production.");
    }
    return "dev-only-insecure-secret";
  }
  return s;
}

function sign(payload: string): string {
  const mac = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function verify(signed: string | undefined): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return payload;
}

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function decode<T>(payload: string): T | null {
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ owner --

export async function setOwnerSession(ownerId: string) {
  const jar = await cookies();
  jar.set(OWNER_COOKIE, sign(encode({ id: ownerId })), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OWNER_MAX_AGE,
  });
}

export async function clearOwnerSession() {
  const jar = await cookies();
  jar.delete(OWNER_COOKIE);
}

export async function currentOwner(): Promise<Owner | null> {
  const jar = await cookies();
  const payload = verify(jar.get(OWNER_COOKIE)?.value);
  if (!payload) return null;
  const data = decode<{ id: string }>(payload);
  if (!data?.id) return null;
  return one<Owner>("SELECT * FROM owners WHERE id = $1", [data.id]);
}

// ------------------------------------------------------------------ guest --

interface GuestState {
  /** Project ids this browser has opened a valid share link for. */
  access: string[];
  /** projectId -> travellerId, from the "which of these people are you?" step. */
  who: Record<string, string>;
}

async function readGuest(): Promise<GuestState> {
  const jar = await cookies();
  const payload = verify(jar.get(GUEST_COOKIE)?.value);
  const data = payload ? decode<GuestState>(payload) : null;
  return { access: data?.access ?? [], who: data?.who ?? {} };
}

async function writeGuest(state: GuestState) {
  const jar = await cookies();
  jar.set(GUEST_COOKIE, sign(encode(state)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_MAX_AGE,
  });
}

export async function grantGuestAccess(projectId: string) {
  const state = await readGuest();
  if (!state.access.includes(projectId)) state.access.push(projectId);
  await writeGuest(state);
}

export async function setGuestIdentity(projectId: string, travellerId: string) {
  const state = await readGuest();
  state.who[projectId] = travellerId;
  await writeGuest(state);
}

export async function guestIdentity(projectId: string): Promise<string | null> {
  const state = await readGuest();
  return state.who[projectId] ?? null;
}

export async function hasGuestAccess(projectId: string): Promise<boolean> {
  const state = await readGuest();
  return state.access.includes(projectId);
}

// ----------------------------------------------------------------- access --

export interface Actor {
  kind: "owner" | "guest";
  ownerId?: string;
  travellerId?: string | null;
  name: string;
}

/**
 * Every permission decision in the app goes through these two functions.
 *
 * That is deliberate. Today a trip has exactly one owner. If this ever becomes
 * a product for travel agencies, an agency is a team and `owner_id` has to
 * become a membership table — and when that day comes, widening it touches
 * these functions and nothing else.
 */
export async function canView(project: Project): Promise<boolean> {
  const owner = await currentOwner();
  if (owner && owner.id === project.owner_id) return true;
  if (project.share_revoked_at) return false;
  return hasGuestAccess(project.id);
}

export async function canEdit(project: Project): Promise<boolean> {
  const owner = await currentOwner();
  if (owner && owner.id === project.owner_id) return true;
  if (project.share_revoked_at) return false;
  if (!project.link_can_edit) return false;
  return hasGuestAccess(project.id);
}

/** Who is doing this, for the change log. */
export async function currentActor(project: Project): Promise<Actor | null> {
  const owner = await currentOwner();
  if (owner && owner.id === project.owner_id) {
    return { kind: "owner", ownerId: owner.id, name: owner.name };
  }
  if (!(await hasGuestAccess(project.id))) return null;
  const travellerId = await guestIdentity(project.id);
  if (travellerId) {
    const t = await one<{ name: string }>("SELECT name FROM travellers WHERE id = $1", [travellerId]);
    if (t) return { kind: "guest", travellerId, name: t.name };
  }
  return { kind: "guest", travellerId: null, name: "Someone" };
}

// ------------------------------------------------------------------ token --

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes

export function randomToken(length = 10): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
