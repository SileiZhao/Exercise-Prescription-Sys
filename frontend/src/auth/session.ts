import { logout as logoutSession } from "../api/auth";
import { clearAuthTokens, getRefreshToken } from "./token";

export async function performLogout() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await logoutSession(refreshToken);
    }
  } catch {
    // Local logout must still clear access if token revocation fails.
  } finally {
    clearAuthTokens();
  }
}
