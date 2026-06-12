from pathlib import Path

from app.core.config import Settings, mask_secret, resolve_env_file, runtime_provider_summary


def test_settings_loads_env_from_project_root_not_current_working_directory(
    monkeypatch,
    tmp_path: Path,
) -> None:
    project_root = tmp_path / "project"
    project_root.mkdir()
    (project_root / ".env").write_text(
        "\n".join(
            [
                "LLM_PROVIDER=aliyun",
                "DASHSCOPE_API_KEY=project-root-dashscope-key",
                "LLM_MODEL=qwen-prod",
            ]
        ),
        encoding="utf-8",
    )
    other_cwd = tmp_path / "other-cwd"
    other_cwd.mkdir()
    (other_cwd / ".env").write_text(
        "\n".join(
            [
                "LLM_PROVIDER=mock",
                "DASHSCOPE_API_KEY=cwd-dashscope-key",
                "LLM_MODEL=wrong-model",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.chdir(other_cwd)
    monkeypatch.setenv("PROJECT_ROOT", str(project_root))
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)

    loaded = Settings()

    assert resolve_env_file() == project_root / ".env"
    assert loaded.LLM_PROVIDER == "aliyun"
    assert loaded.DASHSCOPE_API_KEY == "project-root-dashscope-key"
    assert loaded.LLM_MODEL == "qwen-prod"


def test_runtime_provider_summary_omits_api_key_material() -> None:
    summary = runtime_provider_summary(
        Settings(
            ENVIRONMENT="production",
            LLM_PROVIDER="dashscope",
            LLM_MODEL="qwen-max",
            DASHSCOPE_API_KEY="test-dashscope-api-key",
            EMBEDDING_PROVIDER="aliyun",
            EMBEDDING_MODEL="text-embedding-v3",
            EMBEDDING_API_KEY="test-embedding-api-key",
            OCR_ENABLED=True,
        )
    )

    assert summary["llm"]["provider"] == "dashscope"
    assert summary["llm"]["model"] == "qwen-max"
    assert summary["llm"]["base_url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert summary["llm"]["configured"] is True
    assert summary["embedding"]["provider"] == "aliyun"
    assert summary["embedding"]["model"] == "text-embedding-v3"
    assert summary["embedding"]["base_url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert summary["embedding"]["configured"] is True
    assert summary["ocr"]["enabled"] is True
    assert "api_key" not in str(summary)
    assert "DASHSCOPE_API_KEY" not in str(summary)
    assert "secret" not in str(summary)


def test_mask_secret_never_returns_raw_short_secret() -> None:
    assert mask_secret(None) == "unset"
    assert mask_secret("") == "unset"
    assert mask_secret("short") == "set"
