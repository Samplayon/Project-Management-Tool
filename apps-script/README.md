# Project Desk Apps Script storage

This script stores Project Desk data in a Google Sheet named `Project Desk Data`.

## Setup

1. Create a new Google Apps Script project.
2. Replace the default script with `Code.gs` from this folder.
3. In Apps Script, open Project Settings and add a script property named `PROJECT_DESK_SYNC_SECRET`.
4. Use the same secret value in Vercel as `PROJECT_DESK_SYNC_SECRET`.
5. Run `setupProjectDeskStorage` once from Apps Script and approve the requested Google permissions.
6. Deploy the Apps Script project as a web app with "Execute as me" and access set to "Anyone".
7. Add the web app URL in Vercel as `PROJECT_DESK_APPS_SCRIPT_URL`.
8. Redeploy the Vercel project.

The browser app talks only to `/api/project-data`. The Vercel function sends the private secret to Apps Script, so the secret is not exposed in `app.js`.
