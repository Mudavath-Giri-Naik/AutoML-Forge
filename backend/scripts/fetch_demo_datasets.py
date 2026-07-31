"""
One-time helper: downloads the 3 seed demo datasets from stable public
sources and writes them into backend/app/data/demo_datasets/.

Run once during setup:
    .venv/Scripts/python.exe scripts/fetch_demo_datasets.py

Sources (all public, well-known, freely redistributable CSV mirrors):
  - Titanic (classification)   : datasciencedojo/datasets GitHub mirror
  - California housing (regression) : ageron/handson-ml2 GitHub mirror
  - Airline passengers (forecasting) : jbrownlee/Datasets GitHub mirror
"""
import pathlib
import urllib.request

OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "app" / "data" / "demo_datasets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "titanic.csv": "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv",
    "california_housing.csv": "https://raw.githubusercontent.com/ageron/handson-ml2/master/datasets/housing/housing.csv",
    "airline_passengers.csv": "https://raw.githubusercontent.com/jbrownlee/Datasets/master/airline-passengers.csv",
}


def main():
    for filename, url in SOURCES.items():
        dest = OUT_DIR / filename
        print(f"Downloading {url} -> {dest}")
        req = urllib.request.Request(url, headers={"User-Agent": "automl-forge-setup/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        dest.write_bytes(data)
        print(f"  wrote {len(data):,} bytes")


if __name__ == "__main__":
    main()
