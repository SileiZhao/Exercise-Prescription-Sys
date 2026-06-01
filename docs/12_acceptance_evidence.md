# 验收证据矩阵

本文档用于把产品目标、最高优先级安全规则、最低测试和上线命令映射到当前仓库中的可验证证据。结论以测试、源码、脚本、部署配置和文档为准。

## 交付阶段证据

### 1. 工程初始化

- 后端：`backend/app/main.py`、`backend/app/core/*`、`backend/alembic/*`。
- 前端：`frontend/src/App.tsx`、`frontend/package.json`、`frontend/vite.config.ts`。
- 部署：`docker-compose.yml`、`docker-compose.prod.yml`、`.env.example`、`README.md`、`docs/08_deployment.md`。
- 验证：`app/tests/api/test_health.py`、`app/tests/deployment/test_docker_compose_env.py`、`app/tests/deployment/test_docker_image_configuration.py`。

### 2. 认证权限

- 后端：`backend/app/api/v1/endpoints/auth.py`、`backend/app/api/v1/endpoints/users.py`、`backend/app/core/security.py`、`backend/app/core/deps.py`、`backend/app/models/user.py`。
- 前端：`frontend/src/pages/LoginPage.tsx`、`frontend/src/pages/RegisterPage.tsx`、`frontend/src/components/ProtectedRoute.tsx`。
- 覆盖角色：`USER`、`EXPERT`、`ADMIN`、`RESEARCHER`、`ORG_ADMIN`。
- 验证：`app/tests/api/test_auth.py`、`app/tests/api/test_admin_users.py`。

### 3. 六类数据

- 数据模型：`backend/app/models/health_data.py`。
- API：`backend/app/api/v1/endpoints/health_data.py`。
- Service：`backend/app/services/health_profile_service.py`。
- 前端建档：`frontend/src/pages/user/OnboardingWizardPage.tsx`。
- 覆盖数据：基础信息、体质测试、身体成分、生化指标、疾病与运动风险、运动反馈。
- 验证：`app/tests/api/test_health_data.py`。

### 4. 风险引擎

- 风险规则：`backend/app/services/risk_engine.py`、`backend/app/services/risk_service.py`。
- 规则管理：`backend/app/api/v1/endpoints/admin_rules.py`、`backend/app/services/admin_rule_service.py`。
- 前端：`frontend/src/pages/admin/AdminRulesPage.tsx`。
- 内置规则：胸痛、晕厥、严重气短、SBP ≥ 180 或 DBP ≥ 110、疼痛 ≥ 7、医生限制运动判定为 R3；高血压、糖代谢异常、疼痛 4-6、老年功能下降、用药影响判定为 R2；BMI ≥ 28 判定为 R1/R2。
- 验证：`app/tests/api/test_risk.py`、`app/tests/api/test_admin_rules.py`。

### 5. 动作库、模板库、知识库

- 模型：`backend/app/models/template.py`。
- Service：`backend/app/services/template_service.py`、`backend/app/services/knowledge_service.py`。
- API：`backend/app/api/v1/endpoints/admin_templates.py`、`backend/app/api/v1/endpoints/admin_knowledge.py`。
- 导入脚本：`backend/scripts/import_exercise_actions.py`、`backend/scripts/import_knowledge.py`、`backend/scripts/import_prescription_templates.py`。
- 种子数据：`backend/data/seed_actions.json`、`backend/data/seed_templates.json`、`backend/data/seed_knowledge.json`。
- 关键规则：导入动作默认 `PENDING_REVIEW`。
- 验证：`app/tests/api/test_admin_actions.py`、`app/tests/api/test_admin_knowledge.py`、`app/tests/scripts/test_import_exercise_actions.py`、`app/tests/scripts/test_import_knowledge.py`、`app/tests/scripts/test_import_prescription_templates.py`、`app/tests/services/test_template_matching.py`、`app/tests/services/test_knowledge_retrieval.py`。

### 6. 分型聚类

- Service：`backend/app/services/clustering_service.py`。
- API：`backend/app/api/v1/endpoints/clusters.py`。
- 训练脚本：`backend/scripts/train_cluster_model.py`。
- 前端：`frontend/src/pages/admin/AdminClustersPage.tsx`、`frontend/src/pages/user/PhenotypePage.tsx`。
- 约束：聚类分型只用于画像和模板匹配，不覆盖 R0/R1/R2/R3 风险等级。
- 验证：`app/tests/api/test_clusters.py`、`app/tests/services/test_clustering.py`、`frontend/src/adminClusters.test.tsx`、`frontend/src/cluster.test.tsx`。

### 7. 处方生成

- 编排器：`backend/app/services/prescription_orchestrator.py`。
- LLM：`backend/app/services/llm_service.py`。
- RAG：`backend/app/services/knowledge_service.py`。
- 安全校验：`backend/app/services/prescription_safety_service.py`。
- API：`backend/app/api/v1/endpoints/prescriptions.py`。
- 前端：`frontend/src/pages/user/PrescriptionPage.tsx`。
- 验证：`app/tests/api/test_prescriptions.py`、`app/tests/services/test_prescription_orchestrator.py`、`app/tests/services/test_llm_schema.py`、`app/tests/services/test_openai_compatible_provider.py`、`app/tests/services/test_prescription_safety.py`。

### 8. 专家审核

- 模型：`backend/app/models/review.py`、`backend/app/models/prescription.py`。
- Service：`backend/app/services/expert_review_service.py`。
- API：`backend/app/api/v1/endpoints/expert_reviews.py`。
- 前端：`frontend/src/pages/expert/ExpertReviewPage.tsx`。
- 覆盖动作：批准、驳回、转介、结构化编辑、版本留存、审计留痕。
- 验证：`app/tests/api/test_expert_reviews.py`、`frontend/src/expertReviews.test.tsx`。

### 9. 反馈调整

- Service：`backend/app/services/feedback_adjustment_service.py`。
- API：`backend/app/api/v1/endpoints/feedback.py`、`backend/app/api/v1/endpoints/health_data.py`。
- 前端：`frontend/src/pages/user/TodayExercisePage.tsx`、`frontend/src/pages/user/PhaseReportPage.tsx`。
- 覆盖规则：运动前确认、RPE、心率、血压/血糖、疼痛、不适、完成率、动态调整、红色预警。
- 验证：`app/tests/api/test_feedback.py`、`app/tests/services/test_feedback_adjustment.py`、`frontend/src/feedback.test.tsx`、`frontend/src/phaseReport.test.tsx`。

### 10. 管理科研

- 管理看板：`backend/app/services/admin_dashboard_service.py`、`backend/app/api/v1/endpoints/admin_dashboard.py`、`frontend/src/pages/admin/AdminDashboardPage.tsx`。
- 审计日志：`backend/app/services/audit_service.py`、`backend/app/api/v1/endpoints/admin_audit.py`、`frontend/src/pages/admin/AdminAuditPage.tsx`。
- 科研导出：`backend/app/services/research_export_service.py`、`backend/app/api/v1/endpoints/research_export.py`、`frontend/src/pages/research/ResearchExportPage.tsx`。
- 验证：`app/tests/api/test_admin_dashboard.py`、`app/tests/api/test_admin_audit.py`、`app/tests/api/test_research_export.py`、`frontend/src/adminDashboard.test.tsx`、`frontend/src/adminAudit.test.tsx`、`frontend/src/researchExport.test.tsx`。

### 11. 报告导出

- Service：`backend/app/services/report_service.py`。
- API：`backend/app/api/v1/endpoints/reports.py`。
- 前端：`frontend/src/pages/user/PrescriptionPage.tsx`、`frontend/src/pages/user/PhaseReportPage.tsx`。
- 覆盖格式：处方 DOCX/PDF、阶段评估 DOCX/PDF。
- 报告内容：用户摘要、风险、命中规则、分型、FITT-VP、注意事项、禁忌、复测周期、专家审核、免责声明。
- 验证：`app/tests/api/test_reports.py`、`frontend/src/prescriptionReport.test.tsx`、`frontend/src/phaseReport.test.tsx`。

### 12. 测试部署

- Docker：`docker-compose.yml`、`docker-compose.prod.yml`、`backend/Dockerfile`、`frontend/Dockerfile`。
- Readiness：`backend/app/core/readiness.py`、`GET /ready`。
- 日志和告警：`backend/app/core/logging.py`、`backend/app/core/exceptions.py`。
- 备份恢复：`scripts/backup_data.sh`、`scripts/restore_data.sh`。
- 上线清单：`docs/10_online_checklist.md`。
- 验证：`app/tests/deployment/*`、完整容器验收命令。

## 最高优先级安全规则证据

1. R3 禁止生成具体训练处方：`backend/app/services/prescription_orchestrator.py`、`backend/app/services/prescription_safety_service.py`、`test_r3_no_training_plan`。
2. R2 可生成 AI 初稿，但必须专家审核后发布：`backend/app/services/prescription_orchestrator.py`、`test_risk_r2_requires_review`、`app/tests/services/test_prescription_orchestrator.py`。
3. R0/R1 可自动发布，但必须经过规则校验：`backend/app/services/prescription_orchestrator.py`、`backend/app/services/prescription_safety_service.py`、`app/tests/services/test_prescription_orchestrator.py`。
4. 大模型输出必须是结构化 JSON，并通过 JSON Schema 校验：`backend/app/services/llm_service.py`、`backend/app/schemas/prescription.py`、`test_llm_output_schema`。
5. 大模型输出后必须经过规则引擎二次安全校验：`backend/app/services/prescription_orchestrator.py`、`backend/app/services/prescription_safety_service.py`、`app/tests/services/test_prescription_safety.py`。
6. 处方必须采用 FITT-VP 结构：`backend/app/schemas/prescription.py`、`backend/data/seed_templates.json`、`test_llm_output_schema`。
7. 专家修改、批准、驳回、转介必须留痕：`backend/app/services/expert_review_service.py`、`backend/app/services/audit_service.py`、`app/tests/api/test_expert_reviews.py`。
8. 处方必须保留版本历史：`backend/app/models/prescription.py`、`PrescriptionVersion`、`app/tests/api/test_expert_reviews.py`。
9. 科研导出必须脱敏：`backend/app/services/research_export_service.py`、`test_research_export_desensitized`。
10. 聚类结果只能辅助模板匹配，不能覆盖风险规则：`backend/app/services/clustering_service.py`、`backend/app/services/prescription_orchestrator.py`、`app/tests/api/test_clusters.py`、`app/tests/services/test_template_matching.py`。

## 最低测试覆盖

- `test_risk_r0`
- `test_risk_r1`
- `test_risk_r2_requires_review`
- `test_risk_r3_chest_pain`
- `test_risk_r3_high_bp`
- `test_risk_r3_pain_score`
- `test_r3_no_training_plan`
- `test_llm_output_schema`
- `test_template_matching`
- `test_expert_approve_prescription`
- `test_feedback_adjustment`
- `test_research_export_desensitized`

## 验收命令证据

已验证的上线命令：

```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_initial_data.py
docker compose exec backend pytest
```

前端验证命令：

```bash
cd frontend
npm run lint
npm run test -- --run
npm run build
```

如部署网络访问 Docker Hub 超时，可通过 `.env` 或命令行覆盖基础镜像：

```bash
PYTHON_BASE_IMAGE=public.ecr.aws/docker/library/python:3.12-slim \
NODE_BASE_IMAGE=public.ecr.aws/docker/library/node:22-alpine \
NGINX_BASE_IMAGE=public.ecr.aws/docker/library/nginx:1.27-alpine \
docker compose up -d --build
```
