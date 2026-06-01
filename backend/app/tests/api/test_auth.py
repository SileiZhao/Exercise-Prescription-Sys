from fastapi.testclient import TestClient


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
    token = login_response.json()["access_token"]

    me_response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"


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


def test_admin_can_list_users(client: TestClient):
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin@example.com",
            "password": "StrongPass123",
            "full_name": "管理员",
            "role": "ADMIN",
        },
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin@example.com", "password": "StrongPass123"},
    )
    token = login_response.json()["access_token"]

    response = client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["total"] == 1
