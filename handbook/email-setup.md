# Enable magic-link sign-in

Guest boards already work without a backend. The database is provisioned. Email sign-in is implemented but deliberately disabled until sign-ups, return URLs and the sending service are configured. No test or preview should say an email was sent unless Supabase accepted the request.

## Database

`supabase/migrations/001_little_board.sql` was applied on 26 September 2026 to the existing `shared-memo` project as `little_board_private_storage`. Do not apply it again to that project. It created a new `little_boards` table and the unexposed `little_private` helper schema without changing the previous Shared memo tables. The follow-up `retire_shared_memo_access` migration disables the retired app’s read/edit RPC endpoints while preserving its data. Only confirmed email users may create cloud boards. Owners may edit; the single invited email may read; outsiders and anonymous database callers have no access.

## Email sender

In Supabase **Authentication → Email / SMTP settings**, connect a verified SMTP sender. A provider such as Resend supplies the SMTP host, port, username, and password after its sending domain is verified. Keep the SMTP password in Supabase only, never in this source or frontend environment.

The default Supabase sender is limited to authorized project-team addresses and is not suitable for general visitors. Do not enable the public login flow on that default sender.

Set the sender name to **Little Board**. Use `supabase/templates/magic-link.html` for the Magic Link template, and for signup confirmation if that template is used for first-time email users. Both must retain `{{ .ConfirmationURL }}`. Enable **Allow new users to sign up** and keep email confirmation enabled. The public Auth settings currently report `disable_signup: true`, so this change is required for first-time visitors. No password signup form is used by the app.

## Return address

The current Site URL must be `https://little-board.leolunelove.chatgpt.site/`. Set Supabase's Site URL to that root. Add that exact root to the redirect allow-list, including any GitHub Pages project path and a trailing slash. Allow the app's `?welcome=1` and `?welcome=1&board=123456` redirects; use `https://little-board.leolunelove.chatgpt.site/**` for the current live site. Do not allow arbitrary domains. Add `http://127.0.0.1:3211/**` only for local development.

The app uses Supabase PKCE. Ask recipients to open the link in the browser where they requested it. A used or expired link should offer a fresh sign-in request. If they requested the link while saving a guest board, the app returns to that board and asks them to confirm saving it to the verified email.

## Build settings

`lib/backend.json` contains the live Supabase URL and a publishable key only; neither is a secret. Environment values override these defaults. Never put a service-role or SMTP key there. Email remains off unless `NEXT_PUBLIC_EMAIL_ENABLED=true` is explicitly set for the frontend build.

For local development, set overrides in `.env.local`. For GitHub Actions, add repository variables:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your project HTTPS API URL |
| `SUPABASE_PUBLISHABLE_KEY` | The publishable key, never a service-role key |
| `EMAIL_ENABLED` | `true`, after completing the steps above |

The workflow sets the public base path to the repository name and maps these variables to the frontend's `NEXT_PUBLIC_` settings. Email-disabled builds can contain the publishable database configuration but never service credentials or old board tokens.

## Verify before release

Use an owner and a second test email. Create a guest board, add an item, request a link, open it, and save the board to the verified email. Open a second browser, sign in, and confirm the same board appears. Give the second email view access, copy its link, and verify that account cannot write through either the interface or the database API. Check wrong-account, expired-link and used-link behavior, then sign out. This real mail-and-browser round trip remains required even when the automated tests pass.

References: [Supabase magic links](https://supabase.com/docs/guides/auth/auth-email-passwordless), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
