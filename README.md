<p align="center">
  <img src="public/icon.svg" width="80" height="80" alt="Little Board icon">
</p>

<h1 align="center">Little Board</h1>

<p align="center">A little less to remember.</p>

<p align="center">
  <a href="https://littleboard.cc/">Open Little Board</a> ·
  <a href="handbook/usage.md">Using Little Board</a> ·
  <a href="handbook/deployment.md">Development & deployment</a>
</p>

## Capture, organise, get on with it

- **Start small.** Create an empty board and add your first item. No sign-in needed to start.
- **Keep it clear.** Pending, Waiting, and Done show what needs attention. Add a short note or checklist when a task needs more detail.
- **Work your way.** Edit inline, reorder items within a board, or switch to a simple list. Paste a request and review the suggested tasks before adding them.
- **See everything.** Keep [All items](https://littleboard.cc/all/) open to work across your boards. Search, filter, edit, and add to a chosen board without returning home.
- **Share with one person.** Save a board to your email, give one email address read-only access, and send them the board link.
- **Keep moving.** Quick add stays within reach. Undo a completion or removal. Finished items move to Archived after 24 hours.
- **Make it comfortable.** Choose light or night mode, expand notes when you need them, and use the same board on a phone or desktop.

## Get started

1. [Open Little Board](https://littleboard.cc/) and choose **Create board**.
2. Name your board and add an item. Move it between Pending, Waiting, and Done as things change.
3. Choose **Save with email** when you want to keep the board across devices. Sign in through the emailed magic link—no password to remember.
4. Open **All items** from Your boards for a working list across your boards, or open a single board to focus.

## Your boards

Guest boards stay in the browser where you create them. Clearing that browser’s site data can remove unclaimed boards; save a board to your email before relying on it across devices. Local boards do not transfer automatically between browsers or website addresses.

Cloud boards are available to their owner and the one invited email address. The owner can edit; the invited person can read. A short board number is an address, not permission to access it. All items respects those same permissions.

Sharing does not automatically email the other person. Copy and send the board link; they sign in with the email you invited. The optional redaction effect is a visual treatment, not a privacy control.

[Read the board and sharing guide →](handbook/usage.md)

## Run locally

Use Node 24 and pnpm 11.

```sh
git clone https://github.com/leolunelove/little-board.git
cd little-board
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

Open [localhost:3211](http://127.0.0.1:3211/). For development with live updates, use `pnpm dev`. Run `pnpm test` and `pnpm typecheck` to check changes.

## Repository guide

| Path | Purpose |
| --- | --- |
| [app/](app/) | Page layout and visual styles |
| [components/](components/) | Boards, All items, task editing, and sign-in interface |
| [lib/](lib/) | Local storage, cloud access, navigation, and task rules |
| [public/](public/) | App icon and public assets |
| [supabase/](supabase/) | Database schema, permissions, and email template |
| [tests/](tests/) | Interaction, storage, ordering, archive, and database checks |
| [scripts/](scripts/) | Static route export and local preview server |
| [handbook/](handbook/) | User guide, email setup, and deployment notes |
| [.github/workflows/](.github/workflows/) | App checks and GitHub Pages publishing |

GitHub Pages hosts [littleboard.cc](https://littleboard.cc/). The **Publish Little Board** workflow builds and deploys the static app from `main` when run manually. See [Development & deployment](handbook/deployment.md) for release steps.

## Built with

Next.js, React, and TypeScript, with Supabase Auth and PostgreSQL for claimed boards. Database row-level security enforces owner-only writes and invited-email reads. The browser uses a publishable key; service-role and email-provider secrets stay out of the app.

Guest boards use browser storage. Cloud boards refresh while you work, and conflicting saves are rejected rather than silently replacing someone else’s changes. The static frontend is hosted on GitHub Pages.
