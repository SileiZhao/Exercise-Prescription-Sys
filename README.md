# AI 个性化运动处方平台

基于聚类算法与大模型的个性化运动处方智能生成与示范应用平台。工程包含 FastAPI 后端、React/Vite 前端、PostgreSQL、Redis、Qdrant、MinIO、Docker Compose、Alembic、认证/RBAC、六类健康数据、风险规则、模板动作知识库、聚类分型、处方编排、专家审核、反馈、管理科研和导出能力。

## 本地启动

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_initial_data.py
docker compose exec backend python scripts/seed_reference_data.py --strict
```

如果当前网络无法访问 Docker Hub，可临时覆盖基础镜像源后重试构建：

```bash
PYTHON_BASE_IMAGE=docker.m.daocloud.io/library/python:3.12-slim \
NODE_BASE_IMAGE=docker.m.daocloud.io/library/node:22-alpine \
NGINX_BASE_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine \
docker compose up -d --build
```

访问：

- 后端健康检查：http://localhost:8000/health
- OpenAPI：http://localhost:8000/api/v1/openapi.json
- 前端入口：http://localhost:5173
- MinIO Console：http://localhost:9001
- Qdrant：http://localhost:6333/dashboard

## 本地测试

后端：

```bash
cd backend
python -m pytest
```

前端：

```bash
cd frontend
npm install
npm run lint
npm run test -- --run
npm run build
```

## 初始化数据

`scripts/seed_initial_data.py` 会幂等初始化演示账号和最小业务数据：

- 默认机构和五类账号：管理员、专家、普通用户、科研人员、机构管理员。
- 默认动作库：快走、功率车、八段锦、弹力带划船、坐姿提踵，导入后进入 `PENDING_REVIEW`。
- 默认 RAG 知识：R3 安全边界、R2 高血压原则、FITT-VP 结构要求、传统功法说明。
- 默认 FITT-VP 模板：R0 基础健康维持、R1 减脂改善、R2 高血压谨慎型。

默认账号密码为 `Password123`，生产部署后应立即修改。
知识库导入和管理端新增文档会自动尝试写入 Qdrant 向量索引；如果 Qdrant 暂不可用，系统仍会保留数据库切片并回退到关键词检索。恢复 Qdrant 后可在管理端知识库页点击「重建向量索引」，或调用 `POST /api/v1/admin/knowledge/reindex`。
聚类模型可在管理端「聚类模型」页面训练、查看轮廓系数、启用或归档；同一时间只允许一个 `ACTIVE` 模型，分型结果只参与健康画像和模板匹配，不覆盖风险规则。
用户端支持导出处方报告和阶段评估报告，均提供 Word（DOCX）与 PDF 两种格式；报告内容包含用户摘要、风险等级、命中规则、分型、FITT-VP、注意事项、禁忌、复测周期、专家审核和免责声明。PDF 使用 Type0/CID 字体生成可视中文正文，每次报告导出都会写入审计日志，便于追踪数据访问和导出行为。

也可以单独导入业务内容：

```bash
cd backend
PYTHONPATH=. python scripts/import_exercise_actions.py data/seed_actions.json
PYTHONPATH=. python scripts/import_knowledge.py data/seed_knowledge.json
PYTHONPATH=. python scripts/import_prescription_templates.py data/seed_templates.json
```

## 导入 docs 与 rag_data 参考资料

第一版参考资料导入使用以下命令。本地开发如果暂未启动 Qdrant，可先用 `--no-rag-index` 只写入数据库切片；上线或生产同等环境必须使用 `--strict`，确保任一阶段出现错误时立即失败。

```bash
cd backend
PYTHONPATH=. python scripts/validate_reference_data.py --json
PYTHONPATH=. python scripts/validate_reference_data.py --strict
PYTHONPATH=. python scripts/seed_reference_data.py --no-rag-index --strict
```

它会幂等导入：

- `docs/ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json`：跳过 R0 配置项，R0 作为未命中默认结果。
- `docs/ai_exercise_prescription_template_library_v0_1_expert_review_draft.json`：R0/R1/R2 保留 FITT-VP，R3 不生成 FITT-VP。
- `docs/ai_exercise_action_library_v0_1_expert_review_draft.json`：本轮已获专家批准，统一导入为 `APPROVED`，处方候选仅使用已批准动作。
- `docs/ai_exercise_compliance_copy_pack_v0_1_expert_review_draft.json`：本轮已由法务、伦理和运动医学专家确认，统一导入为 `CONFIRMED` / `ACTIVE`，并清空 `pending_confirmation`。
- `rag_data/_manifests/rag_ingest_allowlist.txt`：解析相对于 `rag_data/` 的资料路径并记录来源元数据；生产 strict 导入要求 `skipped=0`、`errors=0`、`chunks>0`。

如暂时没有 Qdrant，可先运行：

```bash
PYTHONPATH=. python scripts/seed_reference_data.py --no-rag-index
```

生产初始化在容器内执行：

```bash
docker compose exec backend python scripts/seed_reference_data.py --strict
```

容器内脚本会优先读取 `PROJECT_ROOT` 环境变量定位挂载的项目资料；`docker-compose.yml` 默认传入 `/workspace`，因此 `docs/` 与 `rag_data/` 可在容器中按当前工作区资料导入和校验。

也可以按阶段导入或跳过 RAG：

```bash
PYTHONPATH=. python scripts/seed_reference_data.py --only risk --strict
PYTHONPATH=. python scripts/seed_reference_data.py --only actions --strict
PYTHONPATH=. python scripts/seed_reference_data.py --only templates --strict
PYTHONPATH=. python scripts/seed_reference_data.py --only compliance --strict
PYTHONPATH=. python scripts/seed_reference_data.py --only rag --no-rag-index --strict
PYTHONPATH=. python scripts/seed_reference_data.py --skip-rag --strict
```

单独重建 RAG：

```bash
PYTHONPATH=. python scripts/import_rag_data.py --rag-root ../rag_data --catalog ../docs/knowledge_source_catalog_v0_2.json --strict
```

PDF 文本解析优先使用 `pypdf`。扫描件、图片型 PDF 或图片资料如解析不出文本，可在服务器部署 PaddleOCR 后开启 `OCR_PROVIDER=paddleocr`、`OCR_ENABLED=true`，再重建索引。生产建议限制 `OCR_PDF_MAX_PAGES=3` 先完成上线资料抽取验收，再按资料规模调大页数上限。

RAG 向量索引必须使用真实 embedding provider。生产环境不得使用 `EMBEDDING_PROVIDER=hash`。本地 Ollama 方案示例：

```dotenv
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_BASE_URL=http://ollama:11434
RAG_EMBEDDING_DIMENSION=768
RAG_RECREATE_COLLECTION_ON_DIMENSION_MISMATCH=true
RAG_INDEX_BATCH_SIZE=16
EMBEDDING_TIMEOUT_SECONDS=120
OCR_PROVIDER=paddleocr
OCR_ENABLED=true
OCR_PDF_MAX_PAGES=3
FLAGS_use_mkldnn=false
```

## LLM 配置

`LLM_PROVIDER=mock` 仅允许在开发和测试环境使用。生产环境必须接入阿里云百炼 / DashScope、Ollama/Gemma 或其他非 mock Provider，并通过 `.env` 或部署密钥注入 Key。

生产环境接入阿里云百炼 / DashScope：

```bash
LLM_PROVIDER=aliyun
DASHSCOPE_API_KEY=你的运行时密钥
LLM_MODEL=qwen3.7-max
MULTIMODAL_MODEL=qwen3.6-plus
LOCAL_LLM_PROVIDER=ollama
LOCAL_LLM_MODEL=gemma
```

不要把真实 API Key 写入代码、文档或提交到仓库。模型名保持可配置；如阿里云实际可用模型名不同，修改环境变量即可。

生产环境使用本地 Ollama/Gemma：

```dotenv
LLM_PROVIDER=ollama
LOCAL_LLM_PROVIDER=ollama
LOCAL_LLM_MODEL=gemma3:270m
OLLAMA_BASE_URL=http://ollama:11434
```

启动前确保 Ollama 服务中已有 `LOCAL_LLM_MODEL` 与 `EMBEDDING_MODEL`：

```bash
ollama pull gemma3:270m
ollama pull nomic-embed-text
```

`/ready` 会检查 `llm`、`embedding`、`ocr`、`qdrant` 等生产门禁；生产环境中 mock LLM 或 hash embedding 会返回 not ready。

## 生产运维

生产部署后必须处置默认账号，不得继续使用 `Password123`。本轮远端隔离环境已将默认演示账号密码轮换为随机值，未写入日志或仓库。

备份恢复脚本会按需解析 `.env` 中的 Docker Compose project name，不会 `source .env`，因此可处理包含空格的变量值。上线前至少运行一次：

```bash
scripts/backup_data.sh
CONFIRM_RESTORE=yes scripts/restore_data.sh backups/<timestamp>
```

备份范围包含 PostgreSQL、Redis、Qdrant 和 MinIO，并生成 `backup_manifest.sha256` 用于校验。生产日志建议设置 `LOG_FORMAT=json`；错误告警需由生产平台提供 `ERROR_ALERT_WEBHOOK_URL` 后再启用测试触发。
