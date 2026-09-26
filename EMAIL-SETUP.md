# Enable email claiming and invitations

Solo boards work without email. Claiming, reopening on another device and inviting one reader use Supabase Auth email codes. The app never sends a sign-in code to the browser in an API response.

## One-time setup

1. Apply `supabase/migrations/003_personal_boards.sql` to the existing Supabase project. This preserves the existing board and tasks. It creates the new board access functions and removes the old single-board restriction. Run it once.
2. Create an account with an email service such as Resend. Add a domain you own and verify the DNS records the service gives you. This is a sending domain; the app can keep its existing Vercel address. A domain purchase is not included or performed automatically.
3. In Supabase → Authentication → Email / SMTP settings, enable Custom SMTP and enter the host, port, username and password provided by that service. Set the sender name to `memo` and a verified sender address such as `hello@your-domain.com`. Do not use Supabase’s restricted default sender for a public launch.
4. In Supabase → Authentication → URL Configuration, set Site URL to `https://shared-memo-eight.vercel.app` and add `https://shared-memo-eight.vercel.app/**` to allowed Redirect URLs. Keep email confirmations and email signups enabled. Use a six-digit email OTP and an expiry of 10 minutes. Leave anonymous Supabase signups disabled: guest boards use their own browser capability.
5. For **Confirm signup** and **Magic link**, set the subject to `Your memo code` and copy `supabase/templates/email-code.html` into the HTML body. The template displays `{{ .Token }}` and opens `{{ .RedirectTo }}`. Both first-time and returning users enter their code inside the app; no callback token is exposed in a board URL.
6. Set Vercel production `EMAIL_ENABLED=true` and redeploy after checking the SMTP connection. No SMTP password or service-role key belongs in the browser or repository. The SMTP credentials stay inside Supabase.
7. Test with two email addresses you control: create a solo board, claim it with the first address, invite the second, open it in a separate browser, and confirm that editing is denied for the second. Replace/remove the invitation and confirm access is revoked. Then sign in from a fresh browser with the first address to recover the board.

The app shows an honest “Email access is being set up” message until `EMAIL_ENABLED=true`; it never reports an email as sent when its sending call failed. Delivery acceptance does not guarantee inbox delivery. If an invitation email fails, the saved sharing permission is shown with a retry/copy-link option.

## Credentials already used by this installation

`MEMO_OWNER_TOKEN` is a server-only capability already present in Vercel. Migration 003 hashes/checks it through the existing board value to authorize the app’s narrow RPC gateway. It is not a service-role database credential. If you later set a distinct `MEMO_APP_KEY`, update `memo_settings.app_key_hash` to its SHA-256 hash as a database administrator at the same time.

To automate database/email configuration, provide an administrator connection outside the source folder. Do not commit Supabase access tokens, SMTP passwords, `.env.local`, Vercel credentials or private backup files.
