# Little Board

A little less to remember.

Open the app and choose **Create board** or **Sign in with email**. A new board is empty and saves immediately in the current browser. Email uses a magic link, with no password or code to type. After signing in, a guest board can be saved to that email and reopened on another device.

This is the fresh successor to Shared memo. No old tasks, names, admin passwords or access tokens are included. The old Vercel project was removed and its read/edit database endpoints disabled; its data is held separately in a private backup.

## Current state

- Creating, editing, reordering and reopening guest boards work locally.
- Pending, Waiting, Done, 24-hour archiving, Undo, quick add and light/night appearance are retained.
- Magic-link sign-in, cloud persistence and one-person read-only sharing are implemented.
- The Supabase database is provisioned, with owner-only writes and invited-email reads. The browser uses only the publishable key in `lib/backend.json`.
- Live email delivery is **not enabled** until Brevo SMTP, new sign-ups and the GitHub Pages callback URL are configured. See [email setup](handbook/email-setup.md).
- The live app is on [GitHub Pages](https://leolunelove.github.io/little-board/), built from this repository. There is no Vercel dependency.


## Local preview

Use Node 24 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm preview
```

Open `http://127.0.0.1:3211/`. For development, use `pnpm dev` instead. Guest data is local to the browser and origin. Clearing that browser's site data removes unclaimed boards. Moving hosts does not transfer local boards.

## Repository

| Folder | Contents |
| --- | --- |
| `app/` | Pages, layout and visual styles |
| `components/` | Opening screen, magic-link form and memo interactions |
| `lib/` | Local persistence, Supabase access, navigation and task rules |
| `supabase/` | Fresh schema, RLS policies and branded email template |
| `scripts/` | Static-route export and local preview server |
| `tests/` | UI, local storage, archive, ordering and database permissions |
| `handbook/` | Email setup and deployment instructions |
| `.github/workflows/` | Checks and GitHub Pages deployment |

## Access

A guest board is stored only on its creating device. Its short number is an address, not a credential, and sharing that address does not expose the browser's data. Cloud boards require a confirmed email identity. PostgreSQL Row Level Security limits reads to the owner or the one invited email, and writes to the owner. The frontend contains only a publishable database key when configured. There are no service-role credentials or password-based admin sessions.

Cloud saves read the current board and use a revision check to reject conflicting updates. Claiming keeps the guest copy until the cloud confirms success; retries use the same board UUID. A numeric address may change if its number is already used in the cloud. The verified-email helper and task validator live in an unexposed database schema. Browser sessions use Supabase PKCE and browser storage, so magic links should be opened in the requesting browser.

Giving someone view access does not send an invitation email automatically. The owner copies and sends the clean board link; the recipient signs in with the invited email. No third-party messages are sent merely by entering an invitee's address.

## Deployment

See [the release steps](handbook/deployment.md). The GitHub Pages workflow runs manually and builds static output in `out/`. Static hosts need an SPA fallback for numeric board paths. GitHub Pages uses the generated `404.html` to return to the app and restore the path. On a custom-domain root, leave `NEXT_PUBLIC_BASE_PATH` empty.

## Validation

Automated checks use a simulated browser DOM for interactions and PGlite for real SQL authorization. They do not prove real email delivery or physical-device rendering; complete the email setup checklist before enabling email in production.
