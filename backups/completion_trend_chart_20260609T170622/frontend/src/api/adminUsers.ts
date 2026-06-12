import { apiClient } from "./client";

export type UserRole = "USER" | "EXPERT" | "ADMIN" | "RESEARCHER" | "ORG_ADMIN";

export interface AdminUser {
  id: number;
  email: string;
  phone: string | null;
  full_name: string;
  role: UserRole;
  organization_id: number | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface UserListResponse {
  items: AdminUser[];
  total: number;
}

export interface UserListParams {
  q?: string;
  role?: UserRole;
  organization_id?: number;
  page?: number;
  page_size?: number;
}

export interface UserUpdatePayload {
  role?: UserRole;
  organization_id?: number | null;
  is_active?: boolean;
  is_verified?: boolean;
}

export interface Organization {
  id: number;
  name: string;
  type: string;
  contact_person: string | null;
  contact_phone: string | null;
  address: string | null;
  status: string;
  created_at: string;
}

export interface OrganizationPayload {
  name: string;
  type?: string;
  contact_person?: string;
  contact_phone?: string;
  address?: string;
}

export interface ExpertProfile {
  id: number;
  user_id: number;
  title: string | null;
  specialty: string | null;
  certificate_no: string | null;
  bio: string | null;
  review_capacity_per_day: number;
  status: string;
  created_at: string;
  user?: AdminUser | null;
}

export interface ExpertProfilePayload {
  user_id: number;
  title?: string;
  specialty?: string;
  certificate_no?: string;
  bio?: string;
  review_capacity_per_day?: number;
}

export function listUsers(params: UserListParams = {}) {
  return apiClient.get<UserListResponse>("/users", { params }).then((response) => response.data);
}

export function updateUser(userId: number, payload: UserUpdatePayload) {
  return apiClient.patch<AdminUser>(`/users/${userId}`, payload).then((response) => response.data);
}

export function listOrganizations() {
  return apiClient.get<Organization[]>("/users/organizations").then((response) => response.data);
}

export function createOrganization(payload: OrganizationPayload) {
  return apiClient.post<Organization>("/users/organizations", payload).then((response) => response.data);
}

export function listExpertProfiles() {
  return apiClient.get<ExpertProfile[]>("/users/expert-profiles").then((response) => response.data);
}

export function createExpertProfile(payload: ExpertProfilePayload) {
  return apiClient.post<ExpertProfile>("/users/expert-profiles", payload).then((response) => response.data);
}
