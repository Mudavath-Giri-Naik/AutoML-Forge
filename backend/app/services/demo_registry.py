"""Static registry of the 3 preloaded demo datasets, one per task type."""
from pathlib import Path

DEMO_SOURCE_DIR = Path(__file__).resolve().parent.parent / "data" / "demo_datasets"

DEMO_DATASETS = [
    {
        "dataset_id": "demo-titanic",
        "name": "Titanic — Survival Prediction",
        "description": "Classic passenger manifest from the Titanic. Predict who survived from age, class, "
        "fare, and family size. Great example of missing values and mixed column types.",
        "task_type": "classification",
        "source": "Kaggle / Data Science Dojo (public mirror)",
        "source_file": DEMO_SOURCE_DIR / "titanic.csv",
        "default_target_column": "Survived",
        "default_time_column": None,
    },
    {
        "dataset_id": "demo-california-housing",
        "name": "California Housing Prices",
        "description": "1990 California census data: predict median house value for a block group from "
        "location, income, and housing stock features.",
        "task_type": "regression",
        "source": "StatLib / Aurélien Géron 'Hands-On ML' (public mirror)",
        "source_file": DEMO_SOURCE_DIR / "california_housing.csv",
        "default_target_column": "median_house_value",
        "default_time_column": None,
    },
    {
        "dataset_id": "demo-airline-passengers",
        "name": "Airline Passengers — Monthly Forecast",
        "description": "The classic Box-Jenkins airline dataset: monthly totals of international airline "
        "passengers, 1949–1960. Predict future months from the trend and seasonality.",
        "task_type": "forecasting",
        "source": "Box & Jenkins (public mirror)",
        "source_file": DEMO_SOURCE_DIR / "airline_passengers.csv",
        "default_target_column": "Passengers",
        "default_time_column": "Month",
    },
]

DEMO_DATASETS_BY_ID = {d["dataset_id"]: d for d in DEMO_DATASETS}
