from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog


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


def test_admin_can_list_knowledge_documents_with_chunk_count(client: TestClient):
    headers = login(client, "knowledge-admin@example.com", "ADMIN")
    client.post(
        "/api/v1/admin/knowledge/documents",
        headers=headers,
        json={
            "title": "高血压运动干预指南",
            "category": "慢病运动",
            "source": "专家共识",
            "tags": ["高血压", "R2"],
            "content": "高血压稳定期建议低强度起步。\n避免憋气和大负荷力量训练。",
        },
    )
    client.post(
        "/api/v1/admin/knowledge/documents",
        headers=headers,
        json={
            "title": "八段锦动作说明",
            "category": "传统功法",
            "tags": ["八段锦", "R1"],
            "content": "八段锦适合低冲击运动干预。",
        },
    )

    response = client.get(
        "/api/v1/admin/knowledge/documents",
        headers=headers,
        params={"q": "高血压", "category": "慢病运动", "page": 1, "page_size": 10},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "高血压运动干预指南"
    assert body["items"][0]["category"] == "慢病运动"
    assert body["items"][0]["chunk_count"] >= 1


def test_user_cannot_list_admin_knowledge_documents(client: TestClient):
    headers = login(client, "knowledge-user@example.com", "USER")

    response = client.get("/api/v1/admin/knowledge/documents", headers=headers)

    assert response.status_code == 403


def test_admin_can_archive_knowledge_document_and_audit_is_recorded(client: TestClient, db_session):
    headers = login(client, "knowledge-archive-admin@example.com", "ADMIN")
    created = client.post(
        "/api/v1/admin/knowledge/documents",
        headers=headers,
        json={
            "title": "过期高血压运动建议",
            "category": "慢病运动",
            "tags": ["高血压"],
            "content": "高血压用户可以直接进行大负荷抗阻训练。",
        },
    ).json()

    archive_response = client.patch(
        f"/api/v1/admin/knowledge/documents/{created['id']}",
        headers=headers,
        json={"status": "ARCHIVED", "reason": "专家复核后判定为过期资料"},
    )
    search_response = client.post(
        "/api/v1/admin/knowledge/search",
        headers=headers,
        json={"query": "高血压 大负荷抗阻训练", "tags": ["高血压"], "limit": 5},
    )

    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "ARCHIVED"
    assert search_response.status_code == 200
    assert search_response.json() == []

    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "UPDATE_KNOWLEDGE_DOCUMENT_STATUS",
            AuditLog.resource_type == "KnowledgeDocument",
            AuditLog.resource_id == str(created["id"]),
        )
    )
    assert log is not None
    assert log.metadata_json["status"] == "ARCHIVED"
    assert log.metadata_json["reason"] == "专家复核后判定为过期资料"


def test_admin_can_rebuild_knowledge_vector_index(client: TestClient, monkeypatch):
    headers = login(client, "knowledge-reindex-admin@example.com", "ADMIN")

    def fake_index_all(self, document_id=None):
        return {"indexed": 3, "skipped": 1}

    monkeypatch.setattr(
        "app.services.knowledge_service.KnowledgeVectorIndexService.index_all",
        fake_index_all,
    )

    response = client.post("/api/v1/admin/knowledge/reindex", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"indexed": 3, "skipped": 1}
