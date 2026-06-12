from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.audit import AuditLog
from app.tests.helpers import auth_headers_for_role


def login(client: TestClient, email: str, role: str) -> dict[str, str]:
    return auth_headers_for_role(client, email, role)


def test_admin_can_list_knowledge_documents_with_chunk_count(client: TestClient):
    headers = login(client, "knowledge-admin@example.com", "ADMIN")
    client.post(
        "/api/v1/admin/knowledge/documents",
        headers=headers,
        json={
            "title": "高血压运动干预指南",
            "category": "慢病运动",
            "source": "专家共识",
            "source_type": "指南",
            "version": "2024",
            "published_year": "2024",
            "import_batch_id": "batch-api",
            "credibility_level": "high",
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
    assert body["items"][0]["source_type"] == "指南"
    assert body["items"][0]["version"] == "2024"
    assert body["items"][0]["published_year"] == "2024"
    assert body["items"][0]["import_batch_id"] == "batch-api"
    assert body["items"][0]["credibility_level"] == "high"


def test_admin_can_upload_knowledge_text_file_with_chunk_status(client: TestClient):
    headers = login(client, "knowledge-upload-admin@example.com", "ADMIN")

    response = client.post(
        "/api/v1/admin/knowledge/documents/upload",
        headers=headers,
        data={
            "title": "上传高血压指南",
            "category": "慢病运动",
            "source": "上传文件",
            "source_type": "指南",
            "version": "2026",
            "tags": "高血压,R2",
            "credibility_level": "high",
        },
        files={"file": ("hypertension.txt", b"# \xe8\xbf\x90\xe5\x8a\xa8\xe5\x8e\x9f\xe5\x88\x99\n\xe9\xab\x98\xe8\xa1\x80\xe5\x8e\x8b\xe7\xa8\xb3\xe5\xae\x9a\xe6\x9c\x9f\xe5\xbb\xba\xe8\xae\xae\xe4\xbd\x8e\xe5\xbc\xba\xe5\xba\xa6\xe8\xb5\xb7\xe6\xad\xa5\xe3\x80\x82", "text/plain")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "上传高血压指南"
    assert body["file_path"] == "upload://hypertension.txt"
    assert body["source_type"] == "指南"

    listed = client.get(
        "/api/v1/admin/knowledge/documents",
        headers=headers,
        params={"q": "上传高血压指南"},
    )
    assert listed.status_code == 200
    item = listed.json()["items"][0]
    assert item["chunk_count"] >= 1
    assert item["file_path"] == "upload://hypertension.txt"
    assert item["status"] in {"ACTIVE", "INDEX_FAILED"}


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


def test_index_failure_is_visible_in_document_list_and_audit_log(client: TestClient, db_session, monkeypatch):
    headers = login(client, "knowledge-index-error-admin@example.com", "ADMIN")
    monkeypatch.setattr("app.services.knowledge_service.settings.RAG_VECTOR_SEARCH_ENABLED", True)

    def fail_index(self, document_id=None):
        raise RuntimeError("qdrant dimension mismatch")

    monkeypatch.setattr(
        "app.services.knowledge_service.KnowledgeVectorIndexService.index_all",
        fail_index,
    )

    created = client.post(
        "/api/v1/admin/knowledge/documents",
        headers=headers,
        json={
            "title": "索引失败可见化指南",
            "category": "RAG 运维",
            "tags": ["索引", "RAG"],
            "content": "索引失败必须记录原因，不能静默跳过。",
        },
    )
    listed = client.get(
        "/api/v1/admin/knowledge/documents",
        headers=headers,
        params={"q": "索引失败可见化指南"},
    )

    assert created.status_code == 200
    assert created.json()["status"] == "INDEX_FAILED"
    assert "qdrant dimension mismatch" in created.json()["skipped_reason"]
    assert listed.status_code == 200
    assert listed.json()["items"][0]["status"] == "INDEX_FAILED"
    assert "qdrant dimension mismatch" in listed.json()["items"][0]["skipped_reason"]

    log = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "KNOWLEDGE_INDEX_FAILED",
            AuditLog.resource_type == "KnowledgeDocument",
            AuditLog.resource_id == str(created.json()["id"]),
        )
    )
    assert log is not None
    assert log.metadata_json["error"] == "qdrant dimension mismatch"
