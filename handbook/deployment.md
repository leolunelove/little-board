# Deploy Little Board

## GitHub Pages — current hosting

The live app is [littleboard.cc](https://littleboard.cc/). The source is in [leolunelove/little-board](https://github.com/leolunelove/little-board). GitHub Actions runs the tests, builds the static site at the custom-domain root, and publishes `out/` when **Publish Little Board** is dispatched. Keep Pages configured for **GitHub Actions**.

Guest board data stays in each browser until the owner claims it with email. A GitHub push or redeploy does not migrate guest boards between browsers or hosting origins. No task data, sign-in credentials, SMTP keys or private backups belong in this repository or deployment.

## Email and stored boards

Complete [email setup](email-setup.md) before setting the repository variable `EMAIL_ENABLED=true` and running the Pages workflow. The configured email provider sends mail through Supabase custom SMTP; GitHub only builds the public app. Keep the SMTP key inside Supabase. Verify a real magic-link round trip and database isolation with two emails before treating the email feature as live.

## Release

1. Update the source on `main` and confirm checks pass.
2. Run **Publish Little Board** in GitHub Actions.
3. Confirm the workflow's deployment job succeeds and open the live address in a fresh browser.

To roll back, redeploy an earlier known-good commit. Do not rerun schema creation or modify user data as part of a code rollback.
