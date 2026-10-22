# Preview Deployment

Every pull request that touches the `frontend/` directory triggers a Netlify preview
deployment via `.github/workflows/preview.yml`. A unique URL is posted as a PR comment
within about 5 minutes of a push. The environment is automatically torn down when the
PR is closed or merged.

## How it works

1. The workflow fires on PRs targeting `main` when any file under `frontend/` changes,
   for the event types `opened`, `synchronize`, `reopened`, and `closed`.
2. On `opened` / `synchronize` / `reopened`:
   - Dependencies are installed and the TypeScript types are checked.
   - The React + Vite app is built pointed at the **testnet** RPC endpoint.
   - The built `frontend/dist/` directory is deployed to Netlify under a unique alias
     (`pr-<number>`).
   - Any previous preview comment from the GitHub Actions bot is deleted and replaced
     with a new one containing the live URL.
3. On `closed` (PR merged or abandoned):
   - The workflow calls the Netlify API to look up and delete the `pr-<number>` deploy.
   - A teardown notice is posted as a final PR comment.

## Required secrets

Add these in **Settings → Secrets and variables → Actions** of the repository:

| Secret | Description |
|---|---|
| `NETLIFY_AUTH_TOKEN` | Personal access token from [Netlify user settings](https://app.netlify.com/user/applications#personal-access-tokens). Requires **Full access**. |
| `NETLIFY_SITE_ID` | The site's API ID. Find it in Netlify → **Site configuration → General → Site details → Site ID**. |

> **Note:** `GITHUB_TOKEN` is provided automatically by GitHub Actions — no extra
> configuration is needed for posting PR comments.

## Rollback / manual teardown

Preview deployments are isolated per PR alias (`pr-<number>`) and do not affect
production.

To manually delete a preview:

```bash
# List recent deploys and find the one for a given PR alias
curl -s \
  -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
  "https://api.netlify.com/api/v1/sites/$NETLIFY_SITE_ID/deploys?per_page=50" \
  | jq '.[] | {id, deploy_ssl_url}'

# Delete a specific deploy by ID
curl -s -X DELETE \
  -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
  "https://api.netlify.com/api/v1/deploys/<DEPLOY_ID>"
```

To roll back the **production** site after a merged deploy:

1. Open the Netlify dashboard → **Deploys**.
2. Find the last known-good deploy.
3. Click **Publish deploy**.

Or via the Netlify CLI:

```bash
# List recent deploys
netlify deploys --site $NETLIFY_SITE_ID

# Roll back to a specific deploy
netlify deploy --prod --dir frontend/dist --message "rollback to <deploy-id>"
```

## Local preview

```bash
cd frontend
npm ci
npm run build
npm run preview   # serves the production build locally on http://localhost:4173
```
