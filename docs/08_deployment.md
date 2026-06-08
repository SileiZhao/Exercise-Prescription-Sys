# 部署文档

## 环境要求

- Docker 24+
- Docker Compose v2+
- Node.js 22+，仅用于本地前端开发
- Python 3.12+，仅用于本地后端开发

## 首次部署

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_initial_data.py
docker compose exec backend python scripts/seed_reference_data.py --strict
```

如部署网络访问 Docker Hub 不稳定，可在 `.env` 中把基础镜像切到企业或云厂商镜像仓库，无需修改 Dockerfile：

```env
POSTGRES_IMAGE=registry.example.com/library/postgres:16-alpine
REDIS_IMAGE=registry.example.com/library/redis:7-alpine
QDRANT_IMAGE=registry.example.com/qdrant/qdrant:v1.12.1
MINIO_IMAGE=registry.example.com/minio/minio:RELEASE.2024-10-13T13-34-11Z
PYTHON_BASE_IMAGE=registry.example.com/library/python:3.12-slim
NODE_BASE_IMAGE=registry.example.com/library/node:22-alpine
NGINX_BASE_IMAGE=registry.example.com/library/nginx:1.27-alpine
```

初始化脚本会幂等创建默认机构、五类账号、动作库、RAG 知识库和 FITT-VP 处方模板。默认账号密码为 `Password123`，首次上线后必须修改。

知识库切片会自动尝试写入 Qdrant 向量索引。若首次部署时 Qdrant 尚未就绪，导入不会中断，系统会先使用数据库关键词检索；Qdrant 恢复后可重新构建索引：

```bash
curl -X POST http://localhost:8000/api/v1/admin/knowledge/reindex \
  -H "Authorization: Bearer <admin-token>"
```

聚类模型上线前应在管理端「聚类模型」页面完成训练和启用。启用新模型会自动归档旧 `ACTIVE` 模型；聚类标签只用于画像和模板匹配，不改变 R0/R1/R2/R3 风险等级。

报告导出接口：

```bash
GET /api/v1/reports/prescriptions/{prescription_id}.docx
GET /api/v1/reports/prescriptions/{prescription_id}.pdf
GET /api/v1/reports/phase-assessment.docx?weeks=4
GET /api/v1/reports/phase-assessment.pdf?weeks=4
```

报告下载需登录，普通用户只能导出自己的处方和阶段评估。PDF 报告包含可视中文正文，便于直接打开核阅和归档。成功导出处方报告会记录 `EXPORT_PRESCRIPTION_REPORT` 审计日志，成功导出阶段评估报告会记录 `EXPORT_PHASE_ASSESSMENT_REPORT` 审计日志，管理员可在审计日志页面按资源类型和动作筛查导出行为。

如需单独导入内容库，可在 backend 容器或本地后端环境执行：

```bash
PYTHONPATH=. python scripts/import_exercise_actions.py data/seed_actions.json
PYTHONPATH=. python scripts/import_knowledge.py data/seed_knowledge.json
PYTHONPATH=. python scripts/import_prescription_templates.py data/seed_templates.json
```

## 健康检查

```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
curl http://localhost:8000/api/v1/openapi.json
```

`/health` 只表示后端进程可响应；`/ready` 会检查 secret_key、database、redis、qdrant、minio、llm 组件。任一必要组件不可用时，`/ready` 返回 HTTP 503，并在响应体中列出具体组件状态。Docker Compose 的 backend healthcheck 使用 `/ready`，frontend 会等待 backend 健康后再启动。

## 备份与恢复

上线环境至少需要覆盖 PostgreSQL、Redis、Qdrant 和 MinIO 四类持久化数据。项目提供可执行脚本统一备份：

```bash
scripts/backup_data.sh
```

默认会在 `backups/<timestamp>/` 下生成：

- `postgres.sql`：PostgreSQL 逻辑备份，包含 `--clean --if-exists`，可覆盖恢复。
- `redis_data.tgz`：Redis 数据卷归档。
- `qdrant_data.tgz`：Qdrant 向量数据卷归档。
- `minio_data.tgz`：MinIO 对象数据卷归档。
- `backup_manifest.sha256`：备份文件校验清单。
- `backup_metadata.env`：备份时间、Compose 项目名、数据库名等元数据。

备份完成后先校验文件完整性：

```bash
cd backups/<timestamp>
sha256sum -c backup_manifest.sha256
```

恢复会覆盖当前环境数据，必须显式确认：

```bash
CONFIRM_RESTORE=yes scripts/restore_data.sh backups/<timestamp>
```

恢复脚本默认只恢复并启动 PostgreSQL、Redis、Qdrant、MinIO 相关数据服务。确认数据服务正常后，再显式启动应用服务：

```bash
docker compose up -d backend frontend
```

如果生产环境设置了自定义 `COMPOSE_PROJECT_NAME` 或使用不同的备份辅助镜像，可在执行脚本前注入：

```bash
COMPOSE_PROJECT_NAME=exercise-prod BACKUP_HELPER_IMAGE=registry.example.com/library/alpine:3.20 scripts/backup_data.sh
CONFIRM_RESTORE=yes COMPOSE_PROJECT_NAME=exercise-prod BACKUP_HELPER_IMAGE=registry.example.com/library/alpine:3.20 scripts/restore_data.sh backups/<timestamp>
```

## 生产建议

- 修改 `.env` 中 `SECRET_KEY`、数据库密码、MinIO 密钥。
- 生产环境设置 `ENVIRONMENT=production`；此时 `/ready` 会拒绝默认 `SECRET_KEY`、mock LLM 和缺失 API Key 的非 mock Provider。
- 开发和自动化测试可以使用 `LLM_PROVIDER=mock`；生产必须使用 `LLM_PROVIDER=aliyun` 或其他 OpenAI-compatible Provider。
- 不要把大模型 API Key 写入仓库；通过 `.env`、部署平台密钥或环境变量注入 OpenAI-compatible 或阿里云兼容配置。
- 接入阿里云百炼 / DashScope 兼容模式时，推荐使用环境变量注入：

```env
LLM_PROVIDER=aliyun
DASHSCOPE_API_KEY=***通过部署平台或 .env 注入***
LLM_MODEL=qwen3.7-max
LLM_MULTIMODAL_MODEL=qwen3.6-plus
```

- `docker-compose.yml` 已将 `LLM_*`、`DASHSCOPE_API_KEY`、`ALIYUN_API_KEY`、`QDRANT_*`、`RAG_*` 和 `MINIO_*` 传递给后端容器；生产环境只需要修改 `.env`，不要直接改 compose 文件写入密钥。
- 生产建议开启结构化日志并接入错误告警 Webhook：

```env
LOG_LEVEL=INFO
LOG_FORMAT=json
ERROR_ALERT_WEBHOOK_URL=***通过部署平台或 .env 注入***
```

`LOG_FORMAT=json` 会输出 `timestamp`、`level`、`logger`、`message`、`environment`、`service`、`request_id` 等字段，便于 ELK、Loki 或云日志平台采集。未处理异常会返回统一 500 响应并尝试向 `ERROR_ALERT_WEBHOOK_URL` 发送错误摘要；Webhook 地址中如包含 token，必须只通过部署密钥注入。
- 使用 `docker-compose.prod.yml` 叠加生产配置。
- 在 Nginx 或 Traefik 上配置 HTTPS。
- 定期备份 PostgreSQL、Redis、MinIO 和 Qdrant 数据卷，并每次上线前执行一次备份恢复演练。
