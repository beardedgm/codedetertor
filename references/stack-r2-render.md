# Stack Reference: Cloudflare R2 & Render

Written against Cloudflare R2's S3-compatible API and Render web services, late 2026. Items marked "verify" come from secondary sources; treat them as Unverified until confirmed.

## Cloudflare R2 presigned URLs

- **Supported methods.** R2 presigned URLs support GET, PUT, HEAD and DELETE. R2 does not implement presigned POST policies, so the S3 `content-length-range` condition is unavailable; code calling a presigned POST helper against R2 will fail.
- **No signed size range.** A presigned PUT can sign `Content-Type` and an exact `Content-Length`, and the client must send exactly those. There is no signed maximum, so the server must decide the size before signing. Verify: what R2 does when the body differs from the signed length.
- **Reliable pattern:** validate declared size and type server-side, sign a short-lived PUT for a server-generated key (for example a UUID under a tenant prefix), then after upload call `HeadObject` to verify size and type before marking the record usable. A lifecycle rule or sweep deletes uploads never confirmed.
- **Lifetime and handling.** Expiry can range from seconds to seven days; uploads should use minutes. Presigned URLs are bearer tokens: never logged, never stored long-term, never shared across users.
- **Domains.** Presigned URLs work on the S3 API endpoint, not on custom domains.
- **CORS.** Bucket CORS allows only the app's origins and the methods actually signed, and includes `Content-Type` in allowed headers when it is signed.
- **Reads during long sessions.** If assets are served through presigned GETs, check what the client does when one expires mid-session: renewal before expiry, retry on failure, or silent broken images and audio.

## Render web services

- **Deploy overlap.** During a deploy the new instance must pass its health check, traffic switches to it, and the old instance receives SIGTERM about 60 seconds later, followed by a shutdown delay (default 30 seconds, configurable up to 300) before SIGKILL. Old and new code therefore run at the same time. Check that migrations, cron jobs and in-process schedulers are safe to run twice, for example by having each run claim a database row first.
- **Health check.** A health check path is configured and verifies real dependencies such as the database connection, rather than returning a static 200. Each check has a short timeout, and repeated failures cancel the deploy.
- **Graceful shutdown.** On SIGTERM: stop accepting connections, finish in-flight requests, flush the error tracker, close the database connection, exit. The app process must actually receive the signal; a shell wrapper in the start command can swallow it.
- **Overlapping deploys.** Check the workspace's overlapping deploy policy so two deploys cannot race each other.
