# Azure resource checklist

Resources you need to create yourself. Phase 1 only needs the storage
account (and even that's optional for local dev — the backend defaults to
local disk storage). The rest are needed starting Phase 2 (training) and
Phase 4 (deploy) — listed here now so you can provision everything in one
pass if you'd rather not come back to this later.

## Needed for Phase 1 (optional — only if you want to test against real Blob Storage instead of local disk)

- [ ] **Resource group** — e.g. `automl-forge-rg`, pick a region close to you (e.g. `eastus`)
- [ ] **Storage account** (Standard, LRS — cheapest tier)
  - Create a blob **container** named `datasets` inside it
  - Grab either:
    - A **connection string** (Storage account → Access keys), for `AZURE_STORAGE_CONNECTION_STRING`, or
    - Just the **account URL** (`https://<account>.blob.core.windows.net`) if you'd rather authenticate via `az login` / managed identity (`AZURE_STORAGE_ACCOUNT_URL`) — no secret to store
  - Put whichever you choose into `backend/.env`

## Needed starting Phase 2 (AutoML training) — required now

- [ ] **Azure Machine Learning workspace** (this auto-creates a Key Vault, a second storage account, and Application Insights alongside it — that's normal). Can live in the same resource group as the Phase 1 storage account.
- [ ] Confirm **serverless compute** is available in your subscription/region for AutoML jobs (no cluster to create ahead of time — the SDK provisions it per-job by omitting `compute` and setting `resources` on the job)
- [ ] Locally: run `az login` once (the backend authenticates via `DefaultAzureCredential`, which picks up your CLI session — no secret to store). In production this becomes a managed identity on the Container App (Phase 4), still no secret.
- [ ] Your Azure AD identity (or the managed identity used later) needs at least **Contributor** on the resource group so it can submit jobs and read run/model data.
- [ ] Put these three values in `backend/.env` — nothing else is needed to start training:
  ```
  AZURE_ML_SUBSCRIPTION_ID=<your subscription id>
  AZURE_ML_RESOURCE_GROUP=<your resource group>
  AZURE_ML_WORKSPACE_NAME=<your AML workspace name>
  ```

## Needed starting Phase 3 (plain-English summary) — required now

- [ ] A **Gemini API key** (free tier): go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in with a Google account, click "Create API key". Put it in `backend/.env`:
  ```
  GEMINI_API_KEY=<your key>
  ```
  Not Azure-related, no other setup needed — this is the only place an LLM is used in the whole app, and only to narrate results, never for predictions.

## Needed starting Phase 4 (deploy) — required now

You already have `az` installed and logged in, so this is all copy-paste. Uses
your existing resource group (`automl-forge-rg`) and region (`centralindia`,
matching your AML workspace) — adjust if yours differ.

### 1. Container Registry (holds the backend's Docker image)

```bash
az acr create --name automlforgeacr --resource-group automl-forge-rg --sku Basic --admin-enabled false
```

`automlforgeacr` must be globally unique — if it's taken, pick another name and use it consistently below.

### 2. Container Apps environment + the Container App itself

```bash
az extension add --name containerapp --upgrade

az containerapp env create --name automl-forge-env --resource-group automl-forge-rg --location centralindia

az containerapp create \
  --name automl-forge-backend \
  --resource-group automl-forge-rg \
  --environment automl-forge-env \
  --image mcr.microsoft.com/k8se/quickstart:latest \
  --target-port 8000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 2 \
  --cpu 1.0 --memory 2.0Gi
```

That placeholder image is just to stand the app up — the first GitHub Actions
deploy run replaces it with the real backend. `--min-replicas 0` is what
gives you scale-to-zero.

Grab the backend's public URL for later:

```bash
az containerapp show --name automl-forge-backend --resource-group automl-forge-rg --query properties.configuration.ingress.fqdn -o tsv
```

### 3. Let the Container App pull from your registry + reach Azure ML

```bash
# Give the Container App a managed identity...
az containerapp identity assign --name automl-forge-backend --resource-group automl-forge-rg --system-assigned

# ...grab that identity's principal id...
principalId=$(az containerapp show --name automl-forge-backend --resource-group automl-forge-rg --query identity.principalId -o tsv)

# ...and grant it Contributor on the resource group (same permission your
# own `az login` identity needed to submit AutoML jobs), plus AcrPull so it
# can pull images without storing registry credentials.
az role assignment create --assignee "$principalId" --role Contributor --scope /subscriptions/6d78f7be-4ca5-4bfe-b7de-301e08cf3352/resourceGroups/automl-forge-rg
az role assignment create --assignee "$principalId" --role AcrPull --scope $(az acr show --name automlforgeacr --query id -o tsv)

az containerapp registry set --name automl-forge-backend --resource-group automl-forge-rg --server automlforgeacr.azurecr.io --identity system
```

### 4. Set the backend's environment variables (mirrors backend/.env)

```bash
az containerapp update --name automl-forge-backend --resource-group automl-forge-rg --set-env-vars \
  STORAGE_BACKEND=azure \
  AZURE_STORAGE_ACCOUNT_URL="https://<your-storage-account>.blob.core.windows.net" \
  AZURE_BLOB_CONTAINER=datasets \
  AZURE_ML_SUBSCRIPTION_ID=6d78f7be-4ca5-4bfe-b7de-301e08cf3352 \
  AZURE_ML_RESOURCE_GROUP=automl-forge-rg \
  AZURE_ML_WORKSPACE_NAME=automl-forge-ws \
  CORS_ORIGINS="https://<your-static-web-app-url>.azurestaticapps.net"
```

`GEMINI_API_KEY` is a real secret (not just an Azure identity), so set it as a
Container Apps **secret** instead of a plain env var:

```bash
az containerapp secret set --name automl-forge-backend --resource-group automl-forge-rg --secrets gemini-api-key="<your gemini key>"
az containerapp update --name automl-forge-backend --resource-group automl-forge-rg --set-env-vars GEMINI_API_KEY=secretref:gemini-api-key
```

You won't have the real `CORS_ORIGINS` value until step 5 creates the
Static Web App — come back and update it once you have that URL.

### 5. Static Web App (frontend)

```bash
az staticwebapp create --name automl-forge-frontend --resource-group automl-forge-rg --location centralus --sku Free
```

(Static Web Apps isn't available in every region — `centralus` is a safe
default regardless of where your other resources live.) Grab its URL and
deployment token:

```bash
az staticwebapp show --name automl-forge-frontend --resource-group automl-forge-rg --query defaultHostname -o tsv
az staticwebapp secrets list --name automl-forge-frontend --resource-group automl-forge-rg --query properties.apiKey -o tsv
```

### 6. Service principal so GitHub Actions can deploy on your behalf

```bash
az ad sp create-for-rbac --name automl-forge-deploy \
  --role contributor \
  --scopes /subscriptions/6d78f7be-4ca5-4bfe-b7de-301e08cf3352/resourceGroups/automl-forge-rg \
  --sdk-auth
```

Copy the entire JSON output — that's the `AZURE_CREDENTIALS` secret below.

### 7. Add these as GitHub repo secrets

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `AZURE_CREDENTIALS` | the full JSON from step 6 |
| `ACR_NAME` | `automlforgeacr` (just the name, not the full URL) |
| `CONTAINER_APP_NAME` | `automl-forge-backend` |
| `AZURE_RESOURCE_GROUP` | `automl-forge-rg` |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | the token from step 5 |
| `VITE_API_BASE_URL` | `https://<backend fqdn from step 2>` |

### 8. Go live

Push to `main` (or re-run the "Deploy" workflow from the Actions tab). It
builds the backend image, pushes it to ACR, updates the Container App, and
deploys the frontend to Static Web Apps — all in one run. Then go back and
update `CORS_ORIGINS` (step 4) with the real Static Web App URL from step 5
if you haven't already.

## Cost notes

- Storage account, Static Web Apps (Free tier), and light Container Apps traffic: effectively free at this scale
- Container Registry Basic tier: ~$0.17/day flat — the one truly-always-on cost in this list, but it's pennies
- AutoML training is the real recurring cost — capped by the 15-minute job timeout per run
- Nothing else here runs 24/7: Container Apps scales to zero when idle (`--min-replicas 0`), AutoML compute is serverless and only billed during a job

None of this needs to be done before Phase 1 review — Phase 1 runs entirely
on your machine with local disk storage. Provision Azure resources whenever
you're ready, starting with just the storage account if you want to swap
`STORAGE_BACKEND=azure` early.
