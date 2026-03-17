# Incident Response

## Trigger Examples

- A credential or token was committed
- The public backend is being abused for training/evaluation jobs
- A deployment was exposed with the wrong CORS or host allowlist
- A dependency advisory requires urgent patching

## Immediate Steps

1. Contain exposure: remove public access, stop the affected deployment, or tighten proxy rules.
2. Rotate exposed credentials and invalidate leaked tokens.
3. Preserve the evidence needed to understand scope: logs, timestamps, commit references, deployment config.
4. Patch the root cause and redeploy.
5. Update `errors.md`, the relevant policy doc, and `README.md` if the operating model changed.
