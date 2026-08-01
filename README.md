# AutoML Forge

Upload a CSV, point at the column you want to predict, and get dozens of
classical ML models trained, compared, explained, and exposed as a live
prediction endpoint — no notebook, no manual tuning, no deployment step.

Built as a live portfolio project. Fully anonymous (no accounts), classical
ML only (no deep learning), cost-conscious by design (serverless/consumption
compute throughout).

**Status: Phase 2 of 4 complete** — dataset upload, schema auto-detection,
data health check, and real AutoML training (classification, regression,
forecasting) on Azure ML serverless compute, with job status polling, a
leaderboard, and a live prediction endpoint. See
[`PRD_AutoML_Platform.md`](PRD_AutoML_Platform.md) for the full spec and
[`AZURE_SETUP.md`](AZURE_SETUP.md) for the resource provisioning checklist.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Frontend hosting | Azure Static Web Apps |
| Backend | FastAPI (Python) |
| Backend hosting | Azure Container Apps (Consumption plan) |
| Training | Azure ML AutoML, serverless compute |
| Dataset storage | Azure Blob Storage |
| Narration | Gemini (free tier) |
| CI/CD | GitHub Actions |

## Monorepo layout

```
backend/    FastAPI app, Python 3.11
frontend/   React + Vite + Tailwind SPA
.github/    CI/CD workflows
```

**Why Python 3.11:** it's what's used and verified here. Several Azure
SDK/ML packages this project touches don't yet ship wheels for very new
Python releases (3.13+) on Windows, and older `azureml-*` packages cap out
below 3.12 — 3.11 is the version with the fewest surprises. Use 3.11 for
the backend venv.

## Running locally

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
python scripts/fetch_demo_datasets.py   # one-time: downloads the 3 seed datasets
cp .env.example .env                    # defaults to local disk storage, no Azure needed
uvicorn app.main:app --reload --port 8000
```

Backend runs at http://localhost:8000 (interactive API docs at `/docs`).
With `STORAGE_BACKEND=local` (the default), datasets are stored under
`backend/storage_data/` on disk — no Azure account required for dataset
upload/schema/health-check.

**Training requires an Azure ML workspace.** Without one, dataset upload and
the health check work fully locally, but `/api/training/*` and
`/api/predict/*` return a clear 503 telling you what's missing. To enable
training:

```bash
az login
```

Then fill in `backend/.env`:

```
AZURE_ML_SUBSCRIPTION_ID=<your subscription id>
AZURE_ML_RESOURCE_GROUP=<your resource group>
AZURE_ML_WORKSPACE_NAME=<your AML workspace name>
```

See [`AZURE_SETUP.md`](AZURE_SETUP.md) for how to provision the workspace.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend runs at http://localhost:5173 and talks to the backend at the URL
in `VITE_API_BASE_URL`.

### Try it

1. Open http://localhost:5173
2. Pick one of the 3 demo datasets (or upload your own CSV)
3. Review the auto-detected schema, confirm/override the target column and task type
4. Run the health check and review the findings
5. Pick a primary metric (and forecast horizon, for forecasting) and start training
6. Watch the job status poll live, then review the leaderboard once it completes

Step 5–6 need the Azure ML workspace configured above — training jobs are
capped at 15 minutes and run on serverless compute (nothing left running
afterward).

## Demo datasets

| Task | Dataset | Source |
|---|---|---|
| Classification | Titanic survival | [datasciencedojo/datasets](https://github.com/datasciencedojo/datasets) |
| Regression | California housing prices | [ageron/handson-ml2](https://github.com/ageron/handson-ml2) |
| Forecasting | Airline passengers (Box-Jenkins) | [jbrownlee/Datasets](https://github.com/jbrownlee/Datasets) |
