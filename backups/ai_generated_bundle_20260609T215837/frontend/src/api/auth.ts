import { apiClient } from "./client";

export type UserRole = "USER" | "EXPERT" | "ADMIN" | "RESEARCHER" | "ORG_ADMIN";

export type RegisterPayload = {
  email: string;
  phone?: string;
  password: string;
  full_name: string;
};

export type CurrentUser = {
  id: number;
  email: string;
  phone?: string | null;
  full_name: string;
  role: UserRole;
  organization_id?: number | null;
  is_active: boolean;
  is_verified: boolean;
  must_change_password: boolean;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  must_change_password: boolean;
};

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
};

export async function registerUser(payload: RegisterPayload) {
  const response = await apiClient.post("/auth/register", payload);
  return response.data;
}

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>("/auth/login", payload);
  return response.data;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<{ must_change_password: boolean }> {
  const response = await apiClient.post("/auth/change-password", payload);
  return response.data;
}

export async function logout(refreshToken: string): Promise<{ revoked: boolean }> {
  const response = await apiClient.post("/auth/logout", { refresh_token: refreshToken });
  return response.data;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get<CurrentUser>("/users/me");
  return response.data;
}
