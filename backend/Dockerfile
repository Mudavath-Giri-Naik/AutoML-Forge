# Azure Container Apps (Consumption plan) — scales to zero when idle.
FROM python:3.11-slim

WORKDIR /app

# build-essential covers the handful of dependencies without prebuilt
# manylinux wheels for every possible platform; harmless if unused.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Demo dataset CSVs ship inside app/data/demo_datasets — seeded into
# whichever STORAGE_BACKEND is configured on first startup.
COPY app ./app

RUN useradd --create-home --shell /bin/bash appuser
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
