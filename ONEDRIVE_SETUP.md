# Owner-only OneDrive integration (not yet enabled)

The API supports owner-authenticated Microsoft personal OneDrive authorization and uploading small UTF-8 text files to a folder named Superior ProConnect. No public upload route exists.

Required server-side environment variables:
- MS_CLIENT_ID: Microsoft Entra app registration client ID, with personal Microsoft accounts supported.
- MS_CLIENT_SECRET: confidential web application secret.
- MS_REDIRECT_URI: exact HTTPS callback URL ending in /api/owner/onedrive/callback, registered as a Web redirect URI.
- ONEDRIVE_ENCRYPTION_KEY: 32 random bytes encoded as 64 hexadecimal characters; keep stable and secret.
- ADMIN_TOKEN: existing private owner authentication token.

The owner requests GET /api/owner/onedrive/connect with X-Admin-Token, opens the returned authorizationUrl, then authorizes Microsoft. Check GET /api/owner/onedrive/status with X-Admin-Token. Upload via POST /api/owner/onedrive/upload with X-Admin-Token and JSON {"name":"Services_Directory.txt","content":"..."}.

**Do not enable on Vercel until durable encrypted storage is connected.** This initial implementation stores encrypted refresh tokens using the app's existing db()/save() persistence, which uses a local file and may be ephemeral on serverless hosting. Move ownerOneDrive storage to a durable database and test refresh, reconnect, and deployment restart before production. Do not place client secrets or tokens in browser code or GitHub. Existing /admin.html has not yet been updated with a OneDrive control. This is a backend integration draft, not a finished automatic backup feature.
