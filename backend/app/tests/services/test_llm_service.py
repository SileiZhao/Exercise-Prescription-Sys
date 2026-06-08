import json

from app.core.config import Settings
from app.services.llm_service import OllamaProvider, build_llm_provider


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeHTTPClient:
    def __init__(self, payload: dict):
        self.payload = payload
        self.calls = []

    def post(self, url: str, *, json: dict, timeout: float):
        self.calls.append({"url": url, "json": json, "timeout": timeout})
        return FakeResponse(self.payload)


def valid_prescription_payload(risk_level: str = "R1") -> dict:
    return {
        "risk_level": risk_level,
        "cluster_label": "肥胖代谢风险型",
        "goals": ["减脂", "增强心肺"],
        "fitt_vp": {
            "frequency": "每周4次",
            "intensity": "低—中等强度",
            "time": "每次30分钟",
            "type": ["快走", "八段锦"],
            "volume": "每周120分钟",
            "progression": "每2-4周根据反馈调整",
        },
        "precautions": ["监测RPE"],
        "contraindications": ["高强度冲刺"],
        "reassessment": "4周小评估，12周阶段评估",
        "evidence_refs": ["chunk-1"],
        "expert_review_required": risk_level == "R2",
        "safety_notice": "AI 初稿需经过规则校验。",
    }


def valid_llm_payload(risk_level: str = "R1") -> dict:
    return {
        "risk_level": risk_level,
        "cluster_label": "肥胖代谢风险型",
        "goals": ["减脂", "增强心肺"],
        "template": {
            "fitt_vp": valid_prescription_payload(risk_level)["fitt_vp"],
            "precautions": ["监测RPE"],
            "contraindications": ["高强度冲刺"],
        },
        "risk_rules": [],
        "evidence_refs": ["chunk-1"],
    }


def test_ollama_provider_generates_prescription_from_chat_response():
    fake_client = FakeHTTPClient(
        {"message": {"content": json.dumps(valid_prescription_payload(), ensure_ascii=False)}}
    )
    provider = OllamaProvider(
        base_url="http://ollama:11434",
        model="gemma3:latest",
        http_client=fake_client,
    )

    draft = provider.generate_prescription(valid_llm_payload("R1"))

    assert draft.risk_level == "R1"
    assert draft.fitt_vp is not None
    assert fake_client.calls[0]["url"] == "http://ollama:11434/api/chat"
    assert fake_client.calls[0]["json"]["model"] == "gemma3:latest"
    assert fake_client.calls[0]["json"]["format"] == "json"
    assert fake_client.calls[0]["json"]["stream"] is False


def test_build_llm_provider_supports_ollama_aliases():
    provider = build_llm_provider(
        Settings(
            LLM_PROVIDER="local",
            OLLAMA_BASE_URL="http://ollama:11434",
            LOCAL_LLM_MODEL="gemma3:latest",
        )
    )

    assert isinstance(provider, OllamaProvider)
    assert provider.base_url == "http://ollama:11434"
    assert provider.model == "gemma3:latest"
