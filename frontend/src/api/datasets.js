import { apiClient } from "./client";

export async function listDemoDatasets() {
  const { data } = await apiClient.get("/api/datasets/demo");
  return data;
}

export async function getDataset(datasetId) {
  const { data } = await apiClient.get(`/api/datasets/${datasetId}`);
  return data;
}

export async function uploadDataset(file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post("/api/datasets/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
    },
  });
  return data;
}

export async function validateDataset(datasetId, { targetColumn, taskType } = {}) {
  const { data } = await apiClient.post(`/api/datasets/${datasetId}/validate`, {
    target_column: targetColumn ?? null,
    task_type: taskType ?? null,
  });
  return data;
}
