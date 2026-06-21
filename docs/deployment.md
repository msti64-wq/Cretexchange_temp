# Deployment

## Source Of Truth

- Production repo: `msti64-wq/Cretexchange_temp`
- Production branch: `main`
- Railway deploys from this repo and branch
- Do not use `msti64-wq/geohaul` for production changes

## Release Checklist

1. Commit the change to `railway-repo/main`.
2. Push to `msti64-wq/Cretexchange_temp` `main`.
3. Redeploy Railway.
4. Verify startup logs show the latest `gitCommitShort`.
5. Do not test production behavior until the runtime commit hash matches the commit you just shipped.

## Guardrails

- No force-pushes.
- No broad cleanup while debugging production.
- One issue per commit.
- Run `npm run check` and `npm run build` before committing or pushing.
- Keep billing and Stripe changes isolated from unrelated UI work.
