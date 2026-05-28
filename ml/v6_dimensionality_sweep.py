#!/usr/bin/env python3
"""
V6 Embedding Dimensionality Sweep

Test if 4, 8, 16, or 32 latent factors produce better generalization.
Higher dimensions capture more structure but risk overfitting on small sample (50 contexts).
"""

import csv
import json
from collections import defaultdict, Counter
from datetime import datetime
import numpy as np
from sklearn.decomposition import NMF
from sklearn.metrics.pairwise import cosine_similarity


def load_trips(csv_path):
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
                    'journey_id': row['journey_id'],
                })
    return trips


def build_transfer_matrix(trips):
    contexts = defaultdict(lambda: Counter())
    all_routes = set()
    
    for trip in trips:
        context = (trip['start_stop'], trip['prev_route'])
        contexts[context][trip['route']] += 1
        all_routes.add(trip['route'])
    
    context_list = sorted(contexts.keys())
    route_list = sorted(all_routes)
    
    context_to_idx = {ctx: i for i, ctx in enumerate(context_list)}
    idx_to_context = {i: ctx for ctx, i in context_to_idx.items()}
    
    n_contexts = len(context_list)
    n_routes = len(route_list)
    matrix = np.zeros((n_contexts, n_routes))
    
    for ctx, route_counts in contexts.items():
        i = context_to_idx[ctx]
        for route, count in route_counts.items():
            j = sorted(all_routes).index(route)
            matrix[i, j] = count
    
    return matrix, context_to_idx, idx_to_context, contexts, route_list


def learn_embeddings(matrix, n_factors):
    nmf = NMF(n_components=n_factors, init='random', random_state=42, max_iter=300)
    context_embeddings = nmf.fit_transform(matrix)
    return context_embeddings


def predict_via_knn(context_idx, context_embeddings, idx_to_context, contexts, k=2):
    query_embedding = context_embeddings[context_idx:context_idx+1]
    similarities = cosine_similarity(query_embedding, context_embeddings).flatten()
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
        return route_votes.most_common(1)[0][0]
    return None


def evaluate_bootstrap(trips, context_embeddings, context_to_idx, idx_to_context, contexts, k=2, n_samples=100):
    accuracies = []
    np.random.seed(42)
    
    for sample_idx in range(n_samples):
        test_trips = np.random.choice(trips, size=len(trips)//5, replace=False)
        correct = 0
        total = 0
        
        for trip in test_trips:
            context = (trip['start_stop'], trip['prev_route'])
            if context in context_to_idx:
                ctx_idx = context_to_idx[context]
                predicted = predict_via_knn(ctx_idx, context_embeddings, idx_to_context, contexts, k=k)
                if predicted == trip['route']:
                    correct += 1
                total += 1
        
        if total > 0:
            accuracies.append(correct / total)
    
    if accuracies:
        return np.mean(accuracies), np.std(accuracies)
    return 0.0, 0.0


def main():
    print("[V6 Dimensionality] Loading trips...")
    trips = load_trips('ml/trips.csv')
    print(f"  Loaded {len(trips)} trips")
    
    print("[V6 Dimensionality] Building transfer matrix...")
    matrix, context_to_idx, idx_to_context, contexts, routes = build_transfer_matrix(trips)
    print(f"  Matrix: {matrix.shape} ({len(contexts)} contexts, {len(routes)} routes)")
    
    # Global baseline
    route_counts = Counter(trip['route'] for trip in trips)
    global_most_common = route_counts.most_common(1)[0][0]
    global_baseline = sum(1 for trip in trips if trip['route'] == global_most_common) / len(trips)
    
    print(f"\n[V6 Dimensionality] Global baseline: {global_baseline:.1%}")
    print(f"\n[V6 Dimensionality] Testing dimensions: 4, 8, 16, 32")
    print(f"{'Factors':<8} {'Accuracy':<12} {'Std Dev':<10} {'Gain vs Global':<15}")
    print("-" * 50)
    
    results = {}
    for n_factors in [4, 8, 16, 32]:
        context_embeddings = learn_embeddings(matrix, n_factors=n_factors)
        accuracy, std = evaluate_bootstrap(trips, context_embeddings, context_to_idx, idx_to_context, contexts, k=2, n_samples=100)
        gain = accuracy - global_baseline
        results[n_factors] = {'accuracy': accuracy, 'std': std, 'gain': gain}
        print(f"{n_factors:<8} {accuracy:.1%}  ± {std:.1%}  {gain:+.1%}")
    
    # Find best
    best_factors = max(results.keys(), key=lambda k: results[k]['accuracy'])
    best_result = results[best_factors]
    
    print("\n" + "="*50)
    print(f"Best: {best_factors} factors → {best_result['accuracy']:.1%} ± {best_result['std']:.1%}")
    print("="*50)
    
    # Summary
    summary = {
        'timestamp': datetime.now().isoformat(),
        'global_baseline': round(global_baseline, 4),
        'results': {str(k): {
            'accuracy': round(v['accuracy'], 4),
            'std': round(v['std'], 4),
            'gain_vs_global': round(v['gain'], 4)
        } for k, v in results.items()},
        'best_n_factors': int(best_factors),
        'best_accuracy': round(best_result['accuracy'], 4),
    }
    
    with open('ml/v6_dimensionality_sweep.json', 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\nResults written to ml/v6_dimensionality_sweep.json")
    return results


if __name__ == '__main__':
    main()
