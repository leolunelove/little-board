"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Plus,
  Mail,
  ChevronRight,
  Check,
  Link2,
} from "lucide-react";
import { AppearanceControl } from "./appearance-control";
import { AllItems } from "./all-items";
import { MemoBoard } from "./memo-board";
import { MagicLinkForm } from "./magic-link-form";
import { Sheet } from "./sheet";
import { memoRequest } from "@/lib/client-api";
import {
  currentCode,
  isAllItems,
  navigate,
  CODE,
  boardUrl,
  basePath,
} from "@/lib/navigation";
import { cloudClient, emailEnabled } from "@/lib/cloud";
import { isArchived } from "@/lib/archive";
import type { Board } from "@/lib/types";

function boardSummary(board: Board) {
  const visible = board.tasks.filter((task) => !isArchived(task));
  return {
    pending: visible.filter((task) => task.status === "pending").length,
    waiting: visible.filter((task) => task.status === "waiting").length,
    done: visible.filter((task) => task.status === "done").length,
  };
}

function updatedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Updated today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString())
    return "Updated yesterday";
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function LittleBoardApp() {
  const [allItems, setAllItems] = useState(false);
  const [returnToAll, setReturnToAll] = useState(false);
  const [code, setCode] = useState<string | null>(null),
    [board, setBoard] = useState<Board | null>(null),
    [boards, setBoards] = useState<Board[]>([]);
  const [email, setEmail] = useState<string | null>(null),
    [ready, setReady] = useState(emailEnabled),
    [login, setLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [opening, setOpening] = useState(false),
    [error, setError] = useState("");
  const [sheet, setSheet] = useState<"claim" | "share" | null>(null),
    [partner, setPartner] = useState(""),
    [message, setMessage] = useState(""),
    [sheetError, setSheetError] = useState("");
  const [viewerPreview, setViewerPreview] = useState<Board | null>(null);
  const requestId = useRef<string | null>(null),
    generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    const selected = currentCode();
    setAllItems(isAllItems());
    setReturnToAll(
      new URLSearchParams(window.location.search).get("from") === "all",
    );
    setCode(selected);
    setOpening(Boolean(selected) || isAllItems());
    setError("");
    try {
      const info = await memoRequest("/api/memos");
      if (version !== generation.current) return;
      setBoards(info.boards);
      setEmail(info.email);
      setReady(info.emailReady);
      if (info.warning) setError(info.warning);
      if (selected) {
        const loaded = await memoRequest(`/api/memos/${selected}`);
        if (version !== generation.current) return;
        setBoard(loaded);
        setPartner(loaded.invited_email || "");
      } else setBoard(null);
    } catch (e) {
      if (version === generation.current) {
        setError((e as Error).message);
        setBoard(null);
      }
    } finally {
      if (version === generation.current) setOpening(false);
    }
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const returned = query.get("board"),
      route = query.get("route");
    const restored =
      returned && CODE.test(returned)
        ? returned
        : route && CODE.test(route)
          ? route
          : null;
    const authError =
      query.get("error_description") ||
      new URLSearchParams(window.location.hash.slice(1)).get(
        "error_description",
      );
    // Supabase owns the code exchange. Wait for its session before cleaning the callback URL.
    async function bootstrap() {
      const result = emailEnabled
        ? await cloudClient().auth.getSession()
        : null;
      const signedIn = result?.data.session;
      const failedCallback = Boolean(
        authError ||
        result?.error ||
        (emailEnabled && query.has("code") && !signedIn),
      );
      if (restored) window.history.replaceState(null, "", boardUrl(restored));
      else if (query.has("welcome") || query.has("code") || authError)
        window.history.replaceState(null, "", boardUrl());
      await load();
      if (returned && restored && signedIn && !failedCallback) {
        const current = await memoRequest(`/api/memos/${restored}`);
        if (!current.claimed) setSheet("claim");
      }
      if (failedCallback) {
        setLogin(true);
        setError(
          "That sign-in link expired or has already been used. Request a new one.",
        );
      }
    }
    void bootstrap().catch(() => {
      setError(
        "That link couldn’t be opened. Please request a new sign-in link.",
      );
    });
    const routeChanged = () => {
      setLogin(false);
      setSheet(null);
      void load();
    };
    window.addEventListener("popstate", routeChanged);
    const changedElsewhere = (event: StorageEvent) => {
      if (event.key === "little-board:guests:v1" && !currentCode()) void load();
    };
    window.addEventListener("storage", changedElsewhere);
    const subscription = emailEnabled
      ? cloudClient().auth.onAuthStateChange((event) => {
          if (["SIGNED_IN", "SIGNED_OUT"].includes(event))
            setTimeout(() => void load(), 0);
        }).data.subscription
      : null;
    return () => {
      generation.current++;
      subscription?.unsubscribe();
      window.removeEventListener("popstate", routeChanged);
      window.removeEventListener("storage", changedElsewhere);
    };
  }, [load]);
  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const result = await memoRequest("/api/memos", {
        requestId: requestId.current,
      });
      requestId.current = null;
      navigate(result.code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function claim() {
    if (!code || busy) return;
    setBusy(true);
    setSheetError("");
    try {
      const result = await memoRequest(`/api/memos/${code}/claim`, {});
      setSheet(null);
      navigate(result.code);
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const signedInHome = Boolean(email && !login && !code);
  const brand = (
    <button
      className="little-brand"
      onClick={() => {
        setLogin(false);
        navigate();
      }}
      aria-label="Little Board home"
    >
      <span className="brand-glyph" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      little <strong>board</strong>
      <span className="brand-period">.</span>
    </button>
  );
  if (allItems && opening)
    return (
      <main className="little-opening">
        {brand}
        <p role="status">Opening all items…</p>
      </main>
    );
  if (allItems)
    return (
      <AllItems
        key={email || "guest"}
        initial={boards}
        initialWarning={error}
      />
    );
  if (code && opening)
    return (
      <main className="little-opening">
        {brand}
        <p role="status">Opening your board…</p>
      </main>
    );
  if (code && board)
    return (
      <>
        <div className="board-brand-bar">
          <span className="little-brand">{brand.props.children}</span>
        </div>
        <MemoBoard
          key={`${board.id}:${board.claimed}:${board.invited_email}`}
          initial={board}
          onBack={returnToAll ? () => navigate("all") : undefined}
          mode={board.access || "owner"}
          personalActions={{
            onClaim: () => {
              setSheetError("");
              setMessage("");
              setSheet("claim");
            },
            onShare: () => {
              setViewerPreview(null);
              setPartner(board.invited_email || "");
              setSheetError("");
              setMessage("");
              setSheet("share");
            },
          }}
        />
        {sheet && (
          <Sheet
            title={
              viewerPreview
                ? "Viewer preview"
                : sheet === "claim" || !board.claimed
                  ? "Keep it with you."
                  : "Share with one person."
            }
            onClose={() => {
              if (!busy) setSheet(null);
            }}
          >
            {viewerPreview ? (
              <div className="viewer-preview-panel">
                <p className="form-hint">
                  This is how the board looks to your viewer. They can read and
                  expand items, but can’t change anything.
                </p>
                <MemoBoard
                  initial={viewerPreview}
                  mode="viewer"
                  demo
                  embedded
                />
                <button
                  className="text-button"
                  onClick={() => setViewerPreview(null)}
                >
                  ← Back to sharing
                </button>
              </div>
            ) : !board.claimed ? (
              <>
                <p className="sheet-copy">
                  Save this board to your email to open it on your other
                  devices.
                </p>
                {email ? (
                  <>
                    <p className="form-hint">Save to {email}.</p>
                    <button
                      className="little-primary"
                      disabled={busy}
                      onClick={() => void claim()}
                    >
                      {busy ? "Saving…" : "Save my board"}
                      <ArrowRight size={17} />
                    </button>
                  </>
                ) : (
                  <MagicLinkForm code={code} ready={ready} />
                )}
              </>
            ) : (
              <>
                <p className="sheet-copy">
                  One person can view this board. Only you can make changes.
                </p>
                <div className="access-summary" aria-label="Board access">
                  <div>
                    <span>You</span>
                    <span className="access-role">Can edit</span>
                  </div>
                  <div>
                    <span>{board.invited_email || "Just you for now"}</span>
                    <span className="access-role">
                      {board.invited_email ? "Can view" : "Private"}
                    </span>
                  </div>
                </div>
                <p className="form-hint">
                  {board.invited_email
                    ? "View access is enabled. Send them the board link; they’ll sign in with the email shown above."
                    : "Add their email, then copy and send them the link. They’ll sign in with that email."}{" "}
                  An invitation email isn’t sent automatically.
                </p>
                <button
                  className="text-button viewer-preview-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setSheetError("");
                    try {
                      setViewerPreview(await memoRequest(`/api/memos/${code}`));
                    } catch (error) {
                      setSheetError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Preview their view
                </button>
                <form
                  className="little-email"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setSheetError("");
                    setMessage("");
                    try {
                      const data = await memoRequest(
                        `/api/memos/${code}/sharing`,
                        { email: partner },
                      );
                      setBoard(data.board);
                      setMessage(
                        "Access saved. Copy the link and send it to them; they’ll sign in with this email.",
                      );
                    } catch (e) {
                      setSheetError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label htmlFor="partner-email">
                    {board.invited_email ? "Viewer’s email" : "Their email"}
                  </label>
                  <input
                    id="partner-email"
                    type="email"
                    required
                    value={partner}
                    maxLength={254}
                    disabled={busy}
                    onChange={(e) => setPartner(e.target.value)}
                    placeholder="them@example.com"
                  />
                  <button
                    type="submit"
                    className="little-primary"
                    disabled={busy}
                  >
                    {busy
                      ? "Saving…"
                      : board.invited_email
                        ? "Update view access"
                        : "Give view access"}
                    <ArrowRight size={17} />
                  </button>
                </form>
                {board.invited_email && (
                  <div className="share-secondary">
                    <button
                      className="little-primary copy-viewer-link"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            new URL(boardUrl(code), window.location.origin)
                              .href,
                          );
                          setMessage("Board link copied.");
                        } catch {
                          setMessage(
                            new URL(boardUrl(code), window.location.origin)
                              .href,
                          );
                        }
                      }}
                    >
                      <Link2 size={16} />
                      Copy viewer link
                    </button>
                    <button
                      className="text-button danger-text"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const data = await memoRequest(
                            `/api/memos/${code}/sharing`,
                            { email: null },
                          );
                          setBoard(data.board);
                          setPartner("");
                          setMessage("Sharing stopped.");
                        } catch (e) {
                          setSheetError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Stop sharing
                    </button>
                  </div>
                )}
              </>
            )}
            {message && (
              <p className="form-hint" role="status">
                {message}
              </p>
            )}
            {sheetError && (
              <p className="draft-error" role="alert">
                {sheetError}
              </p>
            )}
          </Sheet>
        )}
      </>
    );
  return (
    <main className={`little-home${signedInHome ? " is-dashboard" : ""}`}>
      <nav className="little-nav" aria-label="Main">
        {brand}
        <AppearanceControl />
      </nav>
      {signedInHome ? (
        <>
          <section
            className="little-dashboard-intro"
            aria-labelledby="boards-title"
          >
            <div className="little-kicker">
              <span />
              WELCOME BACK
            </div>
            <div className="little-dashboard-heading">
              <div>
                <h1 id="boards-title">Your boards</h1>
                <p>Everything you’re keeping track of, in one place.</p>
              </div>
              <button
                className="little-primary dashboard-new-button"
                onClick={() => void create()}
                disabled={busy}
              >
                <Plus size={18} />
                {busy ? "Creating…" : "New board"}
              </button>
            </div>
          </section>
          {error && (
            <p className="draft-error" role="alert">
              {error}
            </p>
          )}
          <button className="all-items-entry" onClick={() => navigate("all")}>
            <span>
              <strong>All items</strong>
              <small>Work across all your boards</small>
            </span>
            <ArrowRight size={19} />
          </button>
          <section className="little-dashboard-boards" aria-label="Your boards">
            {boards.length ? (
              boards.map((b) => {
                const counts = boardSummary(b);
                return (
                  <button
                    className="little-board-summary"
                    key={b.id}
                    onClick={() => navigate(b.code)}
                  >
                    <span className="summary-topline">
                      <span className="summary-mark" aria-hidden="true">
                        ≡
                      </span>
                      <strong>{b.title}</strong>
                      <span className="summary-code">#{b.code}</span>
                    </span>
                    <span className="summary-divider" />
                    <span className="summary-caption">AT A GLANCE</span>
                    <span className="summary-counts">
                      <span>
                        <i className="summary-status" />
                        {counts.pending} pending
                      </span>
                      <span>
                        <i className="summary-status waiting" />
                        {counts.waiting} waiting
                      </span>
                      <span>
                        <Check size={17} aria-hidden="true" />
                        {counts.done} done
                      </span>
                    </span>
                    <span className="summary-bottomline">
                      <span>
                        {b.access === "viewer" ? "Shared with you · " : ""}
                        {updatedLabel(b.updated_at)}
                      </span>
                      <span className="summary-open">
                        Open board <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="little-dashboard-empty">
                Your first board is just one click away.
              </p>
            )}
          </section>
          <section
            className="little-dashboard-create"
            aria-label="Create another board"
          >
            <h2>Make another space</h2>
            <p>A fresh board for a new project or person.</p>
            <button onClick={() => void create()} disabled={busy}>
              <Plus size={19} aria-hidden="true" />
              <span>{busy ? "Creating…" : "Create another board"}</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </section>
        </>
      ) : (
        <>
          <section
            className={`little-welcome${login || code ? " is-login" : ""}`}
          >
            <div className="little-kicker">
              <span />
              {login || code ? "WELCOME BACK" : "ONE LITTLE BOARD"}
            </div>
            <h1>
              {login || code ? (
                <>
                  Your boards.
                  <br />
                  <span>Just an email away.</span>
                </>
              ) : (
                <>
                  A little less
                  <br />
                  <span>to remember.</span>
                </>
              )}
            </h1>
            <p className="little-intro">
              {login || code
                ? "A link in your inbox. No password to remember."
                : "A calm place for what’s next. Start on your own, or share with someone."}
            </p>
            {error && (
              <p className="draft-error" role="alert">
                {error}
              </p>
            )}
            {login || code ? (
              <MagicLinkForm
                code={code || undefined}
                ready={ready}
                onBack={() => {
                  setLogin(false);
                  navigate();
                }}
              />
            ) : (
              <>
                <div className="opening-actions">
                  <button
                    className="little-primary"
                    onClick={() => void create()}
                    disabled={busy}
                  >
                    <Plus size={20} />
                    {busy ? "Creating…" : "Create board"}
                    <ArrowRight size={18} />
                  </button>
                  {!email && (
                    <button
                      className="little-secondary"
                      onClick={() => setLogin(true)}
                    >
                      <Mail size={18} />
                      Sign in with email
                    </button>
                  )}
                </div>
                <p className="little-caption">
                  Start without signing in. Save to your email whenever you’re
                  ready.
                </p>
                <div
                  className="little-statuses"
                  aria-label="Three simple sections"
                >
                  <span>
                    <i />
                    Pending
                  </span>
                  <span>
                    <i className="waiting" />
                    Waiting
                  </span>
                  <span>
                    <Check size={14} />
                    Done
                  </span>
                </div>
              </>
            )}
          </section>
          {!login && !code && boards.length > 0 && (
            <section className="little-recents" aria-label="Your boards">
              <button
                className="all-items-entry"
                onClick={() => navigate("all")}
              >
                All items <ArrowRight size={18} />
              </button>
              <h2>Pick up where you left off</h2>
              {boards.map((b) => (
                <button
                  className="little-recent"
                  key={b.id}
                  onClick={() => navigate(b.code)}
                >
                  <span className="recent-number">{b.code}</span>
                  <span>
                    <strong>{b.title}</strong>
                    <small>
                      {b.access === "viewer"
                        ? "Shared with you"
                        : b.claimed
                          ? "Saved to your email"
                          : "Saved on this device"}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </section>
          )}
        </>
      )}
      <footer className="little-footer">
        <span>
          {email ? `Signed in as ${email}` : "Small lists. A clearer head."}
        </span>
        {email && (
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await memoRequest("/api/email", { action: "logout" });
                try {
                  for (const key of Object.keys(sessionStorage))
                    if (key.startsWith("memo:draft:v1:"))
                      sessionStorage.removeItem(key);
                } catch {}
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out
          </button>
        )}
      </footer>
    </main>
  );
}
