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
