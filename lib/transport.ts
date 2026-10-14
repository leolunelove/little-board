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
import { offlineBoards } from "./offline-store";
import {
  rememberedUser,
  flushOffline,
  syncEvent,
  boardLock,
} from "./offline-runtime";
import { localBoards } from "./local-boards";
import { HttpError } from "./security";
const local = () => localBoards(() => window.localStorage);
const lock = boardLock;
export const transport = {
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      const body = init.body ? JSON.parse(String(init.body)) : null;
      if (path === "/api/email") {
        if (body.action === "logout") {
          const cachedUser = await offlineBoards
            .identity()
            .catch(() => undefined);
          if (
            cachedUser &&
            (await offlineBoards.records(cachedUser.id)).some(
              (row) => row.pending,
            )
          )
            throw new HttpError(
              409,
              "Sync your changes or keep a local copy in Settings before signing out.",
            );
          if (cachedUser) await offlineBoards.vault.clear();
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
      if (path === "/api/backup")
        return Response.json(
          await lock("restore", () => local().restore(body)),
        );
      if (path === "/api/offline") {
        const user = await rememberedUser();
        if (!user) return Response.json([]);
        if (body?.action === "recover")
          return Response.json(
            await lock(body.code, () =>
              offlineBoards.recover(user.id, body.code, (board) =>
                local().copy(board),
              ),
            ),
          );
        if (body?.action === "retry") await flushOffline();
        return Response.json(
          (await offlineBoards.records(user.id))
            .filter((row) => row.pending)
            .map((row) => ({
              code: row.code,
              title: row.board.title,
              conflict: row.conflict,
            })),
        );
      }
      if (path === "/api/memos") {
        if (body) {
          const board = await lock("create", () =>
            local().create(body.requestId),
          );
          const user = await rememberedUser();
          if (!user || navigator.onLine === false) return Response.json(board);
          try {
            const claimed = await claimBoard(board);
            local().remove(board.code!);
            return Response.json(claimed);
          } catch {
            return Response.json(board);
          }
        }
        let user = null,
          remote: Awaited<ReturnType<typeof cloudList>> = [],
          warning = "";
        try {
          user = await rememberedUser();
          if (user) {
            if (navigator.onLine === false)
              remote = (await offlineBoards.records(user.id)).map((row) => ({
                ...offlineBoards.view(row),
                offline: true,
              }));
            else {
              try {
                const live = await cloudList();
                await offlineBoards
                  .prune(
                    user.id,
                    live.map((board) => board.code!),
                    lock,
                  )
                  .catch(() => {});
                for (const board of live) {
                  remote.push(
                    await lock(board.code!, () =>
                      offlineBoards.remember(
                        user!.id,
                        board,
                        board.server_revision || 0,
                      ),
                    ).catch(() => board),
                  );
                }
                void flushOffline();
              } catch (e) {
                remote = (await offlineBoards.records(user.id)).map((row) => ({
                  ...offlineBoards.view(row),
                  offline: true,
                }));
                warning = "Offline copy · reconnect to refresh and sync.";
              }
            }
          }
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
      if (guest)
        return Response.json(
          body
            ? init.keepalive
              ? local().change(code, body)
              : await lock(code, () => local().change(code, body))
            : guest,
        );
      const user = await rememberedUser();
      if (!user)
        throw new HttpError(401, "Sign in with your email to open this board.");
      if (!body) {
        if (navigator.onLine !== false)
          try {
            const read = await cloudRead(code);
            return Response.json(
              await lock(code, () =>
                offlineBoards.remember(user.id, read.board, read.revision),
              ).catch(() => read.board),
            );
          } catch (e) {
            if (e instanceof HttpError && [401, 403, 404].includes(e.status))
              throw e;
          }
        const cached = await offlineBoards.get(user.id, code);
        if (!cached)
          throw new HttpError(
            503,
            "Open this board online once to make it available offline.",
          );
        return Response.json({ ...offlineBoards.view(cached), offline: true });
      }
      try {
        await offlineBoards.get(user.id, code);
      } catch (e) {
        if (navigator.onLine !== false)
          return Response.json(await cloudChange(code, body));
        throw e;
      }
      const saved = await lock(code, async () => {
        if (!(await offlineBoards.get(user.id, code))) {
          const read = await cloudRead(code);
          await offlineBoards.remember(user.id, read.board, read.revision);
        }
        return offlineBoards.edit(user.id, code, body);
      });
      syncEvent();
      void flushOffline();
      return Response.json(saved);
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Please try again." },
        { status: e instanceof HttpError ? e.status : 503 },
      );
    }
  },
};
