# Deploy Little Board

## GitHub Pages

The live app is [leolunelove.github.io/little-board](https://leolunelove.github.io/little-board/). Its source is in [leolunelove/little-board](https://github.com/leolunelove/little-board). The **Publish Little Board** GitHub Actions workflow runs tests, builds the static site at `/little-board`, and publishes `out/`. Run it manually after merging a release. Pages should use **GitHub Actions** as its source.

Guest board data stays in each browser until claimed with email. Pushing or redeploying does not move unclaimed boards between browsers or hosting origins. Never commit task data, SMTP keys, sign-in credentials or private backups.

## Email release

Complete [email setup](email-setup.md) before setting GitHub variable `EMAIL_ENABLED=true` and running the Pages workflow. Brevo sends mail through Supabase custom SMTP. GitHub builds the public app and needs no SMTP secret. Verify a real magic-link round trip and the invited reader's read-only access before announcing email sign-in.

## Release and rollback

1. Update `main` and confirm checks pass.
2. Run **Publish Little Board** in GitHub Actions.
3. Confirm the deployment succeeds and open the live URL in a fresh browser.

To roll back, publish an earlier known-good commit. Do not rerun database schema creation or alter user data as part of a code rollback.
