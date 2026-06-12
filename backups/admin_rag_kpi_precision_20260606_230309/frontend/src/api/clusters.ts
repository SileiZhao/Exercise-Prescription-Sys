import { apiClient } from "./client";

export interface ClusterAssignment {
  id: number;
  user_id: number;
  model_id: number | null;
  rule_labels: string[];
  cluster_label: string | null;
  cluster_id: number | null;
  profile_summary: string;
  risk_override: boolean;
  created_at: string;
}

export function classifyMe() {
  return apiClient.post<ClusterAssignment>("/clusters/classify/me").then((response) => response.data);
}

export type ClusterAlgorithm = "KMeans" | "DBSCAN" | "GaussianMixture" | "AgglomerativeClustering";

export function trainClusterModel(payload: { name: string; n_clusters: number; algorithm?: ClusterAlgorithm }) {
  return apiClient.post("/clusters/train", payload).then((response) => response.data);
}

export function listClusterModels() {
  return apiClient.get("/clusters/models").then((response) => response.data);
}

export function updateClusterModelStatus(modelId: number, payload: { status: "TRAINED" | "ACTIVE" | "ARCHIVED"; reason?: string }) {
  return apiClient.patch(`/clusters/models/${modelId}/status`, payload).then((response) => response.data);
}
