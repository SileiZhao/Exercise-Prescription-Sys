import pytest

from app.core.config import Settings
from app.core.config import DASHSCOPE_COMPATIBLE_BASE_URL
from app.services.knowledge_service import build_embedding_provider


class FakeEmbeddingResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeHTTPClient:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return FakeEmbeddingResponse(self.payload)


def test_hash_embedding_forbidden_in_production():
    config = Settings(ENVIRONMENT="production", EMBEDDING_PROVIDER="hash")

    with pytest.raises(ValueError, match="hash embedding"):
        build_embedding_provider(config)


def test_ollama_embedding_provider_calls_embedding_endpoint():
    http_client = FakeHTTPClient({"embedding": [0.1, 0.2, 0.3]})
    provider = build_embedding_provider(
        Settings(
            EMBEDDING_PROVIDER="ollama",
            EMBEDDING_MODEL="nomic-embed-text",
            OLLAMA_BASE_URL="http://ollama:11434",
        ),
        http_client=http_client,
    )

    vector = provider.embed("运动处方")

    assert vector == [0.1, 0.2, 0.3]
    assert http_client.calls[0]["url"] in {
        "http://ollama:11434/api/embeddings",
        "http://ollama:11434/api/embed",
    }
    assert http_client.calls[0]["json"]["model"] == "nomic-embed-text"


def test_ollama_embedding_provider_uses_configured_timeout():
    http_client = FakeHTTPClient({"embedding": [0.1, 0.2, 0.3]})
    provider = build_embedding_provider(
        Settings(
            EMBEDDING_PROVIDER="ollama",
            EMBEDDING_MODEL="nomic-embed-text",
            OLLAMA_BASE_URL="http://ollama:11434",
            EMBEDDING_TIMEOUT_SECONDS=77,
        ),
        http_client=http_client,
    )

    provider.embed("运动处方")

    assert http_client.calls[0]["timeout"] == 77


def test_ollama_embedding_provider_batches_inputs_with_embed_endpoint():
    http_client = FakeHTTPClient({"embeddings": [[0.1, 0.2], [0.3, 0.4]]})
    provider = build_embedding_provider(
        Settings(
            EMBEDDING_PROVIDER="ollama",
            EMBEDDING_MODEL="nomic-embed-text",
            OLLAMA_BASE_URL="http://ollama:11434",
            EMBEDDING_TIMEOUT_SECONDS=88,
        ),
        http_client=http_client,
    )

    vectors = provider.embed_many(["运动处方一", "运动处方二"])

    assert vectors == [[0.1, 0.2], [0.3, 0.4]]
    assert http_client.calls[0]["url"] == "http://ollama:11434/api/embed"
    assert http_client.calls[0]["json"] == {
        "model": "nomic-embed-text",
        "input": ["运动处方一", "运动处方二"],
    }
    assert http_client.calls[0]["timeout"] == 88


def test_openai_compatible_embedding_provider_uses_base_url_and_api_key():
    http_client = FakeHTTPClient({"data": [{"embedding": [0.4, 0.5, 0.6]}]})
    provider = build_embedding_provider(
        Settings(
            EMBEDDING_PROVIDER="openai-compatible",
            EMBEDDING_MODEL="text-embedding-v1",
            EMBEDDING_BASE_URL="https://example.test/v1",
            EMBEDDING_API_KEY="test-key",
        ),
        http_client=http_client,
    )

    vector = provider.embed("运动处方")

    assert vector == [0.4, 0.5, 0.6]
    assert http_client.calls[0]["url"] == "https://example.test/v1/embeddings"
    assert http_client.calls[0]["headers"]["Authorization"] == "Bearer test-key"
    assert http_client.calls[0]["json"]["model"] == "text-embedding-v1"


def test_dashscope_embedding_provider_uses_default_base_url_and_key_alias():
    http_client = FakeHTTPClient({"data": [{"embedding": [0.4, 0.5, 0.6]}]})
    provider = build_embedding_provider(
        Settings(
            EMBEDDING_PROVIDER="dashscope",
            EMBEDDING_MODEL="text-embedding-v4",
            DASHSCOPE_API_KEY="dashscope-key",
            EMBEDDING_BASE_URL=None,
            EMBEDDING_API_KEY=None,
        ),
        http_client=http_client,
    )

    vector = provider.embed("运动处方")

    assert vector == [0.4, 0.5, 0.6]
    assert http_client.calls[0]["url"] == f"{DASHSCOPE_COMPATIBLE_BASE_URL}/embeddings"
    assert http_client.calls[0]["headers"]["Authorization"] == "Bearer dashscope-key"
    assert http_client.calls[0]["json"]["model"] == "text-embedding-v4"


def test_ollama_embedding_forbidden_in_production():
    config = Settings(ENVIRONMENT="production", EMBEDDING_PROVIDER="ollama")

    with pytest.raises(ValueError, match="ollama embedding.*production"):
        build_embedding_provider(config)


def test_embedding_provider_rejects_invalid_vectors():
    http_client = FakeHTTPClient({"data": [{"embedding": ["bad"]}]})
    provider = build_embedding_provider(
        Settings(
            EMBEDDING_PROVIDER="openai-compatible",
            EMBEDDING_BASE_URL="https://example.test/v1",
            EMBEDDING_API_KEY="test-key",
        ),
        http_client=http_client,
    )

    with pytest.raises(ValueError, match="embedding vector"):
        provider.embed("运动处方")
