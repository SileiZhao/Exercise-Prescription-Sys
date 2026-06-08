import axios from "axios";

type ApiLocation = Pick<Location, "protocol" | "hostname">;

export function resolveApiBaseUrl(configuredUrl = import.meta.env.VITE_API_BASE_URL, location: ApiLocation = window.location) {
  if (configuredUrl?.trim()) {
    return configuredUrl;
  }
  if (location.protocol === "http:" || location.protocol === "https:") {
    return "/api/v1";
  }
  return "/api/v1";
}

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 30000
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
