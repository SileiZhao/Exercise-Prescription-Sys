from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.models.prescription import PrescriptionRecord
from app.models.template import ActionReviewStatus, ExerciseAction, PrescriptionTemplate, TemplateStatus


class RaisingLLMProvider:
    def generate_prescription(self, payload: dict):
        raise RuntimeError("provider timeout")


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "rx-api@example.com",
            "password": "StrongPass123",
            "full_name": "处方接口用户",
            "role": "USER",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "rx-api@example.com", "password": "StrongPass123"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    client.post(
        "/api/v1/health-data/consent",
        headers=headers,
        json={
            "consent_version": "2026-v1",
            "consent_text": "我同意平台采集六类运动健康数据用于风险筛查和运动处方服务。",
        },
    )
    return headers


def submit_low_risk_health(client: TestClient, headers: dict[str, str]) -> None:
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "生产阻断用户",
            "sex": "男",
            "birth_date": "1988-01-01",
            "height_cm": 170,
            "weight_kg": 82,
            "waist_cm": 96,
            "hip_cm": 102,
            "exercise_goal": ["减脂", "增强心肺"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.post(
        "/api/v1/health-data/fitness-tests",
        headers=headers,
        json={"resting_hr": 78, "sbp": 128, "dbp": 82, "pain_score": 1},
    )
    client.post(
        "/api/v1/health-data/body-compositions",
        headers=headers,
        json={"body_fat_pct": 31, "skeletal_muscle_kg": 25, "visceral_fat_level": 12},
    )
    client.post(
        "/api/v1/health-data/biochemical-indexes",
        headers=headers,
        json={"fbg": 5.8, "tc": 5.0, "tg": 1.5, "hdl_c": 1.1, "ldl_c": 3.0},
    )
    client.post(
        "/api/v1/health-data/risk-screenings",
        headers=headers,
        json={"has_hypertension": False, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )


def test_generate_prescription_api_publishes_low_risk_user(client: TestClient, db_session):
    db_session.add(
        PrescriptionTemplate(
            name="R1接口模板",
            risk_level="R1",
            cluster_tags=["肥胖代谢风险型", "初级运动水平"],
            goal_tags=["减脂", "增强心肺"],
            fitt_vp={
                "frequency": "每周4次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走", "八段锦"],
                "volume": "每周120分钟",
                "progression": "每2周根据反馈调整",
            },
            precautions=["监测RPE"],
            contraindications=["高强度冲刺"],
            status=TemplateStatus.APPROVED,
            version=1,
        )
    )
    db_session.commit()
    headers = auth_headers(client)
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "处方接口用户",
            "sex": "男",
            "birth_date": "1988-01-01",
            "height_cm": 170,
            "weight_kg": 82,
            "waist_cm": 96,
            "hip_cm": 102,
            "exercise_goal": ["减脂", "增强心肺"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.post(
        "/api/v1/health-data/fitness-tests",
        headers=headers,
        json={"resting_hr": 78, "sbp": 128, "dbp": 82, "pain_score": 1},
    )
    client.post(
        "/api/v1/health-data/body-compositions",
        headers=headers,
        json={"body_fat_pct": 31, "skeletal_muscle_kg": 25, "visceral_fat_level": 12},
    )
    client.post(
        "/api/v1/health-data/biochemical-indexes",
        headers=headers,
        json={"fbg": 5.8, "tc": 5.0, "tg": 1.5, "hdl_c": 1.1, "ldl_c": 3.0},
    )
    client.post(
        "/api/v1/health-data/risk-screenings",
        headers=headers,
        json={"has_hypertension": False, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )

    response = client.post("/api/v1/prescriptions/generate", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PUBLISHED"
    assert body["risk_level"] == "R1"
    assert body["fitt_vp"]["type"] == ["快走", "八段锦"]


def test_generate_prescription_rejects_mock_llm_in_production(client: TestClient, monkeypatch):
    headers = auth_headers(client)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "mock")

    response = client.post("/api/v1/prescriptions/generate", headers=headers)

    assert response.status_code == 503
    assert "生产 LLM" in response.json()["detail"]


def test_generate_prescription_returns_503_when_generation_blocked_in_production(
    client: TestClient,
    db_session,
    monkeypatch,
):
    headers = auth_headers(client)
    submit_low_risk_health(client, headers)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "aliyun")
    monkeypatch.setattr(settings, "DASHSCOPE_API_KEY", "dashscope-test-key")
    monkeypatch.setattr(settings, "EMBEDDING_PROVIDER", "dashscope")
    monkeypatch.setattr(settings, "EMBEDDING_MODEL", "text-embedding-v4")
    monkeypatch.setattr(settings, "OCR_ENABLED", True)
    monkeypatch.setattr(
        "app.api.v1.endpoints.prescriptions.ReadinessService.check_ocr",
        lambda self: type("Status", (), {"status": "ok", "detail": "paddleocr:enabled"})(),
    )

    response = client.post("/api/v1/prescriptions/generate", headers=headers)

    assert response.status_code == 503
    assert response.json()["detail"]["reason"] == "no_approved_template"
    assert "无法自动发布" in response.json()["detail"]["message"]
    assert db_session.scalar(select(PrescriptionRecord)) is None


def test_generate_prescription_checks_all_production_providers(client: TestClient, monkeypatch):
    headers = auth_headers(client)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "aliyun")
    monkeypatch.setattr(settings, "DASHSCOPE_API_KEY", "dashscope-test-key")
    monkeypatch.setattr(settings, "EMBEDDING_PROVIDER", "hash")
    monkeypatch.setattr(settings, "OCR_ENABLED", False)

    response = client.post("/api/v1/prescriptions/generate", headers=headers)

    assert response.status_code == 503
    assert "embedding" in response.json()["detail"]
    assert "OCR" in response.json()["detail"]


def test_generate_prescription_provider_exception_returns_503_without_record(
    client: TestClient,
    db_session,
    monkeypatch,
):
    db_session.add(
        PrescriptionTemplate(
            name="R1接口模板",
            risk_level="R1",
            cluster_tags=["肥胖代谢风险型", "初级运动水平"],
            goal_tags=["减脂", "增强心肺"],
            fitt_vp={
                "frequency": "每周4次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走"],
                "volume": "每周120分钟",
                "progression": "每2周根据反馈调整",
            },
            precautions=["监测RPE"],
            contraindications=[],
            status=TemplateStatus.APPROVED,
            version=1,
        )
    )
    db_session.add(
        ExerciseAction(
            name="快走",
            category="有氧",
            risk_level="R1",
            suitable_tags=["减脂", "初级运动水平"],
            contraindication_tags=[],
            intensity="低",
            status=ActionReviewStatus.APPROVED,
        )
    )
    db_session.commit()
    headers = auth_headers(client)
    submit_low_risk_health(client, headers)
    monkeypatch.setattr(
        "app.services.prescription_orchestrator.build_llm_provider",
        lambda: RaisingLLMProvider(),
    )

    response = client.post("/api/v1/prescriptions/generate", headers=headers)

    assert response.status_code == 503
    assert "provider timeout" in response.json()["detail"]
    assert db_session.scalar(select(PrescriptionRecord)) is None


def test_list_my_prescriptions_defaults_to_latest_effective_and_can_include_history(client: TestClient, db_session):
    headers = auth_headers(client)
    old = PrescriptionRecord(
        user_id=1,
        risk_level="R1",
        goals=["增强心肺"],
        fitt_vp={"type": ["快走"]},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="SUPERSEDED",
        version=1,
    )
    latest = PrescriptionRecord(
        user_id=1,
        risk_level="R1",
        goals=["增强心肺"],
        fitt_vp={"type": ["八段锦"]},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        version=2,
        parent_id=1,
    )
    pending = PrescriptionRecord(
        user_id=1,
        risk_level="R2",
        goals=["控压"],
        fitt_vp={"type": ["快走"]},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PENDING_REVIEW",
        version=3,
    )
    db_session.add_all([old, latest, pending])
    db_session.commit()

    response = client.get("/api/v1/prescriptions/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [latest.id]

    history_response = client.get("/api/v1/prescriptions/me?include_history=true", headers=headers)

    assert history_response.status_code == 200
    history = history_response.json()
    assert {item["id"] for item in history} == {old.id, latest.id, pending.id}


def test_generating_new_published_prescription_supersedes_old_published(client: TestClient, db_session):
    db_session.add(
        PrescriptionTemplate(
            name="R1接口模板",
            risk_level="R1",
            cluster_tags=["肥胖代谢风险型", "初级运动水平"],
            goal_tags=["减脂"],
            fitt_vp={
                "frequency": "每周4次",
                "intensity": "低—中等强度",
                "time": "每次30分钟",
                "type": ["快走"],
                "volume": "每周120分钟",
                "progression": "每2周根据反馈调整",
            },
            precautions=["监测RPE"],
            contraindications=[],
            status=TemplateStatus.APPROVED,
            version=1,
        )
    )
    old = PrescriptionRecord(
        user_id=1,
        risk_level="R1",
        goals=["减脂"],
        fitt_vp={"type": ["快走"]},
        precautions=[],
        contraindications=[],
        evidence_refs=[],
        llm_payload={},
        status="PUBLISHED",
        version=1,
    )
    db_session.add(old)
    db_session.commit()
    headers = auth_headers(client)
    client.put(
        "/api/v1/health-data/profile",
        headers=headers,
        json={
            "name": "处方接口用户",
            "sex": "男",
            "birth_date": "1988-01-01",
            "height_cm": 170,
            "weight_kg": 82,
            "waist_cm": 96,
            "hip_cm": 102,
            "exercise_goal": ["减脂"],
            "exercise_habit": "无规律运动",
            "exercise_experience": "初级",
        },
    )
    client.post(
        "/api/v1/health-data/fitness-tests",
        headers=headers,
        json={"resting_hr": 78, "sbp": 128, "dbp": 82, "pain_score": 1},
    )
    client.post(
        "/api/v1/health-data/risk-screenings",
        headers=headers,
        json={"has_hypertension": False, "chest_pain": False, "syncope": False, "abnormal_dyspnea": False},
    )

    response = client.post("/api/v1/prescriptions/generate", headers=headers)

    assert response.status_code == 200
    db_session.refresh(old)
    assert old.status == "SUPERSEDED"
    assert db_session.scalar(select(PrescriptionRecord).where(PrescriptionRecord.status == "PUBLISHED")).id == response.json()["id"]
