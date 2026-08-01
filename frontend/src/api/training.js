import { apiClient } from "./client";

export async function submitTrainingJob({ datasetId, taskType, targetColumn, timeColumn, forecastHorizon, primaryMetric }) {
  const { data } = await apiClient.post("/api/training/jobs", {
    dataset_id: datasetId,
    task_type: taskType,
    target_column: targetColumn,
    time_column: timeColumn ?? null,
    forecast_horizon: forecastHorizon ?? null,
    primary_metric: primaryMetric ?? null,
  });
  return data;
}

export async function listRecentJobs(limit = 12) {
  const { data } = await apiClient.get("/api/training/jobs", { params: { limit } });
  return data;
}

export async function getJobStatus(jobId) {
  const { data } = await apiClient.get(`/api/training/jobs/${jobId}/status`);
  return data;
}

export async function getLeaderboard(jobId) {
  const { data } = await apiClient.get(`/api/training/jobs/${jobId}/leaderboard`);
  return data;
}

export async function predict(jobId, features) {
  const { data } = await apiClient.post(`/api/predict/${jobId}`, { features });
  return data;
}

export async function getSummary(jobId) {
  const { data } = await apiClient.get(`/api/training/jobs/${jobId}/summary`);
  return data;
}

export async function getExplanation(jobId) {
  const { data } = await apiClient.get(`/api/training/jobs/${jobId}/explain`);
  return data;
}

export async function getCurlSnippet(jobId) {
  const { data } = await apiClient.get(`/api/predict/${jobId}/curl`, { responseType: "text" });
  return data;
}

export async function getExportCode(jobId) {
  const { data } = await apiClient.get(`/api/predict/${jobId}/code`, { responseType: "text" });
  return data;
}
