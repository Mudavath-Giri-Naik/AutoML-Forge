import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const apiClient = axios.create({ baseURL });

// Normalizes FastAPI's {detail: "..."} error shape into a plain message string.
export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  return error?.response?.data?.detail || error?.message || fallback;
}
