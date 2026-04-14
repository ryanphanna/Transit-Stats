"""
TransitStats — End Stop Prediction Training Script
Trains V4 (logistic regression) and V5 (XGBoost) end stop classifiers.

Features: route (one-hot), start_stop (one-hot), hour (sin/cos), day (sin/cos)
Target: end_stop (canonical name)

Outputs:
  ml/model_v4_endstop.json  — logistic regression weights
  ml/model_v5_endstop.onnx  — XGBoost ONNX model
  ml/model_v5_endstop_meta.json — feature names + class labels

Usage:
  GRPC_DNS_RESOLVER=native python3 ml/train_endstop.py
"""

import json
import math
import os
import sys

import numpy as np
import pandas as pd

KEY_PATH = os.path.expanduser("~/Desktop/Dev/Credentials/Firebase for Transit Stats.json")
CSV_PATH = os.path.join(os.path.dirname(__file__), "trips.csv")
OUT_DIR  = os.path.dirname(__file__)


# ---------------------------------------------------------------------------
# 1. Load data
# ---------------------------------------------------------------------------

def load_data():
    if not os.path.exists(CSV_PATH):
        print("trips.csv not found — running export first...")
        os.system(f"GRPC_DNS_RESOLVER=native python3 {os.path.join(OUT_DIR, 'export_trips.py')}")
    df = pd.read_csv(CSV_PATH)
    print(f"Loaded {len(df)} trips from CSV")
    return df


def clean(df):
    # Need route, start_stop, end_stop, hour, day
    df = df[df["route"].notna() & df["start_stop"].notna() & df["end_stop"].notna()].copy()
    df = df[df["start_stop"].str.strip() != ""]
    df = df[df["end_stop"].str.strip() != ""]
    df = df[df["hour_of_day"].notna()]
    df["route"]      = df["route"].astype(str).str.strip()
    df["start_stop"] = df["start_stop"].str.strip()
    df["end_stop"]   = df["end_stop"].str.strip()
    df["hour"]       = df["hour_of_day"].astype(int)
    df["day"]        = df["day_of_week"].astype(int)

    # Strip route suffixes (510a → 510) for grouping
    def base_route(r):
        import re
        if re.match(r"^\d", r):
            m = re.match(r"^\d+", r)
            return m.group(0) if m else r
        return r

    df["route_base"] = df["route"].apply(base_route)

    # Only keep route+start_stop combos that have >= 5 trips (enough signal)
    counts = df.groupby(["route_base", "start_stop"])["end_stop"].count()
    valid  = counts[counts >= 5].reset_index()[["route_base", "start_stop"]]
    df = df.merge(valid, on=["route_base", "start_stop"], how="inner")

    # Only keep end_stop classes with >= 3 occurrences
    end_counts = df["end_stop"].value_counts()
    df = df[df["end_stop"].isin(end_counts[end_counts >= 3].index)]

    print(f"After cleaning: {len(df)} trips, {df['end_stop'].nunique()} end stop classes")
    return df


def build_features(df):
    hour_sin = np.sin(2 * math.pi * df["hour"] / 24)
    hour_cos = np.cos(2 * math.pi * df["hour"] / 24)
    # Convert from Python weekday (0=Mon) to match training convention
    day_sin  = np.sin(2 * math.pi * df["day"] / 7)
    day_cos  = np.cos(2 * math.pi * df["day"] / 7)

    time_features = pd.DataFrame({
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "day_sin":  day_sin,
        "day_cos":  day_cos,
    }, index=df.index)

    route_dummies = pd.get_dummies(df["route_base"].str.lower().str.strip(), prefix="route")
    stop_dummies  = pd.get_dummies(df["start_stop"].str.lower().str.strip(), prefix="stop")

    X = pd.concat([time_features, route_dummies, stop_dummies], axis=1)
    return X


# ---------------------------------------------------------------------------
# 2. Train
# ---------------------------------------------------------------------------

def train_v4(X_train, y_train, classes):
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import LabelEncoder

    le = LabelEncoder()
    le.fit(classes)
    y_enc = le.transform(y_train)

    model = LogisticRegression(max_iter=1000, class_weight="balanced")
    model.fit(X_train, y_enc)
    return model, le


def train_v5(X_train, y_train, classes):
    from sklearn.preprocessing import LabelEncoder
    from xgboost import XGBClassifier

    le = LabelEncoder()
    le.fit(classes)
    y_enc = le.transform(y_train)

    model = XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric="mlogloss",
        verbosity=0,
    )
    model.fit(X_train.values, y_enc)
    return model, le


# ---------------------------------------------------------------------------
# 3. Evaluate
# ---------------------------------------------------------------------------

def evaluate(model, X_test, y_test, le, label):
    from sklearn.metrics import top_k_accuracy_score
    import numpy as np

    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X_test if not hasattr(X_test, 'values') else X_test.values)
    else:
        proba = model.predict_proba(X_test.values)

    y_enc = le.transform(y_test)
    top1 = top_k_accuracy_score(y_enc, proba, k=1, labels=list(range(len(le.classes_))))
    top3 = top_k_accuracy_score(y_enc, proba, k=min(3, len(le.classes_)), labels=list(range(len(le.classes_))))
    print(f"{label}: top-1 {top1:.1%}  top-3 {top3:.1%}  ({len(y_test)} test trips)")
    return top1, top3


# ---------------------------------------------------------------------------
# 4. Export
# ---------------------------------------------------------------------------

def export_v4(model, le, feature_names):
    import numpy as np
    out = {
        "type": "logistic_regression_endstop",
        "version": "4",
        "classes": le.classes_.tolist(),
        "feature_names": feature_names,
        "intercept": model.intercept_.tolist(),
        "coef": model.coef_.tolist(),
    }
    path = os.path.join(OUT_DIR, "model_v4_endstop.json")
    with open(path, "w") as f:
        json.dump(out, f)
    print(f"V4 end stop model → {path}")


def export_v5(model, le, feature_names, top1, top3, n_trips):
    import onnxmltools
    from onnxmltools.convert.common.data_types import FloatTensorType

    path_onnx = os.path.join(OUT_DIR, "model_v5_endstop.onnx")
    try:
        initial_type = [("float_input", FloatTensorType([None, len(feature_names)]))]
        onx = onnxmltools.convert_xgboost(model, initial_types=initial_type, target_opset=12)
        with open(path_onnx, "wb") as f:
            f.write(onx.SerializeToString())
        print(f"V5 end stop model → {path_onnx}")
    except Exception as e:
        print(f"onnxmltools export failed ({e}), saving as XGBoost JSON instead...")
        path_onnx = path_onnx.replace(".onnx", ".json")
        model.save_model(path_onnx)
        print(f"V5 end stop model (JSON) → {path_onnx}")

    meta = {
        "type": "xgboost_endstop",
        "version": "5",
        "classes": le.classes_.tolist(),
        "feature_names": feature_names,
        "top1_accuracy": round(top1, 4),
        "top3_accuracy": round(top3, 4),
        "n_trips": n_trips,
    }
    meta_path = os.path.join(OUT_DIR, "model_v5_endstop_meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"V5 meta → {meta_path}")


# ---------------------------------------------------------------------------
# 5. Main
# ---------------------------------------------------------------------------

def main():
    from sklearn.model_selection import train_test_split

    df = load_data()
    df = clean(df)

    if len(df) < 20:
        print("Not enough training data after cleaning. Need at least 20 trips.")
        sys.exit(1)

    X = build_features(df)
    y = df["end_stop"]
    classes = sorted(y.unique())
    feature_names = list(X.columns)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=None
    )

    print(f"\nTraining on {len(X_train)} trips, testing on {len(X_test)}...")
    print(f"Features: {len(feature_names)}  |  End stop classes: {len(classes)}\n")

    # V4
    print("Training V4 (logistic regression)...")
    v4_model, v4_le = train_v4(X_train, y_train, classes)
    v4_top1, v4_top3 = evaluate(v4_model, X_test, y_test, v4_le, "V4")
    export_v4(v4_model, v4_le, feature_names)

    # V5
    print("\nTraining V5 (XGBoost)...")
    v5_model, v5_le = train_v5(X_train, y_train, classes)
    v5_top1, v5_top3 = evaluate(v5_model, X_test, y_test, v5_le, "V5")
    export_v5(v5_model, v5_le, feature_names, v5_top1, v5_top3, len(df))

    print("\nDone. Copy model files to functions/lib/ to deploy.")


if __name__ == "__main__":
    main()
