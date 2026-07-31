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

## Needed starting Phase 2 (AutoML training)

- [ ] **Azure Machine Learning workspace** (this auto-creates a Key Vault, a second storage account, and Application Insights alongside it — that's normal)
- [ ] Confirm **serverless compute** is available in your subscription/region for AutoML jobs (no cluster to create ahead of time — the SDK provisions it per-job)
- [ ] An **Azure AD service principal** (or use `az login` locally) with **Contributor** access scoped to the resource group, so the backend can submit AutoML jobs on your behalf

## Needed starting Phase 3 (plain-English summary)

- [ ] A **Gemini API key** (free tier) from [Google AI Studio](https://aistudio.google.com/) — goes into `GEMINI_API_KEY` in `backend/.env`

## Needed starting Phase 4 (deploy)

- [ ] **Azure Static Web Apps** resource (free tier) for the frontend — connected to your GitHub repo, deploy token goes into a GitHub Actions secret
- [ ] **Azure Container Apps environment** + **Container App** (Consumption plan) for the backend
- [ ] **Azure Container Registry** (Basic tier) to hold the backend's Docker image, unless you deploy straight from GitHub Actions
- [ ] GitHub repo **secrets** for CI/CD: Static Web Apps deploy token, Container Registry credentials (or federated OIDC credentials), and any of the connection strings/keys above that the backend needs at runtime

## Cost notes

- Storage account, Static Web Apps, and light Container Apps traffic: effectively free at this scale
- AutoML training is the one real recurring cost — capped by the 15-minute job timeout per run
- Nothing here runs 24/7: Container Apps scales to zero when idle, AutoML compute is serverless and only billed during a job

None of this needs to be done before Phase 1 review — Phase 1 runs entirely
on your machine with local disk storage. Provision Azure resources whenever
you're ready, starting with just the storage account if you want to swap
`STORAGE_BACKEND=azure` early.
