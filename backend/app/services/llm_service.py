import json
from typing import Any, Protocol

import httpx
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.schemas.prescription import PrescriptionDraft


DASHSCOPE_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


class LLMProvider(Protocol):
    def generate_prescription(self, payload: dict) -> PrescriptionDraft:
        ...


class MockLLMProvider:
    def generate_prescription(self, payload: dict) -> PrescriptionDraft:
        template = payload.get("template") or {}
        risk_level = payload["risk_level"]
        fitt_vp = template.get("fitt_vp")
        if risk_level == "R3":
            fitt_vp = None

        return PrescriptionDraft.model_validate(
            {
                "risk_level": risk_level,
                "cluster_label": payload.get("cluster_label") or "普通健康维持型",
                "goals": payload.get("goals") or ["体质提升"],
                "fitt_vp": fitt_vp,
                "precautions": template.get("precautions")
                or ["运动中出现胸闷、头晕、心悸、异常气短应停止并寻求评估。"],
                "contraindications": template.get("contraindications") or [],
                "reassessment": "4周小评估，12周阶段评估",
                "evidence_refs": payload.get("evidence_refs") or [],
                "expert_review_required": risk_level == "R2",
                "safety_notice": "AI 初稿已按规则约束生成，不替代医疗诊断。",
            }
        )


class OpenAICompatibleProvider:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        http_client: Any | None = None,
        timeout: float = 60.0,
    ):
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key
        self.model = model or "qwen3.7-max"
        self.http_client = http_client or httpx.Client()
        self.timeout = timeout

    def generate_prescription(self, payload: dict) -> PrescriptionDraft:
        if not self.base_url:
            raise ValueError("LLM_BASE_URL 未配置，无法调用 OpenAI-compatible Provider")
        if not self.api_key:
            raise ValueError("LLM_API_KEY 未配置，无法调用 OpenAI-compatible Provider")

        response = self.http_client.post(
            self._chat_completion_url(),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": self._build_messages(payload),
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        content = self._extract_content(response.json())
        draft_payload = self._parse_json_content(content)
        try:
            return PrescriptionDraft.model_validate(draft_payload)
        except ValidationError as exc:
            raise ValueError(f"大模型输出未通过处方 JSON Schema 校验: {exc}") from exc

    def _chat_completion_url(self) -> str:
        if self.base_url.endswith("/chat/completions"):
            return self.base_url
        return f"{self.base_url}/chat/completions"

    def _build_messages(self, payload: dict) -> list[dict[str, str]]:
        system_prompt = (
            "你是 AI 个性化运动处方平台的处方生成服务。必须只输出结构化 JSON，"
            "不得输出 Markdown、解释性前后缀或多余文本。处方必须采用 FITT-VP 结构，"
            "字段包括 risk_level、cluster_label、goals、fitt_vp、precautions、"
            "contraindications、reassessment、evidence_refs、expert_review_required、"
            "safety_notice。R3 用户禁止生成具体训练处方，fitt_vp 必须为 null；"
            "R2 用户只能生成初稿，expert_review_required 必须为 true；"
            "R0/R1 必须包含完整 FITT-VP，并且不得突破 risk_rules、template 和禁忌动作限制。"
        )
        user_prompt = {
            "task": "基于结构化输入生成 FITT-VP 运动处方 JSON 初稿",
            "input": payload,
            "output_contract": PrescriptionDraft.model_json_schema(),
        }
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)},
        ]

    def _extract_content(self, response_payload: dict) -> str:
        try:
            content = response_payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError("大模型响应缺少 choices[0].message.content") from exc
        if not isinstance(content, str) or not content.strip():
            raise ValueError("大模型响应内容为空")
        return content

    def _parse_json_content(self, content: str) -> dict:
        text = content.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        decoder = json.JSONDecoder()
        start = text.find("{")
        if start < 0:
            raise ValueError("大模型输出不是结构化 JSON")
        try:
            parsed, _ = decoder.raw_decode(text[start:])
        except json.JSONDecodeError as exc:
            raise ValueError("大模型输出不是结构化 JSON") from exc
        if not isinstance(parsed, dict):
            raise ValueError("大模型输出不是 JSON 对象")
        return parsed


def build_llm_provider(config: Settings = settings) -> LLMProvider:
    provider = config.LLM_PROVIDER.strip().lower()
    if provider in {"mock", "local-mock"}:
        return MockLLMProvider()
    if provider in {"openai-compatible", "openai", "qwen", "dashscope", "aliyun"}:
        base_url = config.LLM_BASE_URL
        api_key = config.LLM_API_KEY
        if provider in {"qwen", "dashscope", "aliyun"}:
            base_url = base_url or DASHSCOPE_COMPATIBLE_BASE_URL
            api_key = api_key or config.DASHSCOPE_API_KEY or config.ALIYUN_API_KEY
        return OpenAICompatibleProvider(
            base_url=base_url,
            api_key=api_key,
            model=config.LLM_MODEL,
        )
    raise ValueError(f"不支持的 LLM_PROVIDER: {config.LLM_PROVIDER}")
