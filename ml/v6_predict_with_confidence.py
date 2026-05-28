#!/usr/bin/env python3
"""
V6 Predictor with Confidence Scores

Produces predictions with confidence for each trip context.
Confidence reflects how much data supports the prediction:
- 0.9+: High confidence (2+ observations, dominant route)
- 0.7-0.9: Medium-high confidence (multiple observations, clear pattern)
- 0.5-0.7: Medium confidence (weak evidence)
- <0.5: Low confidence (fallback to embedding/global)
"""

import csv
import json
from collections import defaultdict, Counter
from datetime import datetime
import numpy as np
from sklearn.decomposition import NMF
from sklearn.metrics.pairwise import cosine_similarity


def load_trips(csv_path):
    """Load trips.csv, filter to rows with prev_route and journey_id."""
    trips = []
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['prev_route'] and row['journey_id']:
                start_time = row['start_time']
                date_part = start_time.split('T')[0]
                trips.append({
                    'trip_id': row['trip_id'],
                    'route': row['route'],
                    'prev_route': row['prev_route'],
                    'start_stop': row['start_stop'],
                    'journey_id': row['journey_id'],
                    'date': date_part,
                })
    return trips


def build_transfer_matrix(trips):
    """Build frequency matrix and mappings."""
    contexts = defaultdict(lambda: Counter())
    all_routes = set()
    
    for trip in trips:
        context = (trip['start_stop'], trip['prev_route'])
        contexts[context][trip['route']] += 1
        all_routes.add(trip['route'])
    
    context_list = sorted(contexts.keys())
    route_list = sorted(all_routes)
    
    context_to_idx = {ctx: i for i, ctx in enumerate(context_list)}
    route_to_idx = {route: j for j, route in enumerate(route_list)}
    idx_to_context = {i: ctx for ctx, i in context_to_idx.items()}
    idx_to_route = {j: route for route, j in route_to_idx.items()}
    
    n_contexts = len(context_list)
    n_routes = len(route_list)
    matrix = np.zeros((n_contexts, n_routes))
    
    for ctx, route_counts in contexts.items():
        i = context_to_idx[ctx]
        for route, count in route_counts.items():
            j = route_to_idx[route]
            matrix[i, j] = count
    
    return matrix, context_to_idx, route_to_idx, idx_to_context, idx_to_route, contexts


def learn_embeddings(matrix, n_factors=16):
    """Learn embeddings via NMF."""
    nmf = NMF(n_components=n_factors, init='random', random_state=42, max_iter=300)
    context_embeddings = nmf.fit_transform(matrix)
    return context_embeddings


def predict_with_confidence(stop, prev_route, contexts, context_embeddings, context_to_idx, 
                           idx_to_context, global_most_common, k=3):
    """
    Predict next route with confidence score.
    
    Returns: (predicted_route, confidence, strategy_used)
    
    Strategies (in order):
    1. Frequency > 70% (high confidence)
    2. Frequency 50-70% (medium confidence)
    3. k-NN embeddings (medium-low confidence)
    4. Global fallback (low confidence)
    """
    ctx = (stop, prev_route)
    
    # Strategy 1: Direct frequency observation
    if ctx in contexts:
        routes = contexts[ctx]
        total = sum(routes.values())
        predicted = routes.most_common(1)[0][0]
        confidence = routes[predicted] / total
        
        if confidence >= 0.7:
            return predicted, confidence, 'L1_freq_high'
        elif confidence >= 0.5:
            return predicted, confidence, 'L2_freq_medium'
    
    # Strategy 2: k-NN embeddings
    if ctx in context_to_idx:
        context_idx = context_to_idx[ctx]
        query_embedding = context_embeddings[context_idx:context_idx+1]
        similarities = cosine_similarity(query_embedding, context_embeddings).flatten()
        
        # Find k nearest neighbors (excluding self)
        neighbor_indices = np.argsort(-similarities)[1:k+1]
        
        route_votes = Counter()
        for neighbor_idx in neighbor_indices:
            neighbor_context = idx_to_context[neighbor_idx]
            if neighbor_context in contexts:
                neighbor_routes = contexts[neighbor_context]
                neighbor_sim = max(0, similarities[neighbor_idx])
                for route, count in neighbor_routes.items():
                    route_votes[route] += neighbor_sim * count
        
        if route_votes:
            predicted = route_votes.most_common(1)[0][0]
            predicted_weight = route_votes[predicted]
            total_weight = sum(route_votes.values())
            confidence = predicted_weight / total_weight if total_weight > 0 else 0.0
            return predicted, confidence, 'L3_embedding'
    
    # Strategy 3: Global fallback
    return global_most_common, 0.25, 'L4_global'


def main():
    trips_csv = 'ml/trips.csv'
    
    print("[V6 Confidence Predictor] Loading trips...")
    all_trips = load_trips(trips_csv)
    print(f"  Loaded {len(all_trips)} trips")
    
    # Split: 80% train, 20% test
    dates = sorted(set(t['date'] for t in all_trips))
    split_idx = int(len(dates) * 0.8)
    train_dates = set(dates[:split_idx])
    test_dates = set(dates[split_idx:])
    
    train_trips = [t for t in all_trips if t['date'] in train_dates]
    test_trips = [t for t in all_trips if t['date'] in test_dates]
    
    print(f"  Train: {len(train_trips)} trips ({len(train_dates)} days)")
    print(f"  Test: {len(test_trips)} trips ({len(test_dates)} days)")
    
    print("[V6 Confidence Predictor] Building transfer matrix from training data...")
    matrix, context_to_idx, route_to_idx, idx_to_context, idx_to_route, contexts = build_transfer_matrix(train_trips)
    print(f"  Matrix shape: {matrix.shape}")
    print(f"  Contexts: {len(context_to_idx)}, Routes: {len(route_to_idx)}")
    
    print("[V6 Confidence Predictor] Learning embeddings (16 factors)...")
    context_embeddings = learn_embeddings(matrix, n_factors=16)
    
    # Global baseline
    route_counts = Counter(t['route'] for t in train_trips)
    global_most_common = route_counts.most_common(1)[0][0]
    
    # Make predictions on test set with confidence
    print(f"\n[V6 Confidence Predictor] Making predictions on {len(test_trips)} test trips...\n")
    
    predictions = []
    correct = 0
    strategies = Counter()
    confidences = []
    
    for trip in test_trips:
        predicted, confidence, strategy = predict_with_confidence(
            trip['start_stop'], trip['prev_route'], contexts, context_embeddings,
            context_to_idx, idx_to_context, global_most_common, k=3
        )
        
        is_correct = predicted == trip['route']
        if is_correct:
            correct += 1
        
        strategies[strategy] += 1
        confidences.append(confidence)
        
        predictions.append({
            'trip_id': trip['trip_id'],
            'stop': trip['start_stop'],
            'prev_route': trip['prev_route'],
            'actual_route': trip['route'],
            'predicted_route': predicted,
            'confidence': round(confidence, 3),
            'correct': is_correct,
            'strategy': strategy,
        })
    
    # Summary
    accuracy = correct / len(test_trips) if test_trips else 0
    mean_confidence = np.mean(confidences)
    high_conf_trips = sum(1 for c in confidences if c > 0.7)
    high_conf_correct = sum(1 for p in predictions if p['confidence'] > 0.7 and p['correct'])
    high_conf_accuracy = high_conf_correct / high_conf_trips if high_conf_trips > 0 else 0
    
    print(f"Overall Accuracy: {correct}/{len(test_trips)} = {accuracy:.1%}")
    print(f"Mean Confidence: {mean_confidence:.1%}")
    print(f"High-confidence (>70%) trips: {high_conf_trips}/{len(test_trips)}")
    print(f"  Accuracy on high-confidence: {high_conf_correct}/{high_conf_trips} = {high_conf_accuracy:.1%}\n")
    
    print(f"Strategy usage:")
    for strategy, count in strategies.most_common():
        pct = 100*count/len(test_trips)
        print(f"  {strategy}: {count} ({pct:.0f}%)")
    
    # Save predictions
    output_file = 'ml/v6_predictions_with_confidence.json'
    with open(output_file, 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'n_test': len(test_trips),
            'overall_accuracy': round(accuracy, 4),
            'mean_confidence': round(mean_confidence, 4),
            'high_confidence_trips': high_conf_trips,
            'high_confidence_accuracy': round(high_conf_accuracy, 4),
            'predictions': predictions,
        }, f, indent=2)
    
    print(f"\nPredictions saved to {output_file}")


if __name__ == '__main__':
    main()
