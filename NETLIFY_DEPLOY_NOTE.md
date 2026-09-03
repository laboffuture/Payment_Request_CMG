# CMG Audit Control — Netlify deployment

The permission error is fixed in this package. Netlify now invokes both shell scripts through `bash`, so deployment does not depend on ZIP-extracted executable permissions.

## Deploy

1. Extract the ZIP and push the contents to a Git repository connected to Netlify.
2. Netlify will read `netlify.toml` automatically.
3. The configured build command is `bash scripts/build-verified.sh`.
4. The configured publish directory is `dist/client`.

## Important backend note

This project currently uses Cloudflare D1 for authentication and application data. A standard Netlify static deployment can publish the frontend, but the login, password reset, payment APIs, uploads, and persistent database features require either:

- the existing Cloudflare-compatible hosting, or
- a backend migration to Netlify Functions plus an external database and file-storage service.

Do not place an administrator password in the source code, ZIP, or Netlify build logs. Configure credentials and secrets using the hosting provider's encrypted environment-variable controls.
