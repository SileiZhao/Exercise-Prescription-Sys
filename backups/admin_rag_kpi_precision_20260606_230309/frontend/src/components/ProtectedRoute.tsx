import { Card, Result, Spin } from "antd";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { getCurrentUser } from "../api/auth";
import { getAccessToken } from "../auth/token";
import {
  clearCurrentUserRole,
  clearCurrentUserId,
  setCurrentUserId,
  setCurrentUserRole,
  type AuthUserRole
} from "../auth/token";

export function ForbiddenPage() {
  return (
    <Card className="forbidden-card">
      <Result
        status="403"
        title="403"
        subTitle="当前账号无权访问此页面"
      />
    </Card>
  );
}

export function ProtectedRoute({
  children,
  allowedRoles
}: {
  children: JSX.Element;
  allowedRoles?: AuthUserRole[];
}) {
  const location = useLocation();
  const token = getAccessToken();
  const [role, setRole] = useState<AuthUserRole | null>(null);
  const [loading, setLoading] = useState(() => Boolean(token));

  useEffect(() => {
    if (!token) {
      setRole(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    getCurrentUser()
      .then((user) => {
        if (cancelled) {
          return;
        }
        setCurrentUserRole(user.role);
        setCurrentUserId(user.id);
        setRole(user.role);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        clearCurrentUserRole();
        clearCurrentUserId();
        setRole(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, token]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (loading) {
    return (
      <div className="route-loading">
        <Spin />
      </div>
    );
  }

  if (allowedRoles?.length && (!role || !allowedRoles.includes(role))) {
    return <ForbiddenPage />;
  }

  return children;
}
