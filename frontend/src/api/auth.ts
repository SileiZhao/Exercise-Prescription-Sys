import { apiClient } from "./client";

export type UserRole = "USER" | "EXPERT" | "ADMIN" | "RESEARCHER" | "ORG_ADMIN";

export type RegisterPayload = {
  email: string;
  phone?: string;
  password: string;
  full_name: string;
  role: UserRole;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export async function registerUser(payload: RegisterPayload) {
  const response = await apiClient.post("/auth/register", payload);
  return response.data;
}

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>("/auth/login", payload);
  return response.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get("/users/me");
  return response.data;
}
