import pytest

from app.core.config import Settings
from app.services.llm_service import DASHSCOPE_COMPATIBLE_BASE_URL
from app.services.llm_service import OpenAICompatibleProvider
from app.services.llm_service import build_llm_provider


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeHttpClient:
    def __init__(self, response_payload: dict):
        self.response_payload = response_payload
        self.calls: list[dict] = []

    def post(self, url: str, *, headers: dict, json: dict, timeout: float):
        self.calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeResponse(self.response_payload)


def valid_payload() -> dict:
    return {
        "risk_level": "R1",
        "cluster_label": "肥胖代谢风险型",
        "goals": ["减脂", "增强心肺"],
        "template": {
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
        },
        "risk_rules": [],
        "evidence_refs": ["chunk-1"],
    }


def response_with_content(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def test_openai_compatible_provider_posts_chat_completion_and_parses_json():
    content = """
    {
      "risk_level": "R1",
      "cluster_label": "肥胖代谢风险型",
      "goals": ["减脂", "增强心肺"],
      "fitt_vp": {
        "frequency": "每周4次",
        "intensity": "低—中等强度",
        "time": "每次30分钟",
        "type": ["快走", "八段锦"],
        "volume": "每周120分钟",
        "progression": "每2-4周根据反馈调整"
      },
      "precautions": ["监测RPE"],
      "contraindications": ["高强度冲刺"],
      "reassessment": "4周小评估，12周阶段评估",
      "evidence_refs": ["chunk-1"],
      "expert_review_required": false,
      "safety_notice": "AI 初稿需经过规则校验。"
    }
    """
    fake_client = FakeHttpClient(response_with_content(content))
    provider = OpenAICompatibleProvider(
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="test-env-key",
        model="qwen3.7-max",
        http_client=fake_client,
    )

    draft = provider.generate_prescription(valid_payload())

    assert draft.fitt_vp.frequency == "每周4次"
    assert fake_client.calls[0]["url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    assert fake_client.calls[0]["headers"]["Authorization"] == "Bearer test-env-key"
    assert fake_client.calls[0]["json"]["model"] == "qwen3.7-max"
    assert fake_client.calls[0]["json"]["response_format"]["type"] == "json_object"
    assert "FITT-VP" in fake_client.calls[0]["json"]["messages"][0]["content"]


def test_openai_compatible_provider_rejects_invalid_json_content():
    fake_client = FakeHttpClient(response_with_content("不是 JSON"))
    provider = OpenAICompatibleProvider(
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="test-env-key",
        model="qwen3.7-max",
        http_client=fake_client,
    )

    with pytest.raises(ValueError, match="结构化 JSON"):
        provider.generate_prescription(valid_payload())


def test_openai_compatible_provider_enforces_r3_no_training_plan():
    content = """
    {
      "risk_level": "R3",
      "cluster_label": "高风险转介型",
      "goals": ["安全评估"],
      "fitt_vp": {
        "frequency": "每周3次",
        "intensity": "低强度",
        "time": "每次20分钟",
        "type": ["快走"],
        "volume": "每周60分钟",
        "progression": "逐步增加"
      },
      "precautions": ["建议医学评估"],
      "contraindications": [],
      "reassessment": "医学评估后再确定",
      "evidence_refs": [],
      "expert_review_required": true
    }
    """
    fake_client = FakeHttpClient(response_with_content(content))
    provider = OpenAICompatibleProvider(
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="test-env-key",
        model="qwen3.7-max",
        http_client=fake_client,
    )

    with pytest.raises(ValueError, match="R3"):
        provider.generate_prescription({**valid_payload(), "risk_level": "R3"})


def test_build_llm_provider_uses_dashscope_defaults_and_key_alias():
    config = Settings(
        LLM_PROVIDER="aliyun",
        LLM_BASE_URL=None,
        LLM_API_KEY=None,
        DASHSCOPE_API_KEY="test-dashscope-key",
        LLM_MODEL="qwen3.7-max",
    )

    provider = build_llm_provider(config)

    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider.base_url == DASHSCOPE_COMPATIBLE_BASE_URL
    assert provider.api_key == "test-dashscope-key"
    assert provider.model == "qwen3.7-max"
    assert config.LLM_MULTIMODAL_MODEL == "qwen3.6-plus"
