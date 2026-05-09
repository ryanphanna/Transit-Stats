"""
TransitStats — End Stop Prediction Training Script
Trains V4 (logistic regression) and V5 (XGBoost) end stop classifiers.

Features: route (one-hot), prev_route (one-hot), start_stop (one-hot), hour (sin/cos),
day (sin/cos), last_end_stop (one-hot), minutes_since_last_trip (numeric)
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
import re

import numpy as np
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore
from route_normalization import normalize_route_for_ml

KEY_PATH = os.path.expanduser("~/Desktop/Dev/Credentials/Firebase for Transit Stats.json")
CSV_PATH = os.path.join(os.path.dirname(__file__), "trips.csv")
OUT_DIR  = os.path.dirname(__file__)


# ---------------------------------------------------------------------------
# 1. Data Prep
# ---------------------------------------------------------------------------

def load_data():
    if not os.path.exists(CSV_PATH):
        print("trips.csv not found — running export first...")
        os.system(f"GRPC_DNS_RESOLVER=native python3 {os.path.join(OUT_DIR, 'export_trips.py')}")
    df = pd.read_csv(CSV_PATH)
    print(f"Loaded {len(df)} trips from CSV")
    return df

def load_stops_library():
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    docs = db.collection("stops").stream()
    lib = []
    for doc in docs:
        d = doc.to_dict()
        lib.append({"name": d.get("name"), "aliases": d.get("aliases", [])})
    return lib

def canonicalize_stop(name, lib):
    if not name: return "unknown"
    lower = str(name).strip().lower().replace(" and ", "/").replace(" & ", "/").replace(" @ ", "/").replace(" at ", "/")
    lower = re.sub(r"\s*/\s*", "/", lower)
    
    for item in lib:
        candidates = [item["name"]] + item.get("aliases", [])
        for c in candidates:
            c_norm = str(c).strip().lower().replace(" and ", "/").replace(" & ", "/").replace(" @ ", "/").replace(" at ", "/")
            c_norm = re.sub(r"\s*/\s*", "/", c_norm)
            if c_norm == lower:
                return item["name"].lower().replace(" and ", "/").replace(" & ", "/").replace(" @ ", "/").replace(" at ", "/")
    return lower

def compute_ride_count_weights(df, halflife_rides=100):
    df = df.copy()
    df["_dt"] = pd.to_datetime(df["start_time"], utc=True, errors="coerce")
    df_sorted = df.sort_values("_dt").reset_index(drop=False)

    lambda_val = math.log(2) / halflife_rides
    agency_count = {}
    rides_after = [0] * len(df_sorted)

    for i in range(len(df_sorted) - 1, -1, -1):
        agency = str(df_sorted.at[i, "agency"] or "unknown")
        rides_after[i] = agency_count.get(agency, 0)
        agency_count[agency] = agency_count.get(agency, 0) + 1

    df_sorted["_rides_after"] = rides_after
    df_sorted["_weight"] = df_sorted["_rides_after"].apply(
        lambda r: math.exp(-lambda_val * r)
    )

    weight_series = df_sorted.set_index("index")["_weight"]
    return df.index.map(weight_series).values

def clean(df, lib):
    df = df.copy()
    df["route"]      = df["route"].astype(str).str.strip()
    df["prev_route"] = df["prev_route"].fillna("").astype(str).str.strip()
    df["start_stop"] = df["start_stop"].str.strip()
    df["end_stop"]   = df["end_stop"].str.strip()
    df["hour"]       = df["hour_of_day"].astype(int)
    df["day"]        = df["day_of_week"].astype(int)
    df["minutes_since_last_trip"] = pd.to_numeric(
        df.get("minutes_since_last_trip"), errors="coerce"
    )

    df["route_base"] = df.apply(
        lambda row: normalize_route_for_ml(row.get("route"), row.get("agency")),
        axis=1,
    )
    df["prev_route_base"] = df.apply(
        lambda row: normalize_route_for_ml(row.get("prev_route"), row.get("agency")),
        axis=1,
    )
    df["start_stop"] = df["start_stop"].apply(lambda x: canonicalize_stop(x, lib))
    df["end_stop"] = df["end_stop"].apply(lambda x: canonicalize_stop(x, lib))

    # Add sequence feature: last_end_stop
    df = df.sort_values(["user_id", "start_time"])
    df["last_end_stop"] = df.groupby("user_id")["end_stop"].shift(1).fillna("none")
    df["prev_route_base"] = df["prev_route_base"].replace("", "none").fillna("none")
    df["minutes_since_last_trip"] = df["minutes_since_last_trip"].fillna(-1)
    df["gap_missing"] = (df["minutes_since_last_trip"] < 0).astype(int)
    df["gap_minutes_capped"] = df["minutes_since_last_trip"].clip(lower=0, upper=720)
    df["gap_log"] = np.log1p(df["gap_minutes_capped"]) / math.log1p(720)

    # Filter to combos with >= 5 trips
    counts = df.groupby(["route_base", "start_stop"])["end_stop"].count()
    valid  = counts[counts >= 5].reset_index()[["route_base", "start_stop"]]
    df = df.merge(valid, on=["route_base", "start_stop"], how="inner")

    # Filter to end_stop classes with >= 3 occurrences
    end_counts = df["end_stop"].value_counts()
    df = df[df["end_stop"].isin(end_counts[end_counts >= 3].index)]

    print(f"After cleaning: {len(df)} trips, {df['end_stop'].nunique()} end stop classes")
    return df

def build_features(df):
    hour_sin = np.sin(2 * math.pi * df["hour"] / 24)
    hour_cos = np.cos(2 * math.pi * df["hour"] / 24)
    day_sin  = np.sin(2 * math.pi * df["day"] / 7)
    day_cos  = np.cos(2 * math.pi * df["day"] / 7)

    time_features = pd.DataFrame({
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "day_sin":  day_sin,
        "day_cos":  day_cos,
        "gap_log":  df["gap_log"],
        "gap_missing": df["gap_missing"],
    }, index=df.index)

    route_dummies = pd.get_dummies(df["route_base"].str.lower().str.strip(), prefix="route")
    prev_route_dummies = pd.get_dummies(df["prev_route_base"].str.lower().str.strip(), prefix="prev_route")
    stop_dummies  = pd.get_dummies(df["start_stop"].str.lower().str.strip(), prefix="stop")
    last_stop_dummies = pd.get_dummies(df["last_end_stop"].str.lower().str.strip(), prefix="last_stop")

    X = pd.concat([time_features, route_dummies, prev_route_dummies, stop_dummies, last_stop_dummies], axis=1)
    return X


# ---------------------------------------------------------------------------
# 2. Train & Evaluate
# ---------------------------------------------------------------------------

def train_v4(X_train, y_train, classes, weights_train=None):
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import LabelEncoder
    le = LabelEncoder()
    le.fit(classes)
    y_enc = le.transform(y_train)
    model = LogisticRegression(max_iter=1000, class_weight="balanced")
    model.fit(X_train, y_enc, sample_weight=weights_train)
    return model, le

def train_v5(X_train, y_train, classes, weights_train=None):
    from sklearn.preprocessing import LabelEncoder
    from xgboost import XGBClassifier
    le = LabelEncoder()
    le.fit(classes)
    y_enc = le.transform(y_train)
    model = XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.1,
        use_label_encoder=False, eval_metric="mlogloss", verbosity=0,
    )
    model.fit(X_train.values, y_enc, sample_weight=weights_train)
    return model, le

def evaluate(model, X_test, y_test, le, label):
    from sklearn.metrics import top_k_accuracy_score
    proba = model.predict_proba(X_test if not hasattr(X_test, 'values') else X_test.values)
    y_enc = le.transform(y_test)
    top1 = top_k_accuracy_score(y_enc, proba, k=1, labels=list(range(len(le.classes_))))
    top3 = top_k_accuracy_score(y_enc, proba, k=min(3, len(le.classes_)), labels=list(range(len(le.classes_))))
    print(f"{label}: top-1 {top1:.1%}  top-3 {top3:.1%}  ({len(y_test)} test trips)")
    return top1, top3


# ---------------------------------------------------------------------------
# 3. Export
# ---------------------------------------------------------------------------

def export_v4(model, le, feature_names):
    out = {
        "type": "logistic_regression_endstop",
        "version": "4",
        "classes": le.classes_.tolist(),
        "feature_names": feature_names,
        "intercept": model.intercept_.tolist(),
        "coef": model.coef_.tolist(),
    }
    path = os.path.join(OUT_DIR, "model_v4_endstop.json")
    with open(path, "w") as f: json.dump(out, f)
    print(f"V4 end stop model → {path}")

def export_v5(model, le, feature_names, top1, top3, n_trips):
    import onnxmltools
    from onnxmltools.convert.common.data_types import FloatTensorType
    path_onnx = os.path.join(OUT_DIR, "model_v5_endstop.onnx")
    try:
        initial_type = [("float_input", FloatTensorType([None, len(feature_names)]))]
        onx = onnxmltools.convert_xgboost(model, initial_types=initial_type, target_opset=12)
        with open(path_onnx, "wb") as f: f.write(onx.SerializeToString())
    except Exception as e:
        print(f"onnx failed ({e}), saving XGB JSON...")
        model.save_model(path_onnx.replace(".onnx", ".json"))

    meta = {
        "type": "xgboost_endstop", "version": "5", "classes": le.classes_.tolist(),
        "feature_names": feature_names, "top1_accuracy": round(top1, 4),
        "top3_accuracy": round(top3, 4), "n_trips": n_trips,
    }
    with open(os.path.join(OUT_DIR, "model_v5_endstop_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

def main():
    from sklearn.model_selection import train_test_split
    df = load_data()
    lib = load_stops_library()
    df = clean(df, lib)
    if len(df) < 20: sys.exit(1)
    weights = compute_ride_count_weights(df)
    X = build_features(df)
    y = df["end_stop"]
    classes = sorted(y.unique())
    feature_names = list(X.columns)
    X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(
        X, y, weights, test_size=0.2, random_state=42
    )
    v4_m, v4_le = train_v4(X_train, y_train, classes, weights_train=w_train)
    v4_t1, v4_t3 = evaluate(v4_m, X_test, y_test, v4_le, "V4")
    export_v4(v4_m, v4_le, feature_names)
    v5_m, v5_le = train_v5(X_train, y_train, classes, weights_train=w_train)
    v5_t1, v5_t3 = evaluate(v5_m, X_test, y_test, v5_le, "V5")
    export_v5(v5_m, v5_le, feature_names, v5_t1, v5_t3, len(df))

if __name__ == "__main__":
    main()
