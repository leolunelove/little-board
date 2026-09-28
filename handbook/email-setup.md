# Enable magic-link sign-in

Little Board is live at https://leolunelove.github.io/little-board/. Guest boards already work. The database and magic-link code are ready; email stays off until the sender and callbacks are configured.

## Brevo sender

1. In Brevo, verify the sender you will use and generate an SMTP key under **Settings → SMTP & API → SMTP**. Use an SMTP key, not an API key.
2. In Supabase project `erygwkyjqtmmuucwnrds`, open **Authentication → Emails → SMTP Settings**. Enable custom SMTP and use host `smtp-relay.brevo.com`, port `587`, the SMTP login displayed by Brevo, and the SMTP key as password. Set sender name **Little Board** and the From address to the verified sender.
3. Keep the SMTP key inside Supabase. Never add it to this repository, GitHub variables, or the browser build. Disable click tracking for authentication emails so links are not rewritten.

The default Supabase sender only sends to project team members. Do not launch public sign-in with it.

## Supabase Auth

Under **Authentication → Sign In / Providers**, enable new user sign-ups, leave email confirmation on, and keep anonymous sign-ins off. The app uses magic links, with no password form. Set the Magic Link and Confirm Signup email templates to `supabase/templates/magic-link.html`, retaining `{{ .ConfirmationURL }}`.

Under **Authentication → URL Configuration**, set the Site URL to `https://leolunelove.github.io/little-board/` and allow `https://leolunelove.github.io/little-board/**` as a redirect URL. Remove the old Vercel callback after confirming nothing else needs it.

## Publish and verify

The source includes only a public Supabase URL and publishable key in `lib/backend.json`. Set GitHub repository variable `EMAIL_ENABLED=true`, then run **Publish Little Board** in Actions. No SMTP secret goes into GitHub.

Create a guest board, request a link, open it in the same browser, claim the board, and confirm it opens after signing in on another device. Invite a second email as reader and confirm it cannot edit. Check that a wrong email receives no board data.

Supabase database migration `001_little_board.sql` and the Shared memo retirement migration were already applied on 26 September 2026; do not rerun them.

References: [Supabase magic links](https://supabase.com/docs/guides/auth/auth-email-passwordless), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
