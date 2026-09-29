import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { basePath, CODE, boardUrl } from "./navigation";
import type { Board } from "./types";
import { HttpError } from "./security";
import { applyCommand, randomCode } from "./local-boards";
import backend from "./backend.json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || backend.url;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || backend.publishableKey;
export const emailEnabled = Boolean(
  url && key && process.env.NEXT_PUBLIC_EMAIL_ENABLED === "true",
);
let client: SupabaseClient | null = null;
export function cloudClient() {
  if (!emailEnabled)
    throw new HttpError(
      503,
      "Email sign-in isn’t available yet. You can still create a board.",
    );
  client ||= createClient(url!, key!, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "little-board:auth",
    },
  });
  return client;
}
export function normalizedEmail(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw new HttpError(400, "Enter a valid email address.");
  return value.trim().toLowerCase();
}
export function magicRedirect(origin: string, code?: string) {
  const target = new URL(`${basePath}/`, origin);
  target.searchParams.set("welcome", "1");
  if (code && CODE.test(code)) target.searchParams.set("board", code);
  return target.href;
}
export async function account() {
  if (!emailEnabled) return null;
  const {
    data: { session },
  } = await cloudClient().auth.getSession();
  if (!session) return null;
  const { data, error } = await cloudClient().auth.getUser();
  if (error || !data.user?.email_confirmed_at)
    throw new HttpError(401, "Sign in with your email to open saved boards.");
  return data.user;
}
export async function sendMagicLink(email: string, code?: string) {
  const { error } = await cloudClient().auth.signInWithOtp({
    email: normalizedEmail(email),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: magicRedirect(window.location.origin, code),
    },
  });
  if (error)
    throw new HttpError(
      error.status === 429 ? 429 : 503,
      error.status === 429
        ? "Please wait a minute before asking for another link."
        : "We couldn’t send your link. Please try again shortly.",
    );
}
function dbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501")
    throw new HttpError(403, "Only the board owner can make changes.");
  throw new HttpError(
    503,
    "Your saved boards couldn’t be reached. Please try again.",
  );
}
function payload(row: Record<string, any>, uid: string): Board {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    tasks: row.tasks,
    updated_at: row.updated_at,
    claimed: true,
    invited_email: row.viewer_email,
    access: row.owner_id === uid ? "owner" : "viewer",
  };
}
export async function cloudList() {
  const user = await account();
  if (!user) return [];
  const { data, error } = await cloudClient()
    .from("little_boards")
    .select("id,code,title,owner_id,viewer_email,updated_at,tasks")
    .order("updated_at", { ascending: false });
  dbError(error);
  return (data || []).map((row) => payload(row, user.id));
}
export async function cloudRead(code: string) {
  const user = await account();
  if (!user)
    throw new HttpError(401, "Sign in with your email to open this board.");
  const { data, error } = await cloudClient()
    .from("little_boards")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  dbError(error);
  if (!data)
    throw new HttpError(404, "This board isn’t available to this email.");
  return { board: payload(data, user.id), revision: data.revision as number };
}
export async function claimBoard(board: Board) {
  const user = await account();
  if (!user)
    throw new HttpError(401, "Sign in before saving this board to your email.");
  const db = cloudClient();
  const existing = await db
    .from("little_boards")
    .select("*")
    .eq("id", board.id)
    .maybeSingle();
  dbError(existing.error);
  if (existing.data) return payload(existing.data, user.id);
  let code = board.code!;
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, error } = await db
      .from("little_boards")
      .insert({
        id: board.id,
        code,
        owner_id: user.id,
        title: board.title,
        tasks: board.tasks,
      })
      .select()
      .single();
    if (!error) return payload(data, user.id);
    if (error.code !== "23505") dbError(error);
    const retry = await db
      .from("little_boards")
      .select("*")
      .eq("id", board.id)
      .maybeSingle();
    dbError(retry.error);
    if (retry.data) return payload(retry.data, user.id);
    code = randomCode();
  }
  throw new HttpError(
    503,
    "Couldn’t save this board yet. Your device copy is still here.",
  );
}
export async function cloudChange(code: string, command: unknown) {
  const { board, revision } = await cloudRead(code);
  if (board.access !== "owner")
    throw new HttpError(403, "Only the board owner can make changes.");
  const next = applyCommand(board, command);
  const { data, error } = await cloudClient()
    .from("little_boards")
    .update({ title: next.title, tasks: next.tasks, revision: revision + 1 })
    .eq("id", board.id)
    .eq("revision", revision)
    .select()
    .maybeSingle();
  dbError(error);
  if (!data)
    throw new HttpError(
      409,
      "This board changed on another device. Try your change again.",
    );
  return payload(data, data.owner_id);
}
export async function shareBoard(code: string, email: string | null) {
  const { board, revision } = await cloudRead(code);
  if (board.access !== "owner")
    throw new HttpError(403, "Only the board owner can share it.");
  const { data, error } = await cloudClient()
    .from("little_boards")
    .update({
      viewer_email: email === null ? null : normalizedEmail(email),
      revision: revision + 1,
    })
    .eq("id", board.id)
    .eq("revision", revision)
    .select()
    .maybeSingle();
  dbError(error);
  if (!data) throw new HttpError(409, "The board changed. Please try again.");
  return {
    board: payload(data, data.owner_id),
    url: new URL(boardUrl(code), window.location.origin).href,
  };
}
