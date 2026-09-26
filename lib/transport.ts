import {
  account,
  claimBoard,
  cloudChange,
  cloudClient,
  cloudList,
  cloudRead,
  emailEnabled,
  sendMagicLink,
  shareBoard,
} from "./cloud";
import { localBoards } from "./local-boards";
import { HttpError } from "./security";
const local = () => localBoards(() => window.localStorage);
async function lock<T>(code: string, action: () => T | Promise<T>): Promise<T> {
  return navigator.locks
    ? navigator.locks.request(`little-board:${code}`, action)
    : action();
}
export const transport = {
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      const body = init.body ? JSON.parse(String(init.body)) : null;
      if (path === "/api/email") {
        if (body.action === "logout") {
          if (emailEnabled) {
            const { error } = await cloudClient().auth.signOut({
              scope: "local",
            });
            if (error)
              throw new HttpError(503, "Couldn’t sign out. Please try again.");
          }
        } else if (body.action === "request")
          await sendMagicLink(body.email, body.code);
        else throw new HttpError(400, "Unknown request.");
        return Response.json({ ok: true });
      }
      if (path === "/api/memos") {
        if (body) {
          const board = await lock("create", () =>
            local().create(body.requestId),
          );
          const user = await account();
          if (!user) return Response.json(board);
          const claimed = await claimBoard(board);
          local().remove(board.code!);
          return Response.json(claimed);
        }
        let user = null,
          remote: Awaited<ReturnType<typeof cloudList>> = [],
          warning = "";
        try {
          user = await account();
          remote = await cloudList();
        } catch (e) {
          warning = (e as Error).message;
        }
        return Response.json({
          boards: [...local().list(), ...remote],
          email: user?.email || null,
          emailReady: emailEnabled,
          warning,
        });
      }
      const match = path.match(
        /^\/api\/memos\/([1-9][0-9]{5})(?:\/(claim|sharing))?$/,
      );
      if (!match) throw new HttpError(404, "This board couldn’t be found.");
      const [, code, action] = match;
      const guest = local().get(code);
      if (action === "claim") {
        if (!guest) return Response.json((await cloudRead(code)).board);
        return await lock(code, async () => {
          const latest = local().get(code);
          if (!latest)
            throw new HttpError(
              409,
              "This board was already saved. Return to your boards.",
            );
          const claimed = await claimBoard(latest);
          local().remove(code);
          return Response.json(claimed);
        });
      }
      if (action === "sharing")
        return Response.json(await shareBoard(code, body.email));
      if (!body) return Response.json(guest || (await cloudRead(code)).board);
      return Response.json(
        guest
          ? init.keepalive
            ? local().change(code, body)
            : await lock(code, () => local().change(code, body))
          : await cloudChange(code, body),
      );
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Please try again." },
        { status: e instanceof HttpError ? e.status : 503 },
      );
    }
  },
};
