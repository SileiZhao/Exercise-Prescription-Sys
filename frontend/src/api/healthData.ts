import { apiClient } from "./client";

export type HealthPayload = Record<string, unknown>;

export interface HealthSnapshot {
  profile: HealthPayload | null;
  fitness_test: HealthPayload | null;
  body_composition: HealthPayload | null;
  biochemical_index: HealthPayload | null;
  risk_screening: HealthPayload | null;
  exercise_feedback: HealthPayload | null;
}

export function acceptConsent(payload: { consent_version: string; consent_text: string }) {
  return apiClient.post("/health-data/consent", payload).then((response) => response.data);
}

export function upsertProfile(payload: HealthPayload) {
  return apiClient.put("/health-data/profile", payload).then((response) => response.data);
}

export function createFitnessTest(payload: HealthPayload) {
  return apiClient.post("/health-data/fitness-tests", payload).then((response) => response.data);
}

export function createBodyComposition(payload: HealthPayload) {
  return apiClient.post("/health-data/body-compositions", payload).then((response) => response.data);
}

export function createBiochemicalIndex(payload: HealthPayload) {
  return apiClient.post("/health-data/biochemical-indexes", payload).then((response) => response.data);
}

export function createRiskScreening(payload: HealthPayload) {
  return apiClient.post("/health-data/risk-screenings", payload).then((response) => response.data);
}

export function createExerciseFeedback(payload: HealthPayload) {
  return apiClient.post("/health-data/exercise-feedback", payload).then((response) => response.data);
}

export function getHealthSnapshot() {
  return apiClient.get<HealthSnapshot>("/health-data/snapshot").then((response) => response.data);
}
