from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.user import Organization, User


def login(client: TestClient, email: str, role: str) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "full_name": email,
            "role": role,
        },
    )
    response = client.post("/api/v1/auth/login", json={"username": email, "password": "StrongPass123"})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_admin_can_manage_organization_user_and_expert_profile(client: TestClient, db_session):
    admin_headers = login(client, "ops-admin@example.com", "ADMIN")

    org_response = client.post(
        "/api/v1/users/organizations",
        headers=admin_headers,
        json={
            "name": "社区示范中心",
            "type": "COMMUNITY",
            "contact_person": "张老师",
            "contact_phone": "13800001111",
            "address": "郑州市示范路1号",
        },
    )
    assert org_response.status_code == 200
    org_id = org_response.json()["id"]

    org_list = client.get("/api/v1/users/organizations", headers=admin_headers)
    assert org_list.status_code == 200
    assert org_list.json()[0]["name"] == "社区示范中心"

    user_headers = login(client, "managed-user@example.com", "USER")
    user = db_session.scalar(select(User).where(User.email == "managed-user@example.com"))

    update_response = client.patch(
        f"/api/v1/users/{user.id}",
        headers=admin_headers,
        json={
            "role": "EXPERT",
            "organization_id": org_id,
            "is_active": True,
            "is_verified": True,
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "EXPERT"
    assert update_response.json()["organization_id"] == org_id

    profile_response = client.post(
        "/api/v1/users/expert-profiles",
        headers=admin_headers,
        json={
            "user_id": user.id,
            "title": "副教授",
            "specialty": "慢病运动干预",
            "certificate_no": "CERT-001",
            "bio": "负责 R2 处方审核。",
            "review_capacity_per_day": 25,
        },
    )
    assert profile_response.status_code == 200
    assert profile_response.json()["specialty"] == "慢病运动干预"

    expert_list = client.get("/api/v1/users/expert-profiles", headers=admin_headers)
    assert expert_list.status_code == 200
    assert expert_list.json()[0]["user_id"] == user.id
    assert expert_list.json()[0]["user"]["email"] == "managed-user@example.com"

    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "ADMIN_UPDATE_USER",
            AuditLog.resource_type == "User",
            AuditLog.resource_id == str(user.id),
        )
    )
    assert log is not None
    assert log.metadata_json["role"] == "EXPERT"

    assert client.get("/api/v1/users/me", headers=user_headers).status_code == 200


def test_user_cannot_list_organizations(client: TestClient):
    user_headers = login(client, "org-user@example.com", "USER")

    response = client.get("/api/v1/users/organizations", headers=user_headers)

    assert response.status_code == 403


def test_org_admin_user_list_is_limited_to_own_organization(client: TestClient, db_session):
    admin_headers = login(client, "org-scope-admin@example.com", "ADMIN")
    org_a = client.post(
        "/api/v1/users/organizations",
        headers=admin_headers,
        json={"name": "机构A", "type": "COMMUNITY"},
    ).json()
    org_b = client.post(
        "/api/v1/users/organizations",
        headers=admin_headers,
        json={"name": "机构B", "type": "SCHOOL"},
    ).json()
    login(client, "scoped-admin@example.com", "ORG_ADMIN")
    login(client, "scoped-user@example.com", "USER")
    login(client, "other-user@example.com", "USER")
    scoped_admin = db_session.scalar(select(User).where(User.email == "scoped-admin@example.com"))
    scoped_user = db_session.scalar(select(User).where(User.email == "scoped-user@example.com"))
    other_user = db_session.scalar(select(User).where(User.email == "other-user@example.com"))
    scoped_admin.organization_id = org_a["id"]
    scoped_user.organization_id = org_a["id"]
    other_user.organization_id = org_b["id"]
    db_session.commit()

    org_admin_headers = client.post(
        "/api/v1/auth/login",
        json={"username": "scoped-admin@example.com", "password": "StrongPass123"},
    ).json()
    response = client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {org_admin_headers['access_token']}"},
    )

    assert response.status_code == 200
    emails = {item["email"] for item in response.json()["items"]}
    assert "scoped-user@example.com" in emails
    assert "other-user@example.com" not in emails


def test_admin_can_filter_and_paginate_users(client: TestClient):
    admin_headers = login(client, "filter-admin@example.com", "ADMIN")
    login(client, "filter-expert-a@example.com", "EXPERT")
    login(client, "filter-expert-b@example.com", "EXPERT")
    login(client, "filter-user@example.com", "USER")

    first_page = client.get(
        "/api/v1/users",
        headers=admin_headers,
        params={"q": "filter-expert", "role": "EXPERT", "page": 1, "page_size": 1},
    )
    second_page = client.get(
        "/api/v1/users",
        headers=admin_headers,
        params={"q": "filter-expert", "role": "EXPERT", "page": 2, "page_size": 1},
    )

    assert first_page.status_code == 200
    assert second_page.status_code == 200
    assert first_page.json()["total"] == 2
    assert len(first_page.json()["items"]) == 1
    assert len(second_page.json()["items"]) == 1
    assert first_page.json()["items"][0]["id"] != second_page.json()["items"][0]["id"]
    emails = {first_page.json()["items"][0]["email"], second_page.json()["items"][0]["email"]}
    assert emails == {"filter-expert-a@example.com", "filter-expert-b@example.com"}
