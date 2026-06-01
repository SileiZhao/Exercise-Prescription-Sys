import { Navigate, useLocation } from "react-router-dom";

import { getAccessToken } from "../auth/token";

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const location = useLocation();

  if (!getAccessToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
