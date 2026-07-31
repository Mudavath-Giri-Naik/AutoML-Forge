# AutoML Forge

Upload a CSV, point at the column you want to predict, and get dozens of
classical ML models trained, compared, explained, and exposed as a live
prediction endpoint — no notebook, no manual tuning, no deployment step.

Built as a live portfolio project. Fully anonymous (no accounts), classical
ML only (no deep learning), cost-conscious by design (serverless/consumption
compute throughout).

**Status: Phase 1 of 4 complete** — dataset upload, schema auto-detection,
and the pre-training data health check. See [`PRD_AutoML_Platform.md`](PRD_AutoML_Platform.md)
for the full spec and [`AZURE_SETUP.md`](AZURE_SETUP.md) for the resource
provisioning checklist.

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
backend/    FastAPI app, Python 3.12+
frontend/   React + Vite + Tailwind SPA
.github/    CI/CD workflows
```

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
`backend/storage_data/` on disk — no Azure account required for local dev.

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

## Demo datasets

| Task | Dataset | Source |
|---|---|---|
| Classification | Titanic survival | [datasciencedojo/datasets](https://github.com/datasciencedojo/datasets) |
| Regression | California housing prices | [ageron/handson-ml2](https://github.com/ageron/handson-ml2) |
| Forecasting | Airline passengers (Box-Jenkins) | [jbrownlee/Datasets](https://github.com/jbrownlee/Datasets) |
