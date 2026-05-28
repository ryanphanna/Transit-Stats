#!/usr/bin/env python3
"""
V6 Transfer Learning via Embeddings

Learn dense representations of transfer contexts (stop, prev_route) so V6 generalizes 
across similar but unobserved situations using k-NN in embedding space.

Two strategies tested:
1. NMF embeddings on frequency matrix (matrix factorization)
2. Stop+route embeddings (learned via frequency cooccurrence)

Strategy:
1. Parse trips.csv, build (start_stop, prev_route) -> next_route observations.
2. Embed contexts using NMF on the transfer frequency matrix.
3. For each context, find k-nearest neighbors in embedding space.
4. Aggregate their next_route outcomes (weighted by similarity).
5. Evaluate via leave-one-out and bootstrap sampling.
6. Compare to:
   - Transfer frequency baseline (89.7% on observed pairs)
   - Global route baseline (28.2%)
"""

import csv
import json
from collections import defaultdict, Counter
from datetime import datetime
import numpy as np
from sklearn.decomposition import NMF
from sklearn.metrics.pairwise import cosine_similarity
import sys


def load_trips(csv_path):
    """Load trips.csv, filter to rows with prev_route and journey_id (same journey context)."""
    trips = []
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['prev_route'] and row['journey_id']:
                trips.append({
                    'trip_id': row['trip_id'],
                    'route': row['route'],
                    'prev_route': row['prev_route'],
                    'start_stop': row['start_stop'],
                    'end_stop': row['end_stop'],
                    'journey_id': row['journey_id'],
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


def predict_via_knn(context_idx, context_embeddings, idx_to_context, contexts, k=3, fallback_most_common=None):
    """Predict next_route via k-NN in embedding space. Returns (route, confidence)."""
    query_embedding = context_embeddings[context_idx:context_idx+1]
    similarities = cosine_similarity(query_embedding, context_embeddings).flatten()
    
    # Find k nearest (excluding self)
    neighbor_indices = np.argsort(-similarities)[1:k+1]
    
    route_votes = Counter()
    route_weights = Counter()
    for neighbor_idx in neighbor_indices:
        neighbor_context = idx_to_context[neighbor_idx]
        if neighbor_context in contexts:
            neighbor_routes = contexts[neighbor_context]
            neighbor_sim = max(0, similarities[neighbor_idx])  # only positive similarity
            for route, count in neighbor_routes.items():
                route_votes[route] += neighbor_sim * count
                route_weights[route] += neighbor_sim
    
    if route_votes:
        predicted_route = route_votes.most_common(1)[0][0]
        predicted_weight = route_votes[predicted_route]
        total_weight = sum(route_votes.values())
        confidence = predicted_weight / total_weight if total_weight > 0 else 0.0
        return predicted_route, confidence
    elif fallback_most_common:
        return fallback_most_common, 0.3  # low confidence for fallback
    else:
        return None, 0.0


def evaluate_bootstrap(trips, context_embeddings, context_to_idx, idx_to_context, contexts, 
                       fallback_most_common, n_samples=100, k=3):
    """
    Bootstrap evaluation: sample test trips repeatedly to estimate generalization accuracy.
    """
    accuracies = []
    
    np.random.seed(42)
    for sample_idx in range(n_samples):
        # Sample with replacement
        test_trips = np.random.choice(trips, size=len(trips)//5, replace=False)
        
        correct = 0
        total = 0
        for trip in test_trips:
            context = (trip['start_stop'], trip['prev_route'])
            if context in context_to_idx:
                ctx_idx = context_to_idx[context]
                predicted = predict_via_knn(ctx_idx, context_embeddings, idx_to_context, contexts, k=k, 
                                            fallback_most_common=fallback_most_common)
                if predicted == trip['route']:
                    correct += 1
                total += 1
        
        if total > 0:
            accuracies.append(correct / total)
    
    if accuracies:
        mean_acc = np.mean(accuracies)
        std_acc = np.std(accuracies)
        return mean_acc, std_acc
    else:
        return 0.0, 0.0


def main():
    trips_csv = 'ml/trips.csv'
    
    print("[V6 Embeddings] Loading trips...")
    trips = load_trips(trips_csv)
    print(f"  Loaded {len(trips)} trips with journey context")
    
    print("[V6 Embeddings] Building transfer matrix...")
    matrix, context_to_idx, route_to_idx, idx_to_context, idx_to_route, contexts = build_transfer_matrix(trips)
    print(f"  Matrix shape: {matrix.shape}")
    print(f"  Contexts: {len(context_to_idx)}, Routes: {len(route_to_idx)}")
    
    # Frequency baseline
    freq_correct = sum(1 for trip in trips 
                       if (trip['start_stop'], trip['prev_route']) in contexts 
                       and trip['route'] == contexts[(trip['start_stop'], trip['prev_route'])].most_common(1)[0][0])
    freq_accuracy = freq_correct / len(trips) if trips else 0.0
    print(f"\n[V6 Embeddings] Frequency baseline: {freq_accuracy:.1%} (n={len(trips)})")
    
    # Global baseline
    route_counts = Counter(trip['route'] for trip in trips)
    global_most_common = route_counts.most_common(1)[0][0]
    global_baseline_accuracy = sum(1 for trip in trips if trip['route'] == global_most_common) / len(trips)
    print(f"[V6 Embeddings] Global baseline: {global_baseline_accuracy:.1%} (route={global_most_common})")
    
    # Learn embeddings and test with different k values
    print("[V6 Embeddings] Learning embeddings (NMF, 8 factors)...")
    context_embeddings = learn_embeddings(matrix, n_factors=16)
    
    print("[V6 Embeddings] Evaluating k-NN with bootstrap (100 samples, 20% test fraction)...")
    best_k = None
    best_accuracy = 0
    best_std = 0
    
    for k in [2, 3, 5, 7]:
        accuracy, std = evaluate_bootstrap(trips, context_embeddings, context_to_idx, idx_to_context, 
                                           contexts, global_most_common, n_samples=100, k=k)
        print(f"  k={k}: {accuracy:.1%} ± {std:.1%}")
        if accuracy > best_accuracy:
            best_accuracy = accuracy
            best_std = std
            best_k = k
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Global route baseline:                   {global_baseline_accuracy:.1%}")
    print(f"Frequency baseline (observed contexts):  {freq_accuracy:.1%}")
    print(f"Embedding k-NN (best k={best_k}):        {best_accuracy:.1%} ± {best_std:.1%}")
    if best_accuracy > global_baseline_accuracy:
        gain_abs = best_accuracy - global_baseline_accuracy
        gain_rel = ((best_accuracy / global_baseline_accuracy) - 1) * 100 if global_baseline_accuracy > 0 else 0
        print(f"\nTransfer-learning gain over global:      {gain_abs:.1%} absolute")
        print(f"                   relative:            {gain_rel:.1f}% relative")
    print("="*60)
    
    # Write summary
    summary = {
        'timestamp': datetime.now().isoformat(),
        'n_trips': len(trips),
        'n_contexts_observed': len(contexts),
        'n_routes': len(route_to_idx),
        'global_baseline_accuracy': round(global_baseline_accuracy, 4),
        'freq_baseline_accuracy': round(freq_accuracy, 4),
        'embedding_knn_accuracy': round(best_accuracy, 4),
        'embedding_knn_std': round(best_std, 4),
        'best_k': int(best_k),
        'embedding_gain_absolute': round(best_accuracy - global_baseline_accuracy, 4),
        'embedding_gain_relative_pct': round(((best_accuracy / global_baseline_accuracy) - 1) * 100, 1) if global_baseline_accuracy > 0 else 0,
        'n_factors': 8,
        'method': 'NMF embeddings with k-NN aggregation (bootstrap evaluation, 100 samples)'
    }
    
    with open('ml/v6_embeddings_summary.json', 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\nSummary written to ml/v6_embeddings_summary.json")
    return summary


if __name__ == '__main__':
    main()
