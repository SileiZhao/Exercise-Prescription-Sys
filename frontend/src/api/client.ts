import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { clearAuthTokens, getRefreshToken, setAccessToken, setRefreshToken } from "../auth/token";

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

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retryAfterRefresh?: boolean };

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/login") {
    window.history.replaceState(null, "", "/login");
  }
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const requestUrl = originalRequest?.url ?? "";
    const isAuthRefreshRequest = requestUrl.includes("/auth/refresh");
    const isAuthLoginRequest = requestUrl.includes("/auth/login");

    if (error.response?.status === 401 && originalRequest && !originalRequest._retryAfterRefresh && !isAuthRefreshRequest && !isAuthLoginRequest) {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        originalRequest._retryAfterRefresh = true;
        try {
          const refreshResponse = await apiClient.post("/auth/refresh", { refresh_token: refreshToken });
          const nextAccessToken = refreshResponse.data?.access_token;
          const nextRefreshToken = refreshResponse.data?.refresh_token;
          if (nextAccessToken) {
            setAccessToken(nextAccessToken);
            originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
          }
          if (nextRefreshToken) {
            setRefreshToken(nextRefreshToken);
          }
          return apiClient(originalRequest);
        } catch (refreshError) {
          clearAuthTokens();
          redirectToLogin();
          return Promise.reject(refreshError);
        }
      }
      clearAuthTokens();
      redirectToLogin();
    } else if (error.response?.status === 401 && isAuthRefreshRequest) {
      clearAuthTokens();
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);
