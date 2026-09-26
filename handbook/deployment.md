# Deploy Little Board

## Sites — current hosting

This checkout is registered with Sites. Preserve `.openai/hosting.json`, including its exact project ID and `static.directory: out` configuration. Build at the domain root with no `NEXT_PUBLIC_BASE_PATH`. Keep email disabled until the live database, SMTP sender and allowed return URLs are configured.

Use the Sites publishing workflow to commit and push this exact source to the Site’s managed source repository, package the matching static output, save a version and deploy it. Confirm the deployment reports success before sharing its URL. Sites hosting and a mirror on the owner’s GitHub repository are separate: a successful Sites deployment does not prove that the GitHub mirror was updated.

The user requested a public opening page. Guest board data stays in each browser. No task data, sign-in credentials or private backups are part of this repository or deployment.

## Optional GitHub Pages

The Pages workflow is manual to avoid publishing a second copy automatically. To use it later:

1. Publish this source to the chosen GitHub repository. Never include `.env.local`, private backups, `node_modules`, `.next` or generated archives.
2. Select **Settings → Pages → GitHub Actions** and run **Publish Little Board**.
3. The workflow tests, builds and publishes `out/` at `/REPOSITORY-NAME`. For a custom-domain root, leave `NEXT_PUBLIC_BASE_PATH` empty.

## Email and stored boards

Complete [email setup](email-setup.md) before enabling email. Use the chosen hosting origin for Supabase’s allowed return URLs, then verify a real magic-link round trip and database isolation with two emails.

Guest boards remain in the browser where they were created until explicitly saved to an email. Moving hosting origins does not transfer local storage. Deploying source does not migrate tasks. Keep private credentials in the appropriate service, never in the browser build.

To roll back, republish a previous saved Sites version. Do not rerun schema creation or modify user data as part of a code rollback.
