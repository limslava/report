# Production Checklist

## 1) Environment
- Set `NODE_ENV=production`.
- Set strong `JWT_SECRET` (required in production).
- Set `CORS_ALLOWED_ORIGINS` with real frontend domains (comma-separated).
- Set DB/Redis/SMTP credentials from secure secret storage.
- Set `INVITE_ONLY=true` to disable open registration (admin invites only).
- Set `JWT_EXPIRES_IN` if you need a custom token TTL.
- Set `TRUST_PROXY` for deployments behind a reverse proxy.
- (Optional) Tune DB circuit breaker: `DB_CIRCUIT_FAILURE_THRESHOLD`, `DB_CIRCUIT_OPEN_MS`.

## 2) Database
- Run migrations before first start.
- Configure daily backups and restore test.
- Verify DB access only from trusted network.

## 3) Security
- Confirm HTTPS is enabled at ingress/reverse proxy.
- Keep admin account separate and protected with strong password.
- Review server logs for repeated `401/429` events.

## 4) App Runtime
- Verify `/health` returns `200 OK`.
- Verify `/health/db` returns `200 OK` when DB is available.
- Verify `/health/redis` returns `200 OK` when Redis is available.
- Verify `/health/scheduler` returns `200 OK` when scheduler is enabled.
- Verify email schedule queue and test email.
- Verify login rate limit (`429`) works after repeated failed attempts.

## 5) Release
- Build backend/frontend successfully.
- Deploy with immutable image/tag.
- Smoke test: login -> daily report -> save -> summary -> email test.
