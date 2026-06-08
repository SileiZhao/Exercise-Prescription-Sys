# 生产 RAG、OCR、Embedding 与本地大模型补齐实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在上一轮可试运行闭环基础上，消除 RAG skipped、mock/伪 embedding、OCR 未接入、Ollama/Gemma 未实现、动作库未批准、合规材料仍按草稿处理等上线前缺口，使系统达到真实资料、真实模型、可审计、可部署的上线使用状态。

**架构：** 保持现有 FastAPI + React/Vite + PostgreSQL + Qdrant + Docker Compose 架构，不重写业务闭环。新增能力以配置驱动方式接入：RAG 原始资料使用项目相对路径可迁移导入，embedding 使用真实模型写入 Qdrant，PaddleOCR 只在文本抽取为空时兜底，Ollama/Gemma 作为本地 LLM provider，与已有 OpenAI-compatible/Aliyun provider 并存。

**技术栈：** FastAPI、SQLAlchemy、Alembic、Pydantic、PostgreSQL、Qdrant、PaddleOCR、Ollama、Gemma、httpx、Pytest、React、Ant Design、Vitest、Docker Compose。

---

## 范围边界

本计划纳入：
- 修正 `rag_data/_manifests/rag_ingest_allowlist.txt` 为仓库可迁移的相对路径。
- 严格模式下 RAG 缺文件、解析失败、OCR 不可用、索引失败必须阻断上线导入。
- 接入真实 embedding provider，并禁止生产环境默认使用 hash embedding。
- 接入 PaddleOCR，对扫描版 PDF 和图片资料进行 OCR 文本抽取。
- 接入 Ollama/Gemma 本地 LLM provider，并纳入 `/ready` 与上线验收。
- 将 `docs/` 动作库批量标记为 `APPROVED`，因为用户确认已获专家批准。
- 将合规材料导入为法务、伦理、运动医学专家已确认版本。
- 更新管理端可见状态、验收证据、部署说明和上线清单。
- 补齐生产运维硬化：默认账号处置、备份恢复演练、JSON 日志、错误告警自检。

本计划仍不纳入：
- 设备接口 `/device-integrations/*`。
- 试点资料 `/pilot-materials/*`。
- 报告模板管理 `/report-templates/*`。
- 成果交付物生成 `/deliverables/*`。

## 目标文件结构

### 配置、服务与健康检查
- 修改：`backend/app/core/config.py`：新增 embedding、Ollama、OCR 细分配置。
- 修改：`backend/app/core/readiness.py`：增加 embedding provider、Qdrant collection 维度、PaddleOCR、Ollama/Gemma 检查。
- 修改：`backend/app/services/knowledge_service.py`：新增真实 embedding provider factory，保留 hash 仅开发兜底。
- 修改：`backend/app/services/llm_service.py`：新增 `OllamaProvider`，支持 Gemma JSON 处方输出。
- 创建：`backend/app/services/ocr_service.py`：封装 PaddleOCR 文本抽取。

### RAG 导入与资料状态
- 修改：`rag_data/_manifests/rag_ingest_allowlist.txt`：绝对路径改为相对 `rag_data/` 根目录的路径。
- 修改：`backend/scripts/import_rag_data.py`：相对路径解析、strict 阻断、OCR 兜底、索引失败暴露。
- 修改：`backend/scripts/validate_reference_data.py`：检查 allowlist 是否含绝对路径，strict 下不允许 missing/skipped。
- 修改：`backend/scripts/seed_reference_data.py`：严格模式下 RAG skipped、index_errors、ocr_errors 均阻断。

### 动作库、合规材料与管理状态
- 修改：`backend/scripts/import_exercise_actions.py`：支持 `review_status` 入参和 `--approve` CLI，导入 docs 动作库时可标为 `APPROVED`。
- 修改：`backend/scripts/seed_reference_data.py`：默认对本轮 docs 动作库执行专家批准状态导入。
- 修改：`backend/scripts/import_compliance_materials.py`：支持已确认模式，清空 `pending_confirmation` 并写入确认状态。
- 修改：`backend/app/services/admin_dashboard_service.py`：展示批准动作数、草稿合规数、RAG skipped、embedding provider、OCR/LLM readiness。
- 修改：`frontend/src/pages/admin/AdminDashboardPage.tsx`：展示上述上线状态。
- 修改：`frontend/src/pages/admin/AdminTemplatePage.tsx`：明确动作库 APPROVED 状态和合规材料 confirmed 状态。

### 部署与验收
- 修改：`.env.example`：增加真实 embedding、PaddleOCR、Ollama/Gemma 示例配置，不写入真实密钥。
- 修改：`docker-compose.yml`、`docker-compose.prod.yml`、`backend/Dockerfile`：补齐 PaddleOCR 依赖与 Ollama 访问配置；如 Ollama 独立服务运行，则加入 service 或 documented external URL。
- 修改：`README.md`：更新导入、embedding、OCR、Ollama/Gemma、上线验证命令。
- 修改：`docs/10_online_checklist.md`：加入新门禁并收口默认账号、备份恢复、日志告警。
- 修改：`docs/12_acceptance_evidence.md`：记录本轮验证证据，要求 RAG skipped=0。

### 测试
- 创建/修改：`backend/app/tests/scripts/test_import_rag_data.py`
- 创建/修改：`backend/app/tests/scripts/test_validate_reference_data.py`
- 创建/修改：`backend/app/tests/scripts/test_seed_reference_data.py`
- 创建/修改：`backend/app/tests/scripts/test_import_exercise_actions.py`
- 创建/修改：`backend/app/tests/scripts/test_import_compliance_materials.py`
- 创建：`backend/app/tests/services/test_embedding_provider.py`
- 创建：`backend/app/tests/services/test_ocr_service.py`
- 创建/修改：`backend/app/tests/services/test_llm_service.py`
- 创建/修改：`backend/app/tests/core/test_readiness.py`
- 创建/修改：`backend/app/tests/api/test_admin_dashboard.py`
- 创建/修改：`frontend/src/adminDashboard.test.tsx`
- 创建/修改：`frontend/src/adminTemplates.test.tsx`

---

## 任务 1：修正 RAG allowlist 为相对路径并让 strict 真实阻断 skipped

**文件：**
- 修改：`rag_data/_manifests/rag_ingest_allowlist.txt`
- 修改：`backend/scripts/validate_reference_data.py`
- 修改：`backend/scripts/import_rag_data.py`
- 修改：`backend/scripts/seed_reference_data.py`
- 测试：`backend/app/tests/scripts/test_validate_reference_data.py`
- 测试：`backend/app/tests/scripts/test_import_rag_data.py`
- 测试：`backend/app/tests/scripts/test_seed_reference_data.py`

- [x] **步骤 1：编写 allowlist 相对路径校验失败测试**

在 `backend/app/tests/scripts/test_validate_reference_data.py` 增加测试：构造一个 allowlist，包含 `/Users/zhaosilei/Documents/Exercise Prescription Sys/rag_data/demo.pdf`，运行校验函数，断言 strict 结果包含 `absolute_allowlist_paths`，且 `blocking_errors` 非空。

```python
def test_validate_reference_data_rejects_absolute_rag_allowlist_paths(tmp_path):
    rag_root = tmp_path / "rag_data"
    manifest = rag_root / "_manifests"
    manifest.mkdir(parents=True)
    (manifest / "rag_ingest_allowlist.txt").write_text(
        "/Users/zhaosilei/Documents/Exercise Prescription Sys/rag_data/demo.pdf\n",
        encoding="utf-8",
    )

    result = validate_reference_data(
        docs_dir=tmp_path / "docs",
        rag_root=rag_root,
        strict=True,
    )

    assert result["absolute_allowlist_paths"]
    assert any("allowlist" in item for item in result["blocking_errors"])
```

- [x] **步骤 2：编写 RAG strict skipped 阻断失败测试**

在 `backend/app/tests/scripts/test_import_rag_data.py` 增加测试：allowlist 指向不存在文件，调用 `import_rag_data(..., strict=True)`，断言抛出 `RuntimeError`，错误信息包含 `skipped=1`。

```python
def test_import_rag_data_strict_fails_when_allowlist_file_missing(db_session, tmp_path):
    rag_root = tmp_path / "rag_data"
    manifest = rag_root / "_manifests"
    manifest.mkdir(parents=True)
    allowlist = manifest / "rag_ingest_allowlist.txt"
    allowlist.write_text("00_core_guidelines/missing.pdf\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="skipped=1"):
        import_rag_data(
            db_session,
            rag_root=rag_root,
            allowlist_path=allowlist,
            build_index=False,
            strict=True,
        )
```

- [x] **步骤 3：运行测试确认失败**

运行：

```bash
cd backend && python -m pytest app/tests/scripts/test_validate_reference_data.py app/tests/scripts/test_import_rag_data.py app/tests/scripts/test_seed_reference_data.py -v
```

预期：FAIL，原因是当前校验不识别绝对 allowlist 路径，`import_rag_data` 没有 `strict` 参数，`seed_reference_data --strict` 不因 skipped 失败。

- [x] **步骤 4：将 allowlist 改为相对路径**

把 `rag_data/_manifests/rag_ingest_allowlist.txt` 中每行从：

```text
/Users/zhaosilei/Documents/Exercise Prescription Sys/rag_data/00_core_guidelines/AHA_ASA_2016_adult_stroke_rehab_recovery_slide_set.pdf
```

改为：

```text
00_core_guidelines/AHA_ASA_2016_adult_stroke_rehab_recovery_slide_set.pdf
```

对所有 57 行执行同样规则：去掉仓库本机绝对前缀，只保留相对于 `rag_data/` 的路径。保留注释行和空行。

- [x] **步骤 5：实现 allowlist 解析和 strict 阻断**

在 `backend/scripts/import_rag_data.py` 中：
- `_read_allowlist()` 返回原始字符串和解析后的相对 `Path`，保留错误上下文。
- 新增参数 `strict: bool = False`。
- 如果 allowlist 中出现绝对路径，非 strict 可继续兼容导入，strict 必须计入 `errors` 并最终抛错。
- 如果 `skipped > 0`、`errors > 0`、`chunks == 0`，strict 必须抛出 `RuntimeError`。
- `main()` 增加 `--strict` 参数。

实现后的函数签名使用：

```python
def import_rag_data(
    db: Session,
    rag_root: str | Path,
    allowlist_path: str | Path | None = None,
    catalog_path: str | Path | None = None,
    build_index: bool = True,
    created_by: int | None = None,
    strict: bool = False,
) -> dict[str, int | str]:
```

- [x] **步骤 6：让 seed strict 检查 skipped**

在 `backend/scripts/seed_reference_data.py` 中，调用 RAG 导入时传入 `strict=strict`。严格模式下任一阶段 `errors > 0` 或 RAG 阶段 `skipped > 0` 直接失败：

```python
if strict:
    blocking = []
    for name, result in results.items():
        if int(result.get("errors") or 0) > 0:
            blocking.append(f"{name}.errors={result.get('errors')}")
        if name == "rag_data" and int(result.get("skipped") or 0) > 0:
            blocking.append(f"{name}.skipped={result.get('skipped')}")
    if blocking:
        raise RuntimeError("参考资料导入存在阻断项：" + ", ".join(blocking))
```

- [x] **步骤 7：运行测试验证通过**

运行：

```bash
cd backend && python -m pytest app/tests/scripts/test_validate_reference_data.py app/tests/scripts/test_import_rag_data.py app/tests/scripts/test_seed_reference_data.py -v
```

预期：PASS。

- [x] **步骤 8：Commit**

```bash
git add rag_data/_manifests/rag_ingest_allowlist.txt backend/scripts/validate_reference_data.py backend/scripts/import_rag_data.py backend/scripts/seed_reference_data.py backend/app/tests/scripts/test_validate_reference_data.py backend/app/tests/scripts/test_import_rag_data.py backend/app/tests/scripts/test_seed_reference_data.py
git commit -m "fix: make rag allowlist portable and strict"
```

---

## 任务 2：接入真实 embedding provider 并禁止生产 hash embedding

**文件：**
- 修改：`backend/app/core/config.py`
- 修改：`backend/app/services/knowledge_service.py`
- 修改：`backend/app/core/readiness.py`
- 修改：`.env.example`
- 测试：`backend/app/tests/services/test_embedding_provider.py`
- 测试：`backend/app/tests/core/test_readiness.py`

- [x] **步骤 1：编写 embedding provider 选择失败测试**

创建 `backend/app/tests/services/test_embedding_provider.py`，覆盖：
- `EMBEDDING_PROVIDER=ollama` 时调用 Ollama `/api/embeddings` 或 `/api/embed` 返回真实向量。
- `EMBEDDING_PROVIDER=openai-compatible` 时调用 `${EMBEDDING_BASE_URL}/embeddings`。
- `ENVIRONMENT=production` 且 `EMBEDDING_PROVIDER=hash` 时 provider factory 抛错。

```python
def test_hash_embedding_forbidden_in_production():
    config = Settings(ENVIRONMENT="production", EMBEDDING_PROVIDER="hash")
    with pytest.raises(ValueError, match="hash embedding"):
        build_embedding_provider(config)
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
cd backend && python -m pytest app/tests/services/test_embedding_provider.py app/tests/core/test_readiness.py -v
```

预期：FAIL，原因是没有 `build_embedding_provider`，配置字段不存在。

- [x] **步骤 3：新增配置**

在 `backend/app/core/config.py` 增加：

```python
EMBEDDING_PROVIDER: str = "hash"
EMBEDDING_MODEL: str = "nomic-embed-text"
EMBEDDING_BASE_URL: str | None = None
EMBEDDING_API_KEY: str | None = None
OLLAMA_BASE_URL: str = "http://ollama:11434"
RAG_RECREATE_COLLECTION_ON_DIMENSION_MISMATCH: bool = False
```

保留 `RAG_EMBEDDING_DIMENSION`，但实际维度以首次真实 embedding 返回长度校验为准。

- [x] **步骤 4：实现 provider factory**

在 `backend/app/services/knowledge_service.py` 中新增：
- `OpenAICompatibleEmbeddingProvider`
- `OllamaEmbeddingProvider`
- `build_embedding_provider(config: Settings = settings)`

核心行为：
- `hash` 仅 development/test 允许。
- `openai-compatible` 从 `EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL` 读取。
- `ollama` 从 `OLLAMA_BASE_URL`、`EMBEDDING_MODEL` 读取。
- 向量为空、非数字、维度不一致时抛出 `ValueError`。

- [x] **步骤 5：让索引和检索使用真实 provider**

修改 `KnowledgeRetrievalService` 和 `KnowledgeVectorIndexService` 默认 provider：

```python
self.embedding_provider = embedding_provider or build_embedding_provider()
```

保留测试注入能力。

- [x] **步骤 6：处理 Qdrant collection 维度**

修改 `QdrantKnowledgeVectorStore._ensure_collection()`：
- collection 不存在时按当前 vector 维度创建。
- collection 存在但维度不一致时：
  - `RAG_RECREATE_COLLECTION_ON_DIMENSION_MISMATCH=true`：删除并重建 collection，同时需要重新导入/重建索引。
  - 否则抛出清晰错误，提示当前维度和目标维度。

- [x] **步骤 7：更新 readiness**

在 `backend/app/core/readiness.py` 中增加：
- `embedding.status`
- `embedding.provider`
- `embedding.model`
- `embedding.dimension`
- `embedding.production_ready`

生产环境中 `hash` 返回 not ready。

- [x] **步骤 8：更新 `.env.example`**

加入：

```dotenv
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_BASE_URL=
EMBEDDING_API_KEY=
OLLAMA_BASE_URL=http://ollama:11434
RAG_EMBEDDING_DIMENSION=768
RAG_RECREATE_COLLECTION_ON_DIMENSION_MISMATCH=false
```

- [x] **步骤 9：运行测试验证通过**

运行：

```bash
cd backend && python -m pytest app/tests/services/test_embedding_provider.py app/tests/services/test_knowledge_retrieval.py app/tests/core/test_readiness.py -v
```

预期：PASS。

- [x] **步骤 10：Commit**

```bash
git add backend/app/core/config.py backend/app/services/knowledge_service.py backend/app/core/readiness.py backend/app/tests/services/test_embedding_provider.py backend/app/tests/services/test_knowledge_retrieval.py backend/app/tests/core/test_readiness.py .env.example
git commit -m "feat: add production embedding providers"
```

---

## 任务 3：接入 PaddleOCR 兜底解析扫描件和图片资料

**文件：**
- 创建：`backend/app/services/ocr_service.py`
- 修改：`backend/scripts/import_rag_data.py`
- 修改：`backend/app/core/config.py`
- 修改：`backend/Dockerfile`
- 修改：`docker-compose.yml`
- 修改：`docker-compose.prod.yml`
- 测试：`backend/app/tests/services/test_ocr_service.py`
- 测试：`backend/app/tests/scripts/test_import_rag_data.py`

- [x] **步骤 1：编写 OCR service 失败测试**

创建 `backend/app/tests/services/test_ocr_service.py`，用 fake PaddleOCR 类注入，断言图片 OCR 结果被合并为文本。

```python
def test_paddle_ocr_service_extracts_text_from_result(tmp_path):
    image = tmp_path / "scan.png"
    image.write_bytes(b"fake")
    service = PaddleOCRService(ocr_engine=FakePaddleOCR([[[None, ("运动处方", 0.98)]]]))

    text = service.extract_image_text(image)

    assert "运动处方" in text
```

- [x] **步骤 2：编写 PDF 空文本时走 OCR 的失败测试**

在 `backend/app/tests/scripts/test_import_rag_data.py` 增加测试：mock `_extract_pdf_text()` 返回空文本，mock OCR 返回 `"扫描件文本"`，断言导入 chunks > 0，document.status 为 `ACTIVE`。

- [x] **步骤 3：运行测试确认失败**

运行：

```bash
cd backend && python -m pytest app/tests/services/test_ocr_service.py app/tests/scripts/test_import_rag_data.py -v
```

预期：FAIL，原因是 OCR service 不存在，RAG 导入不会调用 PaddleOCR。

- [x] **步骤 4：新增 OCR 配置**

在 `backend/app/core/config.py` 增加：

```python
OCR_ENABLED: bool = False
OCR_PROVIDER: str = "paddleocr"
OCR_LANGUAGE: str = "ch"
OCR_USE_GPU: bool = False
OCR_MIN_CONFIDENCE: float = 0.5
OCR_PDF_MAX_PAGES: int = 80
```

- [x] **步骤 5：实现 `PaddleOCRService`**

`backend/app/services/ocr_service.py` 负责：
- 延迟 import `paddleocr.PaddleOCR`，未安装时抛出明确错误。
- `extract_image_text(path: Path) -> str`
- `extract_pdf_text(path: Path) -> tuple[str, list[tuple[int | None, int | None]]]`
- PDF 转图片可优先使用 `pypdfium2`；若项目依赖不可用，使用 `pdf2image` 并在 Dockerfile 安装 poppler。
- 只保留置信度 `>= OCR_MIN_CONFIDENCE` 的文本。

- [x] **步骤 6：RAG 导入接入 OCR fallback**

在 `backend/scripts/import_rag_data.py` 中：
- `_extract_text(path)` 增加 `ocr_enabled: bool | None = None` 参数。
- PDF `pypdf` 抽取为空且 `settings.OCR_ENABLED=true` 时调用 `PaddleOCRService.extract_pdf_text(path)`。
- `.png`、`.jpg`、`.jpeg`、`.webp`、`.tif`、`.tiff` 直接走 OCR。
- OCR 未启用且文本为空时，strict 下报错并阻断；非 strict 保持 `SKIPPED`。

- [x] **步骤 7：补齐容器依赖**

在 `backend/Dockerfile` 中安装 PaddleOCR 所需系统依赖。推荐 CPU 版本：

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 poppler-utils \
    && rm -rf /var/lib/apt/lists/*
```

在 backend Python 依赖文件中加入：

```text
paddleocr
pypdfium2
```

如果 PaddlePaddle 需要单独安装，使用 CPU 轮子并在 README 记录安装命令。

- [x] **步骤 8：运行测试验证通过**

运行：

```bash
cd backend && python -m pytest app/tests/services/test_ocr_service.py app/tests/scripts/test_import_rag_data.py -v
```

预期：PASS。

- [x] **步骤 9：Commit**

```bash
git add backend/app/services/ocr_service.py backend/scripts/import_rag_data.py backend/app/core/config.py backend/Dockerfile docker-compose.yml docker-compose.prod.yml backend/app/tests/services/test_ocr_service.py backend/app/tests/scripts/test_import_rag_data.py
git commit -m "feat: add paddleocr fallback for rag ingestion"
```

---

## 任务 4：接入 Ollama/Gemma 本地 LLM provider

**文件：**
- 修改：`backend/app/core/config.py`
- 修改：`backend/app/services/llm_service.py`
- 修改：`backend/app/core/readiness.py`
- 修改：`docker-compose.yml`
- 修改：`docker-compose.prod.yml`
- 测试：`backend/app/tests/services/test_llm_service.py`
- 测试：`backend/app/tests/core/test_readiness.py`

- [x] **步骤 1：编写 Ollama provider 失败测试**

在 `backend/app/tests/services/test_llm_service.py` 增加测试：fake http client 返回 Ollama chat 响应，content 为处方 JSON，断言 `PrescriptionDraft` 校验通过。

```python
def test_ollama_provider_generates_prescription_from_chat_response():
    provider = OllamaProvider(
        base_url="http://ollama:11434",
        model="gemma3:latest",
        http_client=FakeHTTPClient(
            {"message": {"content": json.dumps(valid_prescription_payload(), ensure_ascii=False)}}
        ),
    )

    draft = provider.generate_prescription(valid_llm_payload("R1"))

    assert draft.risk_level == "R1"
    assert draft.fitt_vp is not None
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
cd backend && python -m pytest app/tests/services/test_llm_service.py app/tests/core/test_readiness.py -v
```

预期：FAIL，原因是 `OllamaProvider` 不存在，`build_llm_provider()` 不支持 `ollama`。

- [x] **步骤 3：新增/规范配置**

在 `backend/app/core/config.py` 保持或补齐：

```python
OLLAMA_BASE_URL: str = "http://ollama:11434"
LOCAL_LLM_PROVIDER: str = "ollama"
LOCAL_LLM_MODEL: str = "gemma3:latest"
```

并允许 `LLM_PROVIDER=ollama` 时直接使用本地 provider。

- [x] **步骤 4：实现 `OllamaProvider`**

在 `backend/app/services/llm_service.py` 中新增：
- POST `${OLLAMA_BASE_URL}/api/chat`
- payload 使用 `model`、`messages`、`stream=false`、`format="json"`、`options.temperature=0.2`
- messages 复用 OpenAI-compatible 的 system/user prompt。
- 响应兼容：
  - `{"message": {"content": "...json..."}}`
  - `{"response": "...json..."}`
- 复用 `_parse_json_content()` 和 Pydantic schema 校验。

- [x] **步骤 5：扩展 provider factory**

`build_llm_provider()` 支持：

```python
if provider in {"ollama", "gemma", "local"}:
    return OllamaProvider(
        base_url=config.OLLAMA_BASE_URL,
        model=config.LOCAL_LLM_MODEL or config.LLM_MODEL,
    )
```

- [x] **步骤 6：Docker Compose 增加 Ollama 服务或外部连接说明**

如果本地容器内运行 Ollama，增加：

```yaml
ollama:
  image: ollama/ollama:latest
  ports:
    - "11434:11434"
  volumes:
    - ollama_data:/root/.ollama
```

backend 增加：

```yaml
environment:
  OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://ollama:11434}
```

如果服务器已安装系统级 Ollama，则保持 compose 不启动 Ollama，但 README 必须给出 `OLLAMA_BASE_URL=http://host.docker.internal:11434` 或内网地址配置。

- [x] **步骤 7：readiness 检查 Ollama/Gemma**

在 `backend/app/core/readiness.py` 中：
- 当 `LLM_PROVIDER=ollama` 时请求 `${OLLAMA_BASE_URL}/api/tags`。
- 检查 `LOCAL_LLM_MODEL` 是否存在；不存在时返回 not ready，并提示运行 `ollama pull gemma3:latest`。
- 生产环境禁止 `LLM_PROVIDER=mock`。

- [x] **步骤 8：运行测试验证通过**

运行：

```bash
cd backend && python -m pytest app/tests/services/test_llm_service.py app/tests/services/test_llm_schema.py app/tests/core/test_readiness.py -v
```

预期：PASS。

- [x] **步骤 9：Commit**

```bash
git add backend/app/core/config.py backend/app/services/llm_service.py backend/app/core/readiness.py docker-compose.yml docker-compose.prod.yml backend/app/tests/services/test_llm_service.py backend/app/tests/core/test_readiness.py
git commit -m "feat: add ollama gemma llm provider"
```

---

## 任务 5：动作库批量标记 APPROVED 并确保处方候选使用真实动作库

**文件：**
- 修改：`backend/scripts/import_exercise_actions.py`
- 修改：`backend/scripts/seed_reference_data.py`
- 修改：`backend/app/services/template_service.py`
- 修改：`frontend/src/pages/admin/AdminTemplatePage.tsx`
- 测试：`backend/app/tests/scripts/test_import_exercise_actions.py`
- 测试：`backend/app/tests/services/test_template_matching.py`
- 测试：`frontend/src/adminTemplates.test.tsx`

- [x] **步骤 1：编写动作导入 APPROVED 失败测试**

在 `backend/app/tests/scripts/test_import_exercise_actions.py` 增加测试：调用 `import_exercise_actions(..., review_status=ActionReviewStatus.APPROVED)`，断言导入动作 `status == APPROVED`。

```python
def test_import_exercise_actions_can_mark_docs_library_approved(db_session, tmp_path):
    path = write_action_library(tmp_path, [{"name": "快走", "category": "有氧", "risk_level": "R1"}])

    import_exercise_actions(db_session, path, review_status=ActionReviewStatus.APPROVED)

    action = db_session.scalar(select(ExerciseAction).where(ExerciseAction.name == "快走"))
    assert action.status == ActionReviewStatus.APPROVED
```

- [x] **步骤 2：编写处方候选使用 APPROVED 动作测试**

在 `backend/app/tests/services/test_template_matching.py` 增加测试：一个 APPROVED 低冲击动作进入 R1/R2 候选；一个 PENDING_REVIEW 动作不进入候选。

- [x] **步骤 3：运行测试确认失败**

运行：

```bash
cd backend && python -m pytest app/tests/scripts/test_import_exercise_actions.py app/tests/services/test_template_matching.py -v
```

预期：FAIL，原因是导入脚本强制 PENDING_REVIEW。

- [x] **步骤 4：实现导入参数和 CLI**

修改 `import_exercise_actions()` 签名：

```python
def import_exercise_actions(
    db: Session,
    path: str | Path,
    review_status: ActionReviewStatus = ActionReviewStatus.PENDING_REVIEW,
    reviewed_by: int | None = None,
) -> dict[str, int]:
```

当 `review_status == APPROVED` 时：
- `action.status = ActionReviewStatus.APPROVED`
- `action.reviewed_at = datetime.now(UTC)`
- `action.reviewed_by = reviewed_by`

CLI 增加：

```bash
python scripts/import_exercise_actions.py docs/...json --approve
```

- [x] **步骤 5：seed 默认批准 docs 动作库**

在 `backend/scripts/seed_reference_data.py` 的 actions 阶段传入：

```python
review_status=ActionReviewStatus.APPROVED
```

并在命令输出中包含 `approved` 指标。此行为基于用户确认：docs 动作库已获专家批准，允许试运行中批量标记为 APPROVED。

- [x] **步骤 6：前端展示批准依据**

在 `frontend/src/pages/admin/AdminTemplatePage.tsx` 中，动作库状态列展示：
- `APPROVED`：已批准
- `PENDING_REVIEW`：待审核
- `REJECTED`：已驳回

页面不写“草稿动作库”文案。

- [x] **步骤 7：运行测试验证通过**

运行：

```bash
cd backend && python -m pytest app/tests/scripts/test_import_exercise_actions.py app/tests/services/test_template_matching.py -v
cd frontend && npm run test -- --run src/adminTemplates.test.tsx
```

预期：PASS。

- [x] **步骤 8：Commit**

```bash
git add backend/scripts/import_exercise_actions.py backend/scripts/seed_reference_data.py backend/app/services/template_service.py backend/app/tests/scripts/test_import_exercise_actions.py backend/app/tests/services/test_template_matching.py frontend/src/pages/admin/AdminTemplatePage.tsx frontend/src/adminTemplates.test.tsx
git commit -m "feat: approve expert-reviewed action library"
```

---

## 任务 6：合规材料按已确认版本导入并清理草稿状态

**文件：**
- 修改：`backend/scripts/import_compliance_materials.py`
- 修改：`backend/scripts/seed_reference_data.py`
- 修改：`frontend/src/pages/admin/AdminTemplatePage.tsx`
- 测试：`backend/app/tests/scripts/test_import_compliance_materials.py`
- 测试：`frontend/src/adminTemplates.test.tsx`

- [x] **步骤 1：编写合规 confirmed 导入失败测试**

创建或修改 `backend/app/tests/scripts/test_import_compliance_materials.py`，断言 confirmed 模式下：
- `review_status == "CONFIRMED"`
- `pending_confirmation == []`
- `status == "ACTIVE"`

```python
def test_import_compliance_materials_confirmed_mode_clears_pending_items(db_session, tmp_path):
    path = write_compliance_pack(
        tmp_path,
        [{"doc_code": "CONSENT", "title": "知情同意", "text": "内容", "pending_confirmation": ["法务"]}],
    )

    import_compliance_materials(db_session, path, confirmed=True)

    doc = db_session.scalar(select(ComplianceDocument).where(ComplianceDocument.code == "CONSENT"))
    assert doc.review_status == "CONFIRMED"
    assert doc.pending_confirmation == []
    assert doc.status == "ACTIVE"
```

- [x] **步骤 2：运行测试确认失败**

运行：

```bash
cd backend && python -m pytest app/tests/scripts/test_import_compliance_materials.py -v
```

预期：FAIL，原因是导入脚本没有 `confirmed` 参数。

- [x] **步骤 3：实现 confirmed 模式**

修改 `import_compliance_materials()`：

```python
def import_compliance_materials(db: Session, path: str | Path, confirmed: bool = False) -> dict[str, int]:
```

当 `confirmed=True`：
- `document.review_status = "CONFIRMED"`
- `document.pending_confirmation = []`
- `document.status = "ACTIVE"`
- 如模型已有确认人/确认时间字段，则写入；没有则不新增迁移，避免过度扩展。

CLI 增加：

```bash
python scripts/import_compliance_materials.py docs/...json --confirmed
```

- [x] **步骤 4：seed 默认 confirmed 导入**

在 `backend/scripts/seed_reference_data.py` 的 compliance 阶段传入：

```python
confirmed=True
```

此行为基于用户确认：合规材料版本已经是法务、伦理、运动医学专家确认后的版本。

- [x] **步骤 5：前端状态展示调整**

在管理端合规材料展示中，把 `CONFIRMED` 显示为“已确认”，并避免展示“待法务/专家确认”。

- [x] **步骤 6：运行测试验证通过**

运行：

```bash
cd backend && python -m pytest app/tests/scripts/test_import_compliance_materials.py -v
cd frontend && npm run test -- --run src/adminTemplates.test.tsx
```

预期：PASS。

- [x] **步骤 7：Commit**

```bash
git add backend/scripts/import_compliance_materials.py backend/scripts/seed_reference_data.py backend/app/tests/scripts/test_import_compliance_materials.py frontend/src/pages/admin/AdminTemplatePage.tsx frontend/src/adminTemplates.test.tsx
git commit -m "feat: mark compliance materials confirmed"
```

---

## 任务 7：管理看板展示真实上线门禁状态

**文件：**
- 修改：`backend/app/services/admin_dashboard_service.py`
- 修改：`backend/app/api/v1/endpoints/admin_dashboard.py`
- 修改：`frontend/src/pages/admin/AdminDashboardPage.tsx`
- 测试：`backend/app/tests/api/test_admin_dashboard.py`
- 测试：`frontend/src/adminDashboard.test.tsx`

- [x] **步骤 1：编写后端看板失败测试**

在 `backend/app/tests/api/test_admin_dashboard.py` 增加断言返回：
- `approved_actions_count`
- `pending_actions_count`
- `confirmed_compliance_count`
- `draft_compliance_count`
- `rag_active_documents_count`
- `rag_skipped_documents_count`
- `embedding_provider`
- `ocr_enabled`
- `llm_provider`
- `ollama_ready`

- [x] **步骤 2：编写前端展示失败测试**

在 `frontend/src/adminDashboard.test.tsx` 断言页面展示：
- “已批准动作”
- “RAG 跳过文档”
- “Embedding”
- “OCR”
- “LLM”

- [x] **步骤 3：运行测试确认失败**

运行：

```bash
cd backend && python -m pytest app/tests/api/test_admin_dashboard.py -v
cd frontend && npm run test -- --run src/adminDashboard.test.tsx
```

预期：FAIL，字段或页面文案不存在。

- [x] **步骤 4：实现后端统计**

在 `AdminDashboardService` 中查询：
- `ExerciseAction.status == APPROVED`
- `ExerciseAction.status == PENDING_REVIEW`
- `ComplianceDocument.review_status == "CONFIRMED"`
- `ComplianceDocument.review_status != "CONFIRMED"`
- `KnowledgeDocument.status == "ACTIVE"`
- `KnowledgeDocument.status == "SKIPPED"`

并从 settings/readiness 聚合 embedding、OCR、LLM 状态。

- [x] **步骤 5：实现前端状态展示**

在 `AdminDashboardPage.tsx` 中使用简洁状态块或表格展示，不新增营销式说明。状态颜色：
- ok：绿色
- warning：橙色
- error：红色

- [x] **步骤 6：运行测试验证通过**

运行：

```bash
cd backend && python -m pytest app/tests/api/test_admin_dashboard.py -v
cd frontend && npm run test -- --run src/adminDashboard.test.tsx
```

预期：PASS。

- [x] **步骤 7：Commit**

```bash
git add backend/app/services/admin_dashboard_service.py backend/app/api/v1/endpoints/admin_dashboard.py backend/app/tests/api/test_admin_dashboard.py frontend/src/pages/admin/AdminDashboardPage.tsx frontend/src/adminDashboard.test.tsx
git commit -m "feat: expose production readiness on admin dashboard"
```

---

## 任务 8：远端隔离环境部署真实 OCR、Embedding、Ollama/Gemma 并重建 RAG

**文件：**
- 修改：`README.md`
- 修改：`docs/12_acceptance_evidence.md`
- 修改：`docs/10_online_checklist.md`

- [x] **步骤 1：确认 `.env` 不泄漏**

运行：

```bash
git status --short
git check-ignore -v .env || true
```

预期：`.env` 未进入 git 跟踪，后续命令不得打印任何 API key。

- [x] **步骤 2：远端准备隔离目录**

运行：

```bash
ssh zhaosilei@100.99.170.46 'rm -rf /tmp/exercise-prescription-prod-ai && mkdir -p /tmp/exercise-prescription-prod-ai'
rsync -az --delete --exclude .git --exclude .env --exclude node_modules --exclude backend/.venv ./ zhaosilei@100.99.170.46:/tmp/exercise-prescription-prod-ai/
scp .env zhaosilei@100.99.170.46:/tmp/exercise-prescription-prod-ai/.env
```

预期：rsync 成功，`.env` 仅传到远端隔离目录，不提交仓库。

- [x] **步骤 3：远端安装或启动 Ollama/Gemma**

在远端执行：

```bash
ssh zhaosilei@100.99.170.46 '
  set -e
  if ! command -v ollama >/dev/null 2>&1; then
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  ollama serve >/tmp/ollama-exercise.log 2>&1 &
  sleep 5
  ollama pull gemma3:latest || ollama pull gemma:latest
  ollama pull nomic-embed-text
  ollama list
'
```

预期：`gemma3:latest` 或 `gemma:latest`、`nomic-embed-text` 出现在 `ollama list`。

- [x] **步骤 4：远端构建并启动容器**

运行：

```bash
ssh zhaosilei@100.99.170.46 '
  set -e
  cd /tmp/exercise-prescription-prod-ai
  docker compose down -v || true
  docker compose up -d --build
  docker compose ps
'
```

预期：backend、frontend、postgres、redis、qdrant、minio 均运行；如 Ollama 用 compose service，也应 healthy/running。

执行记录：远端使用 `sudo docker compose --progress plain up -d --build` 完成构建启动，并确认 backend healthy、frontend running、postgres/redis healthy、qdrant/minio/ollama running。为保留已下载模型和重建后的数据卷，本轮未执行 `docker compose down -v`，这是有意偏离。

- [x] **步骤 5：迁移和基础 seed**

运行：

```bash
ssh zhaosilei@100.99.170.46 '
  set -e
  cd /tmp/exercise-prescription-prod-ai
  docker compose exec -T backend alembic upgrade head
  docker compose exec -T backend python scripts/seed_initial_data.py
'
```

预期：命令退出码 0。

执行记录：`alembic upgrade head` 与 `seed_initial_data.py` 均退出码 0；默认演示账号密码随后已轮换为随机值，未打印明文。

- [x] **步骤 6：严格校验并重新导入资料**

运行：

```bash
ssh zhaosilei@100.99.170.46 '
  set -e
  cd /tmp/exercise-prescription-prod-ai
  docker compose exec -T backend python scripts/validate_reference_data.py --strict --json
  docker compose exec -T backend python scripts/seed_reference_data.py --strict
'
```

预期：
- 风险规则正常导入。
- 动作库 `approved > 0`，`pending` 不作为候选。
- 模板正常导入。
- 合规材料 `confirmed > 0`。
- RAG `skipped=0`、`errors=0`、`chunks > 0`。
- Qdrant embedding 索引 `indexed > 0`。

执行记录：strict validate 结果 `absolute_allowlist_paths=[]`、`missing_files=[]`、`blocking_errors=[]`；strict seed 结果 `actions approved=98 pending=0 errors=0`、`compliance confirmed=8 errors=0`、`rag_data skipped=0 errors=0 chunks=12841`。

- [x] **步骤 7：检查 readiness**

运行：

```bash
ssh zhaosilei@100.99.170.46 '
  set -e
  cd /tmp/exercise-prescription-prod-ai
  docker compose exec -T backend python - <<'"'"'PY'"'"'
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
response = client.get("/ready")
print(response.json())
assert response.status_code == 200
payload = response.json()
assert payload["status"] == "ok"
assert payload["checks"]["llm"]["status"] == "ok"
assert payload["checks"]["embedding"]["status"] == "ok"
PY
'
```

预期：`/ready` status ok，llm、embedding、database、redis、qdrant、minio 均 ok。

执行记录：远端生产 `/ready` 返回 `status=ok`，`llm=ollama:gemma3:270m`、`embedding=ollama:nomic-embed-text`、`ocr=paddleocr:enabled`，database、redis、qdrant、minio 均 ok。

- [x] **步骤 8：运行全量验证**

运行：

```bash
cd backend && python -m pytest
cd frontend && npm run lint
cd frontend && npm run test -- --run
cd frontend && npm run build
```

远端运行：

```bash
ssh zhaosilei@100.99.170.46 '
  set -e
  cd /tmp/exercise-prescription-prod-ai
  docker compose exec -T backend pytest
'
```

预期：全部通过；前端 build 允许仅有 Vite chunk size warning。

执行记录：
- `cd backend && python -m pytest`：`168 passed in 9.55s`。
- `cd frontend && npm run lint`：exit code 0。
- `cd frontend && npm run test -- --run`：16 个测试文件通过，`29 passed`。
- `cd frontend && npm run build`：exit code 0，仅 Vite chunk size warning。
- 远端容器 pytest 使用显式 test env 运行：`168 passed, 11 warnings in 10.71s`。生产 `.env` 使用真实 provider，测试环境必须显式覆盖为 mock/hash/OCR disabled。

- [x] **步骤 9：更新验收证据**

在 `docs/12_acceptance_evidence.md` 追加本轮记录，必须包含：
- 本地后端 pytest 通过数量。
- 本地前端 lint/test/build 结果。
- 远端 docker compose 构建结果。
- `validate_reference_data.py --strict` 结果。
- `seed_reference_data.py --strict` 结果，其中 RAG 必须 `skipped=0`。
- `/ready` 中 embedding、OCR、LLM/Ollama/Gemma 状态。

执行记录：`README.md`、`docs/10_online_checklist.md`、`docs/12_acceptance_evidence.md` 已记录本轮远端部署、strict validate、strict seed、RAG `skipped=0`、readiness 和 webhook 待提供项。步骤 8 的最终全量验证将作为任务 10 统一重跑后再勾选。

- [x] **步骤 10：Commit**

```bash
git add README.md docs/12_acceptance_evidence.md docs/10_online_checklist.md
git commit -m "docs: record production ai readiness evidence"
```

执行记录：已提交 `82989a6 fix: harden production rag ocr embedding readiness`，包含生产 RAG/OCR/embedding 硬化、远端部署证据与上线文档更新。步骤 8 最终全量验证仍按任务 10 统一重跑。

---

## 任务 9：收口生产运维硬化清单

**文件：**
- 修改：`docs/10_online_checklist.md`
- 修改：`docs/12_acceptance_evidence.md`
- 修改：`README.md`
- 可修改：`scripts/backup_data.sh`
- 可修改：`scripts/restore_data.sh`
- 可修改：`backend/app/core/logging.py`

- [x] **步骤 1：默认账号处置**

检查 `backend/scripts/seed_initial_data.py` 生成的默认账号。实现或记录一种上线处置方式：
- 优先：通过环境变量禁用默认密码或强制首次登录改密。
- 最小可接受：远端验证后修改默认账号密码，并在 `docs/10_online_checklist.md` 勾选“默认账号密码已修改或禁用默认账号”。

不得把新密码写入仓库或日志。

执行记录：远端隔离环境已将 5 个默认演示账号密码轮换为随机值，未打印或写入仓库。

- [x] **步骤 2：备份恢复演练**

远端运行：

```bash
ssh zhaosilei@100.99.170.46 '
  set -e
  cd /tmp/exercise-prescription-prod-ai
  scripts/backup_data.sh
  latest=$(ls -td backups/* | head -1)
  test -f "$latest/backup_manifest.sha256"
  CONFIRM_RESTORE=yes scripts/restore_data.sh "$latest"
'
```

预期：backup 和 restore 均退出码 0，`backup_manifest.sha256` 校验通过。

执行记录：`scripts/backup_data.sh` 成功，备份目录 `/tmp/exercise-prescription-prod-ai/backups/20260602-234834`；`backup_manifest.sha256` 对 PostgreSQL、Redis、Qdrant、MinIO 备份均校验 OK；`CONFIRM_RESTORE=yes scripts/restore_data.sh ...` 成功，恢复后 backend healthy 且 `/ready` ok。

- [x] **步骤 3：JSON 日志与错误告警自检**

配置 `.env`：

```dotenv
LOG_FORMAT=json
ERROR_ALERT_WEBHOOK_URL=<由 .env 提供或留空>
```

运行：

```bash
docker compose logs --tail=50 backend
```

预期：后端日志为 JSON 格式。若 `.env` 中配置了 webhook，触发一次测试错误告警并记录响应状态；不得打印 webhook secret。

执行记录：远端 `LOG_FORMAT=json` 已开启并验证 backend 日志可解析为 JSON；`ERROR_ALERT_WEBHOOK_URL` 未配置，阻断原因是生产平台尚未提供 webhook URL，因此上线清单中错误告警 Webhook 保持未勾选。

- [x] **步骤 4：更新清单和证据**

在 `docs/10_online_checklist.md` 勾选：
- 默认账号密码已修改或禁用默认账号。
- `scripts/backup_data.sh` 已在生产同等环境执行成功。
- `backup_manifest.sha256` 校验通过。
- PostgreSQL、Redis、MinIO、Qdrant 数据卷已纳入备份。
- 执行一次备份恢复演练。
- `LOG_FORMAT=json` 已开启。
- 错误告警 Webhook 已配置并完成一次测试触发；如果 `.env` 未配置 webhook，记录“未配置，需生产平台提供 webhook 后完成”，不得勾选。

执行记录：`docs/10_online_checklist.md`、`docs/12_acceptance_evidence.md` 和 `README.md` 已记录默认账号轮换、备份恢复、JSON 日志和 webhook 外部待提供项。

- [x] **步骤 5：Commit**

```bash
git add docs/10_online_checklist.md docs/12_acceptance_evidence.md README.md scripts/backup_data.sh scripts/restore_data.sh backend/app/core/logging.py
git commit -m "chore: close production operations checklist"
```

执行记录：备份/恢复脚本修复经 TDD 验证，已提交 `5099d2f chore: close production operations checklist`。

---

## 任务 10：最终一条一条对照验收并清理

**文件：**
- 修改：`docs/superpowers/plans/2026-06-02-production-rag-llm-ocr-hardening.md`
- 修改：`docs/12_acceptance_evidence.md`

- [x] **步骤 1：逐项检查本计划 checkbox**

打开本计划，从任务 1 到任务 9 逐项确认：
- 已实现的步骤勾选为 `[x]`。
- 未完成步骤必须保留 `[ ]`，并在 `docs/12_acceptance_evidence.md` 写明阻断原因。

执行记录：已从任务 1 到任务 9 逐项检查 checkbox；唯一未勾选的上线清单外部项是错误告警 Webhook，阻断原因已写入 `docs/10_online_checklist.md` 与 `docs/12_acceptance_evidence.md`：生产平台尚未提供 `ERROR_ALERT_WEBHOOK_URL`。

- [x] **步骤 2：运行最终全量命令**

本地运行：

```bash
cd backend && python -m pytest
cd frontend && npm run lint
cd frontend && npm run test -- --run
cd frontend && npm run build
```

远端运行：

```bash
ssh zhaosilei@100.99.170.46 '
  set -e
  cd /tmp/exercise-prescription-prod-ai
  docker compose ps
  docker compose exec -T backend python scripts/validate_reference_data.py --strict
  docker compose exec -T backend python scripts/seed_reference_data.py --strict
  docker compose exec -T backend pytest
'
```

预期：全部通过，RAG `skipped=0`，生产 readiness `status=ok`。

执行记录：
- 本地：后端 pytest `168 passed`；前端 lint exit 0；前端 Vitest 16 个测试文件、`29 passed`；前端 build exit 0，仅 chunk size warning。
- 远端：`docker compose up -d --build` 成功，backend healthy；`alembic upgrade head` 成功；`seed_initial_data.py` 成功且默认密码输出已脱敏；`validate_reference_data.py --strict` 成功；`seed_reference_data.py --strict` 输出 `rag_data skipped=0 errors=0 chunks=12841`；生产 `/ready` HTTP 200 且 `status=ok`，`components` 下 secret_key、database、redis、qdrant、minio、llm、embedding、ocr 全部 ok；远端容器 pytest 在显式 test env 下 `168 passed, 11 warnings`。

- [x] **步骤 3：确认没有 secret 进入 git**

运行：

```bash
git status --short
git diff -- .env .env.* || true
git grep -n "sk-" -- . ':!.env' ':!*.lock' || true
git grep -n "DASHSCOPE_API_KEY\\|ALIYUN_API_KEY\\|EMBEDDING_API_KEY\\|ERROR_ALERT_WEBHOOK_URL" -- . ':!.env' ':!.env.example' || true
```

预期：`.env` 未被跟踪；真实 key 不出现在仓库文件中。

执行记录：`git status --short` 在最终文档编辑前无输出；`git diff -- .env .env.*` 无输出；`git grep -n "sk-"` 仅命中 `risk-screenings` 等路由/文档假阳性；API key 变量扫描仅命中变量名、占位符和测试 key，未发现真实 runtime secret。

- [x] **步骤 4：最终 commit**

```bash
git add docs/superpowers/plans/2026-06-02-production-rag-llm-ocr-hardening.md docs/12_acceptance_evidence.md
git commit -m "docs: complete production ai hardening plan"
```

执行记录：最终计划与验收证据将随 `docs: complete production ai hardening plan` 提交。

- [x] **步骤 5：最终结论**

最终回复必须包含：
- 分支名。
- 最后 commit hash。
- 本地测试结果。
- 远端容器验证结果。
- RAG 导入结果，特别是 `skipped=0`。
- embedding provider、OCR provider、LLM provider/model。
- 仍未纳入范围的四项：设备接口、试点资料、报告模板管理、成果交付物。
- 如有未完成项，明确列出阻断资料或外部依赖。

执行记录：最终回复将以中文提供分支名、最后 commit hash、本地测试结果、远端部署结果、RAG 导入结果、embedding/OCR/LLM provider、仍排除四项和真实阻断项。

---

## 验收标准

上线使用状态必须同时满足：
- `rag_data/_manifests/rag_ingest_allowlist.txt` 不含绝对路径。
- `python scripts/validate_reference_data.py --strict` 通过。
- `python scripts/seed_reference_data.py --strict` 通过，且 RAG `skipped=0`、`errors=0`、`chunks > 0`。
- Qdrant 中存在真实 embedding 索引，生产环境不使用 hash embedding。
- PaddleOCR 已安装，`OCR_ENABLED=true` 时扫描件或图片资料可抽取文本。
- `LLM_PROVIDER=ollama` 或其他真实 provider 可生成符合 `PrescriptionDraft` schema 的 JSON；生产环境不使用 mock。
- docs 动作库导入后为 `APPROVED`，处方候选只使用已批准动作。
- 合规材料导入后为 `CONFIRMED`，不再显示待确认草稿状态。
- `/ready` 返回 ok，并包含 database、redis、qdrant、minio、llm、embedding、ocr 的状态。
- 默认账号、备份恢复、日志平台或告警项在上线清单中有明确完成证据；如果 webhook 外部资料未提供，必须单独列为生产平台待提供项。
- 后端 pytest、前端 lint/test/build 通过。
