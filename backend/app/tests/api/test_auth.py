from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.user import User
from app.tests.helpers import auth_headers_for


def test_register_login_and_current_user(client: TestClient):
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "user@example.com",
            "phone": "13800000000",
            "password": "StrongPass123",
            "full_name": "普通用户",
            "role": "USER",
        },
    )

    assert register_response.status_code == 201
    created = register_response.json()
    assert created["email"] == "user@example.com"
    assert created["role"] == "USER"
    assert "hashed_password" not in created

    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "user@example.com", "password": "StrongPass123"},
    )

    assert login_response.status_code == 200
    body = login_response.json()
    token = body["access_token"]
    assert body["refresh_token"]
    assert body["must_change_password"] is False

    me_response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"


def test_public_register_cannot_create_privileged_roles(client: TestClient):
    privileged_roles = [
        UserRole.ADMIN,
        UserRole.EXPERT,
        UserRole.RESEARCHER,
        UserRole.ORG_ADMIN,
    ]

    for role in privileged_roles:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": f"{role.value.lower()}-public@example.com",
                "password": "StrongPass123",
                "full_name": f"匿名{role.value}",
                "role": role.value,
                "organization_id": 1,
            },
        )

        assert response.status_code == 201
        assert response.json()["role"] == "USER"
        assert response.json()["organization_id"] is None


def test_duplicate_email_is_rejected(client: TestClient):
    payload = {
        "email": "dupe@example.com",
        "password": "StrongPass123",
        "full_name": "重复用户",
        "role": "USER",
    }

    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    response = client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 409


def test_rbac_blocks_user_from_admin_endpoint(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "user2@example.com",
            "password": "StrongPass123",
            "full_name": "普通用户二",
            "role": "USER",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "user2@example.com", "password": "StrongPass123"},
    )
    token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


def test_admin_can_list_users(client: TestClient, db_session):
    headers = auth_headers_for(client, db_session, "admin@example.com", UserRole.ADMIN)

    response = client.get("/api/v1/users", headers=headers)

    assert response.status_code == 200
    assert response.json()["total"] == 1


def test_refresh_logout_and_change_password_flow(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "security@example.com",
            "password": "StrongPass123",
            "full_name": "安全用户",
            "role": "USER",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "security@example.com", "password": "StrongPass123"},
    )
    tokens = login_response.json()

    refresh_response = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})

    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()
    assert refreshed["access_token"]
    assert refreshed["refresh_token"] != tokens["refresh_token"]

    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reused.status_code == 401

    change_response = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {refreshed['access_token']}"},
        json={"current_password": "StrongPass123", "new_password": "NewStrongPass123"},
    )

    assert change_response.status_code == 200
    assert change_response.json()["must_change_password"] is False
    assert client.post("/api/v1/auth/login", json={"username": "security@example.com", "password": "StrongPass123"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "security@example.com", "password": "NewStrongPass123"}).status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": refreshed["refresh_token"]}).status_code == 401


def test_logout_revokes_refresh_token(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "logout@example.com",
            "password": "StrongPass123",
            "full_name": "退出用户",
            "role": "USER",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "logout@example.com", "password": "StrongPass123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    logout_response = client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})

    assert logout_response.status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token}).status_code == 401


def test_default_account_must_change_password_before_accessing_protected_workflows(client: TestClient, db_session):
    user = User(
        email="seeded@example.com",
        hashed_password=get_password_hash("SeededPass123"),
        full_name="默认账号",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
        must_change_password=True,
    )
    db_session.add(user)
    db_session.commit()
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "seeded@example.com", "password": "SeededPass123"},
    )
    token = login_response.json()["access_token"]

    blocked = client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})
    me = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})

    assert blocked.status_code == 403
    assert "change password" in blocked.json()["detail"]
    assert me.status_code == 200
    assert me.json()["must_change_password"] is True

    changed = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "SeededPass123", "new_password": "ChangedSeededPass123"},
    )
    assert changed.status_code == 200
    db_session.refresh(user)
    assert user.must_change_password is False

    relogin = client.post(
        "/api/v1/auth/login",
        json={"username": "seeded@example.com", "password": "ChangedSeededPass123"},
    )
    new_token = relogin.json()["access_token"]
    allowed = client.get("/api/v1/users", headers={"Authorization": f"Bearer {new_token}"})
    assert allowed.status_code == 200
