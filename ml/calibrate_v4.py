import pandas as pd
import numpy as np
import json
import os

with open('model_v4.json', 'r') as f:
    model_data = json.load(f)

classes = np.array(model_data['classes'])
coef = np.array(model_data['coef'])
intercept = np.array(model_data['intercept'])
feature_names = model_data['feature_names']
stop_columns = model_data['stop_columns']

df = pd.read_csv('trips.csv')
def base_route(r):
    import re
    return re.sub(r'[a-zA-Z]+$', '', str(r).strip()).strip()

df['route_base'] = df['route'].apply(base_route)
df['start_time'] = pd.to_datetime(df['start_time'], format='ISO8601', utc=True)
df = df.dropna(subset=['route_base', 'start_stop', 'hour_of_day', 'day_of_week'])

# Filter out routes not in model classes
df = df[df['route_base'].isin(classes)]

print(f"Running backtest calibration on {len(df)} historical trips...")

# Build features matrix manually matching the JS/Python logic exactly
hour_sin_val = np.sin(2 * np.pi * df['hour_of_day'] / 24)
hour_cos_val = np.cos(2 * np.pi * df['hour_of_day'] / 24)
day_sin_val = np.sin(2 * np.pi * df['day_of_week'] / 7)
day_cos_val = np.cos(2 * np.pi * df['day_of_week'] / 7)

df['start_stop_clean'] = df['start_stop'].str.strip().str.lower()

results = []
correct_count = 0

for i, row in df.iterrows():
    x = np.zeros(len(feature_names))
    for j, fn in enumerate(feature_names):
        if fn == 'hour_sin': x[j] = hour_sin_val[i]
        elif fn == 'hour_cos': x[j] = hour_cos_val[i]
        elif fn == 'day_sin': x[j] = day_sin_val[i]
        elif fn == 'day_cos': x[j] = day_cos_val[i]
        elif fn.startswith('stop_') and fn[5:] == row['start_stop_clean']:
            x[j] = 1.0

    logits = intercept + np.dot(coef, x)
    max_logit = np.max(logits)
    exps = np.exp(logits - max_logit)
    probs = exps / np.sum(exps)
    
    best_idx = np.argmax(probs)
    best_prob = probs[best_idx]
    predicted = str(classes[best_idx])
    actual = str(row['route_base'])
    
    is_correct = (predicted == actual)
    if is_correct: correct_count += 1
    
    results.append({
        'prob': best_prob,
        'correct': 1 if is_correct else 0
    })

res_df = pd.DataFrame(results)

print(f"\nOverall Backtest Accuracy (JS Engine Simulation): {correct_count / len(df):.1%}")
print("\n--- Calibration Curve (Confidence Thresholds) ---")
bins = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
res_df['bin'] = pd.cut(res_df['prob'], bins=bins)
calibration = res_df.groupby('bin', observed=False).agg(
    accuracy=('correct', 'mean'),
    count=('correct', 'count')
)

for b, row in calibration.iterrows():
    if row['count'] > 0:
        print(f"When model is {b.left*100:2.0f}% to {b.right*100:2.0f}% confident -> It is correct {row['accuracy']*100:5.1f}% of the time ({int(row['count'])} trips)")
