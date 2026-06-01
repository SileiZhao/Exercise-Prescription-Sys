# AI 个性化运动处方平台

基于聚类算法与大模型的个性化运动处方智能生成与示范应用平台。工程包含 FastAPI 后端、React/Vite 前端、PostgreSQL、Redis、Qdrant、MinIO、Docker Compose、Alembic、认证/RBAC、六类健康数据、风险规则、模板动作知识库、聚类分型、处方编排、专家审核、反馈、管理科研和导出能力。

## 本地启动

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_initial_data.py
docker compose exec backend python scripts/seed_reference_data.py --no-rag-index
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

第一版参考资料导入使用：

```bash
cd backend
PYTHONPATH=. python scripts/seed_reference_data.py
```

它会幂等导入：

- `docs/ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json`：跳过 R0 配置项，R0 作为未命中默认结果。
- `docs/ai_exercise_prescription_template_library_v0_1_expert_review_draft.json`：R0/R1/R2 保留 FITT-VP，R3 不生成 FITT-VP。
- `docs/ai_exercise_action_library_v0_1_expert_review_draft.json`：新动作默认 `PENDING_REVIEW`。
- `docs/ai_exercise_compliance_copy_pack_v0_1_expert_review_draft.json`：作为专家审核草案展示。
- `rag_data/_manifests/rag_ingest_allowlist.txt`：解析 allowlist 中的资料并记录来源元数据。

如暂时没有 Qdrant，可先运行：

```bash
PYTHONPATH=. python scripts/seed_reference_data.py --no-rag-index
```

单独重建 RAG：

```bash
PYTHONPATH=. python scripts/import_rag_data.py --rag-root ../rag_data --catalog ../docs/knowledge_source_catalog_v0_2.json
```

PDF 文本解析使用 `pypdf`。扫描件或图片型 PDF 如解析不出文本，可在服务器部署 PaddleOCR 后开启 `OCR_PROVIDER=paddleocr`、`OCR_ENABLED=true`，再重建索引。

## LLM 配置

生产环境接入阿里云百炼/DashScope：

```bash
LLM_PROVIDER=aliyun
DASHSCOPE_API_KEY=你的运行时密钥
LLM_MODEL=qwen3.7-max
MULTIMODAL_MODEL=qwen3.6-plus
LOCAL_LLM_PROVIDER=ollama
LOCAL_LLM_MODEL=gemma
```

不要把真实 API Key 写入代码、文档或提交到仓库。模型名保持可配置；如阿里云实际可用模型名不同，修改环境变量即可。
