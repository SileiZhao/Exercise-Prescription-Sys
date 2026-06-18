const TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const CURRENT_USER_ROLE_KEY = "current_user_role";
const CURRENT_USER_ID_KEY = "current_user_id";
const CURRENT_USER_NAME_KEY = "current_user_name";
const CURRENT_USER_EMAIL_KEY = "current_user_email";
const CURRENT_ORGANIZATION_NAME_KEY = "current_organization_name";

export type AuthUserRole = "USER" | "EXPERT" | "ADMIN" | "RESEARCHER" | "ORG_ADMIN";

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function clearRefreshToken() {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getCurrentUserRole(): AuthUserRole | null {
  return localStorage.getItem(CURRENT_USER_ROLE_KEY) as AuthUserRole | null;
}

export function setCurrentUserRole(role: AuthUserRole) {
  localStorage.setItem(CURRENT_USER_ROLE_KEY, role);
}

export function clearCurrentUserRole() {
  localStorage.removeItem(CURRENT_USER_ROLE_KEY);
}

export function getCurrentUserId(): string | null {
  return localStorage.getItem(CURRENT_USER_ID_KEY);
}

export function setCurrentUserId(userId: number | string) {
  localStorage.setItem(CURRENT_USER_ID_KEY, String(userId));
}

export function clearCurrentUserId() {
  localStorage.removeItem(CURRENT_USER_ID_KEY);
}

export function clearAuthTokens() {
  clearAccessToken();
  clearRefreshToken();
  clearCurrentUserRole();
  clearCurrentUserId();
  localStorage.removeItem(CURRENT_USER_NAME_KEY);
  localStorage.removeItem(CURRENT_USER_EMAIL_KEY);
  localStorage.removeItem(CURRENT_ORGANIZATION_NAME_KEY);
}
