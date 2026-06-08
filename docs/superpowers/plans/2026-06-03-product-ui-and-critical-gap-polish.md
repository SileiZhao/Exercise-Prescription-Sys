# AI 运动处方平台产品 UI 与关键缺口打磨计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 执行此计划；行为变更使用 superpowers:test-driven-development；完成前使用 superpowers:verification-before-completion。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 将现有 AI 个性化运动处方平台打磨到无严重简化、无严重安全缺陷、前端达到产品级可上线试运行标准。

**架构：** 沿用 FastAPI + SQLAlchemy/Alembic + React 18 + Vite + Ant Design 5 + TanStack Query 的现有架构，优先收紧安全门禁、消除误导性算法与导出占位、补齐 RAG 索引可见失败，再以共享组件和真实 API 页面完成四端产品级体验。明确保留冷启动规则校准模型的试运行定位，不伪装为真实样本科研结论。

**技术栈：** FastAPI、SQLAlchemy、Pydantic、Pytest、scikit-learn、Pandas/OpenPyXL、React 18、TypeScript、Vite、Ant Design 5、TanStack Query、React Router、ECharts、Vitest、Testing Library。

---

## 0. 范围边界

- [x] 确认本轮不把 `ERROR_ALERT_WEBHOOK_URL`、真实聚类训练样本、复测数据采集规范、生产告警接收渠道、生产域名/HTTPS、真实大模型质量验收样本、设备接口、试点资料、报告模板管理、成果交付物作为阻断项。
- [x] 全程不读取或输出 `.env` 中的密钥，不提交 secret。
- [x] 所有页面不得用静态假页面替代真实业务 API；测试 mock 仅用于测试。

## 1. 必读资料与资料库对照

- [x] 阅读 `docs/基于聚类算法与大模型的个性化运动处方智能生成与示范应用平台开发方案.md`。
- [x] 阅读 `docs/AI 个性化运动处方平台产品级开发计划.md`。
- [x] 读取 `docs/基于聚类算法与大模型的个性化运动处方智能生成与示范应用平台总体建设方案.docx`。
- [x] 读取 `docs/AI运动处方平台风险分级与处方生成规则表.docx`。
- [x] 读取 `docs/AI运动处方平台六类数据采集标准格式.docx`。
- [x] 阅读 `docs/superpowers/plans/2026-06-01-complete-launch-implementation.md`。
- [x] 阅读 `docs/superpowers/plans/2026-06-02-production-rag-llm-ocr-hardening.md`。
- [x] 阅读 `docs/superpowers/plans/2026-06-03-production-readiness-gap-closure.md`。
- [x] 阅读 `docs/10_online_checklist.md`。
- [x] 阅读 `docs/12_acceptance_evidence.md`。
- [x] 对照 `docs/` 与 `rag_data/` 下风险规则库、动作库、处方模板库、知识库、合规资料说明。

## 2. 基线验证

- [x] 运行并记录：`cd backend && ENVIRONMENT=test LLM_PROVIDER=mock EMBEDDING_PROVIDER=hash OCR_ENABLED=false python -m pytest`。
- [x] 运行并记录：`cd frontend && npm run lint`。
- [x] 运行并记录：`cd frontend && npm run test -- --run`。
- [x] 运行并记录：`cd frontend && npm run build`。
- [x] 运行并记录：`cd backend && python scripts/validate_reference_data.py --strict --json`。

## 3. 用户今日运动与反馈执行门禁

- [x] 前端失败测试：`/user/today` 不得从非 `PUBLISHED` 或 R3 处方回退展示训练计划，不得允许提交打卡。
- [x] 后端失败测试：创建反馈时若 `prescription_id` 对应处方不存在、非本人、非 `PUBLISHED`、R3、无 `fitt_vp`、或状态为 `SUPERSEDED` / `PENDING_REVIEW` / `REFERRED` / `NEEDS_INFO` / `PAUSED` / `REJECTED`，返回 403 或 409 且错误清晰。
- [x] 实现今日运动只使用 `PUBLISHED` 且非 R3 的可执行处方；无处方时仅显示安全状态与建档/查看处方入口。
- [x] 实现后端反馈创建执行门禁并补充审计友好错误。
- [x] 运行后端反馈/处方测试与前端今日运动/反馈测试。

## 4. 聚类算法真实性、预测策略与冷启动表达

- [x] 失败测试：`cluster_stability` 不再使用 `max(0.70, ...)` 或等价保底。
- [x] 失败测试：KMeans 使用最近中心预测。
- [x] 失败测试：GaussianMixture 保存并使用 `means`、`covariances`、`precisions`、`weights` 的高斯对数似然预测。
- [x] 失败测试：AgglomerativeClustering 标记 `predict_strategy=centroid_projection`，API/UI 展示“层次聚类投影分类”。
- [x] 失败测试：DBSCAN 标记密度近似预测，超过 `eps` 返回 noise/未归类，API/UI 展示“不确定/需专家解释”。
- [x] 实现 KMeans/GMM 多次扰动或重复训练中心/标签稳定性，DBSCAN 噪声率与扰动簇保留率，Agglomerative 中心投影稳定性。
- [x] API、UI、文档明确 `bootstrap_rule_calibrated` 为冷启动规则校准模型，仅用于试运行人群画像和模板匹配，不作为正式科研聚类结论。
- [x] 运行后端聚类服务/API 测试与前端聚类测试。

## 5. 科研导出真实阶段变化与脱敏

- [x] 失败测试：科研导出不再输出 `需阶段复评后计算` 等占位字段。
- [x] 失败测试：同一用户最早和最新 `UserProfile` 的 `weight_kg`、`bmi`、`waist_cm` 可计算真实差值；仅单条记录时输出 structured null 与 `null_reason`。
- [x] 失败测试：最早和最新 `FitnessTest` 的 `sbp/dbp`，`BodyComposition` 的 `body_fat_pct/skeletal_muscle_kg`，`BiochemicalIndex` 的 `fbg/tc/tg/hdl_c/ldl_c` 真实计算或 structured null。
- [x] 失败测试：CSV/XLSX/JSON 导出不含姓名、邮箱、手机号、身份证等直接身份信息。
- [x] 实现阶段变化 JSON 字段或拆分列，并保持导出 schema 稳定。
- [x] 运行科研导出测试。

## 6. RAG 索引失败可见化与 strict 校验

- [x] 失败测试：`KnowledgeIngestionService._index_document_safely` 捕获异常时写 structured log 或 audit log。
- [x] 失败测试：索引失败写入 `KnowledgeDocument.status` 或 `skipped_reason/index_error` 可见字段。
- [x] 失败测试：管理端知识库页面显示失败原因。
- [x] 失败测试：strict 校验能发现 `ACTIVE` 但未索引且无失败原因的异常状态。
- [x] 实现索引失败状态持久化、管理端展示与 strict 校验。
- [x] 运行知识库导入、管理端知识库与资料校验测试。

## 7. 风险规则、模板、动作资料确认状态展示

- [x] 失败测试：导入后管理端详情以 `review_status` 展示“本平台状态：专家已确认”或“已批准”，不展示会造成上线歧义的草案状态。
- [x] 保留原始 source 文本用于追溯，不修改原始 docs 内容。
- [x] 风险规则库、处方模板库、动作库 API/UI 以平台状态为准。
- [x] 运行管理端规则/模板/动作测试。

## 8. 前端产品级路由与共享组件体系

- [x] 实现并实际使用 `AppShell`。
- [x] 实现并实际使用 `RoleSidebar`。
- [x] 实现并实际使用 `PageHeader`。
- [x] 实现并实际使用 `MetricCard`。
- [x] 实现并实际使用 `RiskBadge`。
- [x] 实现并实际使用 `MotionCard`。
- [x] 实现并实际使用 `AnimatedNumber`。
- [x] 实现并实际使用 `FlowProgress`。
- [x] 实现并实际使用 `HealthDataWizard`。
- [x] 实现并实际使用 `UnitInput`。
- [x] 实现并实际使用 `RpeSlider`。
- [x] 实现并实际使用 `PainScale`。
- [x] 实现并实际使用 `FITTVPCard`。
- [x] 实现并实际使用 `ExerciseTaskCard`。
- [x] 实现并实际使用 `ContraindicationList`。
- [x] 实现并实际使用 `ReviewWorkbench`。
- [x] 实现并实际使用 `PrescriptionEditor`。
- [x] 实现并实际使用 `RuleHitCard`。
- [x] 实现并实际使用 `EvidenceCard`。
- [x] 实现并实际使用 `AuditTrail`。
- [x] 实现并实际使用 `ChartCard`。
- [x] 实现并实际使用 `EmptyState`。
- [x] 公共路由可访问：`/login`、`/register`。
- [x] 用户端路由可访问：`/user/dashboard`、`/user/profile`、`/user/health-data`、`/user/risk-result`、`/user/prescriptions`、`/user/prescriptions/:id`、`/user/today`、`/user/feedback`、`/user/follow-up-report`。
- [x] 专家端路由可访问：`/expert/dashboard`、`/expert/reviews`、`/expert/reviews/:id`。
- [x] 管理端路由可访问：`/admin/dashboard`、`/admin/users`、`/admin/rules`、`/admin/templates`、`/admin/exercises`、`/admin/knowledge`、`/admin/clustering`、`/admin/research-export`、`/admin/audit-logs`。
- [x] 科研端路由可访问：`/research/dashboard`、`/research/cluster-analysis`、`/research/intervention-effects`、`/research/export-jobs`。
- [x] 如新增依赖，更新 `frontend/package.json` 与 lockfile。

## 9. 用户端产品级体验

- [x] `/user/health-data` 使用 Stepper 完成知情同意、基础信息、体质测试、身体成分、生化指标、疾病与运动风险问卷、提交评估。
- [x] 表单卡片化、带单位输入、校验、草稿保存到 localStorage 或持久状态。
- [x] 提交后显示风险评估流程动画：校验数据、执行风险规则、生成人群画像、匹配处方路径、完成评估。
- [x] `/user/risk-result` 按 R0/R1/R2/R3 显示不同安全边界；R2 仅专家审核中；R3 仅医学评估建议。
- [x] `/user/prescriptions/:id` 使用 FITT-VP 卡片展示频率、强度、时间、类型、总量、进阶、注意事项、禁忌动作、复测周期。
- [x] R3 不展示训练动作、强度、组数、进阶计划。
- [x] `/user/today` 展示任务、动作说明、时长、强度、注意事项和打卡按钮；R2 未审核与 R3 不显示开始训练按钮。
- [x] `/user/feedback` 支持完成度、RPE、心率、疼痛评分、不适反应、血压血糖可选填写；胸痛、晕厥、严重气短立即红色安全提醒。

## 10. 专家端产品级体验

- [x] `/expert/reviews` 支持风险等级、状态、机构、时间筛选，高风险和 R2 任务优先突出。
- [x] `/expert/reviews/:id` 三栏工作台：左侧用户画像和健康数据，中间 AI 处方与 FITT-VP 编辑器，右侧规则命中、禁忌动作、RAG 证据、审核意见和操作按钮。
- [x] 支持开始审核、批准发布、修改后发布、驳回重生成、要求补充数据、建议医学评估/转介。
- [x] 批准前弹窗确认“已核对风险规则、禁忌动作和处方强度”。
- [x] R3 不允许发布训练处方，所有操作留痕。

## 11. 管理端与科研端产品级体验

- [x] `/admin/dashboard` 展示用户总数、新增趋势、风险分布、处方生成/发布、专家审核、R2 平均审核时长、R3 转介、完成率、规则命中排行、模板使用量。
- [x] 规则库、模板库、动作库、知识库页面采用列表、筛选、详情抽屉、编辑、版本历史、启用/停用、审计日志。
- [x] 聚类页面展示算法、来源、真实稳定性、预测策略、阈值与冷启动说明。
- [x] 科研端展示脱敏导出、分型分析、干预效果分析与导出任务状态。

## 12. 视觉、可访问与安全边界

- [x] 视觉风格为简约医疗科技 SaaS：浅灰蓝背景、大面积留白、8px 左右圆角、细边框、低饱和主色、风险色清晰。
- [x] 登录后直接进入工作台，不做营销 landing。
- [x] 图表克制清晰，页面文本不互相遮挡，移动端与桌面端布局稳定。
- [x] UI 明确 R0/R1/R2/R3 安全边界，训练入口必须遵守后端执行门禁。

## 13. 完整验证、文档与提交

- [x] 运行完整后端测试：`cd backend && ENVIRONMENT=test LLM_PROVIDER=mock EMBEDDING_PROVIDER=hash OCR_ENABLED=false python -m pytest`。
- [x] 运行完整前端 lint：`cd frontend && npm run lint`。
- [x] 运行完整前端测试：`cd frontend && npm run test -- --run`。
- [x] 运行完整前端构建：`cd frontend && npm run build`。
- [x] 运行 strict 资料校验：`cd backend && python scripts/validate_reference_data.py --strict --json`。
- [x] 必要时执行远端或容器验收，并记录真实结果。
- [x] 更新 `docs/10_online_checklist.md` 与 `docs/12_acceptance_evidence.md`。
- [x] 提交本轮变更。
- [x] 当前证据证明所有显式需求均完成后，调用 `update_goal(status="complete")`。

## 14. 本轮验收证据

- 后端完整测试：`ENVIRONMENT=test LLM_PROVIDER=mock EMBEDDING_PROVIDER=hash OCR_ENABLED=false python -m pytest`，195/195 passed，1 个 joblib CPU 探测 warning。
- 前端 lint：`npm run lint`，exit 0。
- 前端测试：`npm run test -- --run`，17 个测试文件、54/54 passed。
- 前端构建：`npm run build`，exit 0；仅 Vite chunk size warning。
- 资料校验：`python scripts/validate_reference_data.py --strict --json`，风险规则 80、动作 98、模板 16、合规材料 8、知识来源 40、RAG allowlist 57，`blocking_errors=[]`。
- 浏览器烟测：本地 Vite `http://127.0.0.1:5173/`、`/login`、`/register` 均可渲染且无 console error；受保护业务页由 Vitest 页面/路由测试与构建覆盖。
- 本轮未新增远端/容器验收；既有远端生产同等环境证据保留在 `docs/10_online_checklist.md` 与 `docs/12_acceptance_evidence.md`。
