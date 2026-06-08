# AI 运动处方平台生产就绪缺口闭环实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [x]`）语法来跟踪进度。

**目标：** 完成 AI 个性化运动处方平台上线级缺口修复与验收，使当前分支达到可直接上线试运行标准。

**架构：** 继续沿用 FastAPI + SQLAlchemy/Alembic + React/Vite + Docker Compose + PostgreSQL/Redis/Qdrant/MinIO/Ollama 架构。所有新增能力以资料驱动、配置门禁、审计留痕和可测试接口方式补齐，不引入新的大型框架，不实现本轮明确排除的设备接口、试点资料、报告模板管理和成果交付物。

**技术栈：** FastAPI、SQLAlchemy、Alembic、Pydantic、scikit-learn、Pandas/OpenPyXL、React、Ant Design、Vitest、Pytest、Docker Compose。

---

## 已阅读资料与基线

- [x] 阅读 `docs/基于聚类算法与大模型的个性化运动处方智能生成与示范应用平台开发方案.md`，确认闭环主线为六类数据、风险筛查、聚类分型、RAG/LLM、专家审核、执行反馈、动态调整和科研沉淀。
- [x] 阅读 `docs/AI 个性化运动处方平台产品级开发计划.md`，确认禁止 demo、禁止 R2 自动发布、禁止 R3 训练处方、必须有权限、审计、部署和测试。
- [x] 读取 `docs/基于聚类算法与大模型的个性化运动处方智能生成与示范应用平台总体建设方案.docx`，确认七层架构、2-4 周调整、8-12 周评估、专家审核与伦理合规。
- [x] 读取 `docs/AI运动处方平台风险分级与处方生成规则表.docx`，确认 R0/R1/R2/R3、禁忌、审核状态、反馈预警和动态调整规则。
- [x] 读取 `docs/AI运动处方平台六类数据采集标准格式.docx`，确认科研字段、血压血糖阈值、六类数据字段和反馈字段。
- [x] 阅读 `docs/` 与 `rag_data/` 下风险规则库、动作库、处方模板库、RAG 原始资料、合规材料和 allowlist。
- [x] 阅读 `docs/superpowers/plans/2026-06-01-complete-launch-implementation.md`。
- [x] 阅读 `docs/superpowers/plans/2026-06-02-production-rag-llm-ocr-hardening.md`。
- [x] 阅读 `docs/10_online_checklist.md`。
- [x] 阅读 `docs/12_acceptance_evidence.md`。

### 基线验证结果

- [x] `cd backend && ENVIRONMENT=test LLM_PROVIDER=mock EMBEDDING_PROVIDER=hash OCR_ENABLED=false python -m pytest`：168/168 passed，9.26s。
- [x] `cd frontend && npm run lint`：exit 0。
- [x] `cd frontend && npm run test -- --run`：16 个测试文件、29/29 passed。
- [x] `cd frontend && npm run build`：exit 0；Vite chunk size warning 仍存在但不阻断。
- [x] `cd backend && python scripts/validate_reference_data.py --strict --json`：风险规则 80、动作 98、模板 16、合规 8、知识来源 40、RAG allowlist 57、无绝对路径、无缺失文件、无 blocking_errors。

## 任务 1：风险规则库与模板库专家确认状态

**文件：**
- 修改：`backend/scripts/import_risk_rules.py`
- 修改：`backend/scripts/import_prescription_templates.py`
- 修改：`backend/scripts/seed_reference_data.py`
- 修改：`backend/app/services/admin_rule_service.py`
- 修改：`backend/app/services/template_service.py`
- 测试：`backend/app/tests/scripts/test_import_reference_data.py`
- 测试：`backend/app/tests/scripts/test_import_prescription_templates.py`
- 测试：`backend/app/tests/scripts/test_seed_reference_data.py`

- [x] 编写失败测试：strict seed 后 docs 风险规则为 `EXPERT_CONFIRMED`，处方模板为 `APPROVED`，并存在对应 audit log。
- [x] 运行测试确认失败：`cd backend && python -m pytest app/tests/scripts/test_import_reference_data.py app/tests/scripts/test_import_prescription_templates.py app/tests/scripts/test_seed_reference_data.py -v`。
- [x] 实现 `--confirm` / `--approve` 导入参数，统一 seed 默认按用户确认批量确认风险规则和批准模板。
- [x] 保留每次导入/批量确认的审计 metadata：资料来源、版本、确认人、确认模式、导入数量。
- [x] 运行局部测试和 `python scripts/validate_reference_data.py --strict --json`。

## 任务 2：聚类多算法模型治理与预测

**文件：**
- 修改：`backend/app/models/cluster.py`
- 修改：`backend/app/schemas/cluster.py`
- 修改：`backend/app/services/clustering_service.py`
- 修改：`backend/app/api/v1/endpoints/clusters.py`
- 修改：`backend/scripts/train_cluster_model.py`
- 创建：`backend/alembic/versions/0016_cluster_model_governance.py`
- 修改：`backend/app/tests/services/test_clustering.py`
- 修改：`backend/app/tests/api/test_clusters.py`
- 修改：`frontend/src/api/clusters.ts`
- 修改：`frontend/src/pages/admin/AdminClustersPage.tsx`
- 修改：`frontend/src/adminClusters.test.tsx`

- [x] 编写失败测试：训练支持 `KMeans`、`DBSCAN`、`GaussianMixture`、`AgglomerativeClustering`，输出统一特征、评估指标、`model_origin=bootstrap_rule_calibrated`。
- [x] 编写失败测试：不达标模型不能自动启用；达标模型启用时归档旧 ACTIVE 模型并写 audit log。
- [x] 编写失败测试：用户分类必须使用已启用模型持久化的 scaler/model params 预测，不能只按规则标签匹配 cluster profile。
- [x] 编写失败测试：每个簇输出核心风险、运动目标、FITT 范围、禁忌/注意事项、专家复核建议和运动生理学命名标签。
- [x] 实现 BOOTSTRAP_V1：真实样本不足时使用现有用户评估数据加风险规则锚点构建训练集，记录 `model_origin=bootstrap_rule_calibrated`。
- [x] 实现阈值：silhouette >= 0.25，Davies-Bouldin <= 2.2，cluster_stability >= 0.70，最小簇占比 >= 5% 或不少于 10 人；DBSCAN 噪声率 <= 35%，有效簇数 >= 2。
- [x] 前端管理页展示算法、来源、阈值通过状态、启用状态、指标、簇画像和启用限制。
- [x] 运行局部后端/前端聚类测试。

## 任务 3：处方执行安全与版本展示

**文件：**
- 修改：`backend/app/models/prescription.py`
- 修改：`backend/app/services/prescription_orchestrator.py`
- 修改：`backend/app/services/prescription_safety_service.py`
- 修改：`backend/app/api/v1/endpoints/prescriptions.py`
- 修改：`backend/app/api/v1/endpoints/feedback.py`
- 修改：`frontend/src/pages/user/PrescriptionPage.tsx`
- 修改：`frontend/src/pages/user/TodayExercisePage.tsx`
- 测试：`backend/app/tests/api/test_prescriptions.py`
- 测试：`backend/app/tests/api/test_feedback.py`
- 测试：`frontend/src/prescription.test.tsx`
- 测试：`frontend/src/feedback.test.tsx`

- [x] 编写失败测试：今日运动只返回 PUBLISHED 且 latest effective 处方。
- [x] 编写失败测试：R2 审核前不可执行；R3 不展示训练入口。
- [x] 编写失败测试：新处方发布时旧 PUBLISHED 自动 `SUPERSEDED`。
- [x] 实现用户处方列表默认只展示最新有效处方，历史版本通过参数查看。
- [x] 前端展示处方版本、审核状态、历史版本入口和 R3/R2 执行禁用提示。
- [x] 运行处方与反馈局部测试。

## 任务 4：反馈调整规则与调整证据

**文件：**
- 修改：`backend/app/models/prescription.py`
- 修改：`backend/app/schemas/feedback.py`
- 修改：`backend/app/services/feedback_adjustment_service.py`
- 修改：`backend/app/api/v1/endpoints/feedback.py`
- 修改：`backend/app/tests/services/test_feedback_adjustment.py`
- 修改：`backend/app/tests/api/test_feedback.py`
- 修改：`frontend/src/pages/user/TodayExercisePage.tsx`
- 修改：`frontend/src/feedback.test.tsx`

- [x] 编写失败测试：SBP >= 180 或 DBP >= 110 停止运动并转专家/医疗建议。
- [x] 编写失败测试：空腹血糖 <3.9 或 >16.7 mmol/L 暂停当日运动并复核。
- [x] 编写失败测试：胸痛、晕厥感、严重气促立即停止并高优先级复核。
- [x] 编写失败测试：异常心率、疼痛加重、RPE 连续两次 >=17、完成率 <60% 触发降阶/暂停/复核。
- [x] 实现每次调整保存触发规则、原因、前后版本差异、动作级影响和专家复核优先级。
- [x] 前端展示触发规则、调整原因和复核状态。

## 任务 5：专家审核工作台增强

**文件：**
- 修改：`backend/app/schemas/review.py`
- 修改：`backend/app/services/expert_review_service.py`
- 修改：`backend/app/api/v1/endpoints/expert_reviews.py`
- 修改：`backend/app/tests/api/test_expert_reviews.py`
- 修改：`frontend/src/api/expertReviews.ts`
- 修改：`frontend/src/pages/expert/ExpertReviewPage.tsx`
- 修改：`frontend/src/expertReviews.test.tsx`

- [x] 编写失败测试：队列支持风险等级、审核状态、机构、时间、处方类型、异常反馈筛选。
- [x] 编写失败测试：审核动作支持批准、驳回、转诊、要求补充资料、暂停运动并写 audit log。
- [x] 编写失败测试：统计平均审核时长、R2 待审数、超时项。
- [x] 实现 API 参数、service query、统计汇总和审计 metadata。
- [x] 前端补齐筛选控件、动作按钮、统计卡片和空状态。

## 任务 6：科研导出产品化

**文件：**
- 修改：`backend/app/models/audit.py`
- 修改：`backend/app/models/prescription.py`
- 修改：`backend/app/schemas/research_export.py`
- 修改：`backend/app/services/research_export_service.py`
- 修改：`backend/app/api/v1/endpoints/research_export.py`
- 修改：`backend/app/tests/api/test_research_export.py`
- 修改：`frontend/src/api/researchExport.ts`
- 修改：`frontend/src/pages/research/ResearchExportPage.tsx`
- 修改：`frontend/src/researchExport.test.tsx`

- [x] 编写失败测试：科研导出申请、审批、限时下载、审计日志流程。
- [x] 编写失败测试：CSV 和 Excel 均可导出。
- [x] 编写失败测试：`participant_code=hash(user_id + salt)`，salt 来自环境变量，导出不含姓名、邮箱、手机号、身份证等直接身份信息。
- [x] 实现默认字段清单：匿名编号、年龄段、性别、体格、生命体征、生化、慢病风险、用药、体能、疼痛、风险等级、处方 FITT、执行反馈、不良事件、调整次数、阶段变化和依从性趋势。
- [x] 前端展示申请状态、审批状态、到期时间、下载格式和脱敏说明。

## 任务 7：用户 dashboard 非占位

**文件：**
- 修改：`backend/app/schemas/admin_dashboard.py` 或创建用户 dashboard schema
- 修改：`backend/app/services/admin_dashboard_service.py` 或创建用户 dashboard service
- 修改：`backend/app/api/v1/router.py`
- 修改：`frontend/src/App.tsx`
- 创建/修改：`frontend/src/pages/user/UserDashboardPage.tsx`
- 修改：`frontend/src/App.test.tsx`
- 创建：`frontend/src/userDashboard.test.tsx`
- 创建：`backend/app/tests/api/test_user_dashboard.py`

- [x] 编写失败测试：dashboard 返回当前风险等级与审核状态、今日是否可运动、本周完成率、当前阶段目标、最近 RPE/疼痛/不适反馈、血压/血糖提醒、处方版本、下次复评日期。
- [x] 编写失败测试：运营指标包含连续运动天数、周达标次数、计划完成趋势、异常反馈次数、专家审核状态。
- [x] 实现后端聚合接口和前端卡片页面。
- [x] 确保页面不是占位页，空数据时展示可执行下一步而不是假数据。

## 任务 8：处方证据持久化与 RAG 可追溯

**文件：**
- 修改：`backend/app/models/prescription.py`
- 修改：`backend/app/schemas/prescription.py`
- 修改：`backend/app/services/prescription_orchestrator.py`
- 修改：`backend/app/services/report_service.py`
- 创建：`backend/alembic/versions/0017_prescription_evidence.py`
- 修改：`backend/app/tests/services/test_prescription_orchestrator.py`
- 修改：`backend/app/tests/api/test_prescriptions.py`

- [x] 编写失败测试：处方生成保存命中的风险规则、模板、动作、RAG chunk、LLM provider/model、schema 校验、安全校验结果。
- [x] 编写失败测试：RAG 引用为相对路径，原始资料 chunk 可追溯；MinIO 对象引用或归档记录存在时保存引用。
- [x] 实现 `prescription_evidence` 表或等价结构化持久化。
- [x] 报告导出引用证据，不输出敏感配置。

## 任务 9：认证与生产安全

**文件：**
- 修改：`backend/app/models/user.py`
- 修改：`backend/app/schemas/auth.py`
- 修改：`backend/app/services/auth_service.py`
- 修改：`backend/app/api/v1/endpoints/auth.py`
- 修改：`backend/app/core/config.py`
- 修改：`backend/app/core/readiness.py`
- 修改：`backend/app/core/logging.py`
- 修改：`backend/scripts/seed_initial_data.py`
- 修改：`backend/app/tests/api/test_auth.py`
- 修改：`backend/app/tests/core/test_readiness.py`
- 修改：`backend/app/tests/core/test_logging_alerts.py`
- 修改：`frontend/src/api/auth.ts`
- 修改：`frontend/src/pages/LoginPage.tsx`
- 修改：`frontend/src/auth.test.tsx`

- [x] 编写失败测试：refresh token、logout、change password 可用。
- [x] 编写失败测试：默认账号首次登录强制改密。
- [x] 编写失败测试：生产环境禁止 mock LLM、hash embedding、OCR disabled 启动或 ready。
- [x] 编写失败测试：日志脱敏、secret 扫描和错误告警 webhook 自检进入上线清单；未提供 `ERROR_ALERT_WEBHOOK_URL` 时记录真实阻断项，不伪造通过。
- [x] 实现认证接口、前端令牌处理和改密流程。
- [x] 更新 `.env.example` 但不写真实 secret。

## 任务 10：文档、完整验证、远端部署验收和提交

**文件：**
- 修改：`docs/10_online_checklist.md`
- 修改：`docs/12_acceptance_evidence.md`
- 修改：本计划文件，逐项勾选完成项。

- [x] 运行完整本地验证：`cd backend && ENVIRONMENT=test LLM_PROVIDER=mock EMBEDDING_PROVIDER=hash OCR_ENABLED=false python -m pytest`。
- [x] 运行完整本地验证：`cd frontend && npm run lint`。
- [x] 运行完整本地验证：`cd frontend && npm run test -- --run`。
- [x] 运行完整本地验证：`cd frontend && npm run build`。
- [x] 运行完整本地验证：`cd backend && python scripts/validate_reference_data.py --strict --json`。
- [x] 在远端隔离环境执行 `docker compose up -d --build`。
- [x] 在远端隔离环境执行 `alembic upgrade head`。
- [x] 在远端隔离环境执行 `seed_initial_data.py`。
- [x] 在远端隔离环境执行 `validate_reference_data.py --strict`。
- [x] 在远端隔离环境执行 `seed_reference_data.py --strict`。
- [x] 在远端隔离环境检查 `/ready`，确认 backend healthy，postgres/redis/qdrant/minio/ollama/frontend 正常，LLM 为 ollama/gemma，embedding 为真实模型，OCR 为 PaddleOCR。
- [x] 更新上线清单和验收证据，写明命令输出摘要、排除四项和 `ERROR_ALERT_WEBHOOK_URL` 真实外部配置阻断项。
- [x] 提交 commit：`feat: close production readiness gaps`。
- [x] 确认 `git status` 干净。
- [x] 调用 `update_goal(status="complete")`。

### 最终验证证据摘要

- [x] 最终后端全量验证：`188 passed, 1 warning in 11.91s`。
- [x] 最终前端 lint：exit 0。
- [x] 最终前端测试：`17 passed (17)`、`34 passed (34)`。
- [x] 最终前端 build：exit 0；仅保留 Vite chunk size warning。
- [x] 最终 strict 资料校验：风险规则 80、动作 98、模板 16、合规材料 8、知识来源 40、RAG allowlist 57，`blocking_errors=[]`。
- [x] 远端部署：`docker compose up -d --build` 成功；backend/frontend built，backend healthy。
- [x] 远端迁移：`alembic upgrade head` 成功迁移至 `0019_auth_refresh_tokens`。
- [x] 远端资料导入：风险规则 `imported=78`，动作 `approved=98`，模板 `updated=16`，合规 `confirmed=8`，RAG `skipped=0/errors=0/chunks=12841`。
- [x] 远端聚类模型：`id=1`、`status=ACTIVE`、`model_origin=bootstrap_rule_calibrated`、`evaluation_passed=1.0`。
- [x] 远端 `/ready`：`status=ok`，LLM `ollama:gemma3:270m`，embedding `ollama:nomic-embed-text`，OCR `paddleocr:enabled`。
- [x] 真实外部配置阻断项：远端 `ERROR_ALERT_WEBHOOK_URL_SET=no`，未伪造通过。
