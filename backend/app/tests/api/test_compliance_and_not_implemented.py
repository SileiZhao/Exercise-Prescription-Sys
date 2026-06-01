from app.models.enums import UserRole
from app.models.user import User
from scripts.import_compliance_materials import upsert_compliance_document


def test_public_compliance_document_endpoint_returns_active_material(client, db_session):
    upsert_compliance_document(
        db_session,
        {
            "doc_code": "COMPLIANCE_DISCLAIMER",
            "title": "免责声明",
            "version": "v0.1",
            "effective_date": "2026-06-01",
            "applicable_scope": "处方生成",
            "text": "平台建议不替代医疗诊断。",
            "short_notice": "不替代医疗诊断。",
            "review_status": "DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW",
        },
    )
    db_session.commit()

    response = client.get("/api/v1/compliance/materials/COMPLIANCE_DISCLAIMER")

    assert response.status_code == 200
    assert response.json()["title"] == "免责声明"
    assert response.json()["review_status"] == "DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW"


def test_not_implemented_modules_return_501_and_clear_message(client):
    response = client.post("/api/v1/device-integrations/sync")

    assert response.status_code == 501
    assert response.json() == {
        "code": "NOT_IMPLEMENTED",
        "message": "暂未实现，当前版本暂不支持该功能。",
    }


def test_admin_can_list_compliance_materials(client, db_session):
    user = User(
        email="compliance-admin@example.com",
        hashed_password="hash",
        full_name="Compliance Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(user)
    upsert_compliance_document(
        db_session,
        {
            "doc_code": "COMPLIANCE_PRIVACY",
            "title": "隐私政策",
            "version": "v0.1",
            "effective_date": "2026-06-01",
            "applicable_scope": "注册",
            "text": "隐私政策草案。",
            "short_notice": "隐私政策。",
            "review_status": "DRAFT_PENDING_LEGAL_AND_EXPERT_REVIEW",
        },
    )
    db_session.commit()

    from app.core.security import create_access_token

    token = create_access_token(str(user.id))
    response = client.get("/api/v1/admin/compliance/materials", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()[0]["code"] == "COMPLIANCE_PRIVACY"
