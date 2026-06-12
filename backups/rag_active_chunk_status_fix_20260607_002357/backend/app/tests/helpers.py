from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.user import User


DEFAULT_TEST_PASSWORD = "StrongPass123"


def create_test_user(
    db: Session,
    email: str,
    role: str | UserRole = UserRole.USER,
    *,
    password: str = DEFAULT_TEST_PASSWORD,
    organization_id: int | None = None,
    full_name: str | None = None,
) -> User:
    resolved_role = role if isinstance(role, UserRole) else UserRole(role)
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            hashed_password=get_password_hash(password),
            full_name=full_name or email,
            role=resolved_role,
            organization_id=organization_id,
            is_active=True,
            is_verified=resolved_role != UserRole.USER,
        )
        db.add(user)
    else:
        user.role = resolved_role
        user.organization_id = organization_id
        user.is_active = True
        user.is_verified = resolved_role != UserRole.USER
        user.hashed_password = get_password_hash(password)
    db.commit()
    db.refresh(user)
    return user


def auth_headers_for(
    client: TestClient,
    db: Session,
    email: str,
    role: str | UserRole = UserRole.USER,
    *,
    password: str = DEFAULT_TEST_PASSWORD,
    organization_id: int | None = None,
    full_name: str | None = None,
) -> dict[str, str]:
    create_test_user(
        db,
        email,
        role,
        password=password,
        organization_id=organization_id,
        full_name=full_name,
    )
    response = client.post("/api/v1/auth/login", json={"username": email, "password": password})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def auth_headers_for_role(
    client: TestClient,
    email: str,
    role: str | UserRole = UserRole.USER,
    *,
    password: str = DEFAULT_TEST_PASSWORD,
    organization_id: int | None = None,
    full_name: str | None = None,
) -> dict[str, str]:
    override = client.app.dependency_overrides[get_db]
    db = next(override())
    return auth_headers_for(
        client,
        db,
        email,
        role,
        password=password,
        organization_id=organization_id,
        full_name=full_name,
    )
