# AI 运动处方平台上线补齐实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在已提供 `docs/` 风险规则表、动作库、处方模板库和 `rag_data/` RAG 资料的前提下，补齐第一版产品级闭环，使项目达到可上线试运行标准。

**架构：** 保持当前 FastAPI + React/Vite + PostgreSQL + Qdrant + Docker Compose 架构，不重写工程骨架。重点把现有“可运行骨架”升级为“资料驱动的真实业务系统”：正式规则进入运行时、动作/模板/知识资料完整入库、处方生成使用专家库和 RAG 证据、专家端可编辑审核、验收脚本可证明闭环可用。

**技术栈：** FastAPI、SQLAlchemy、Alembic、Pydantic、PostgreSQL、Qdrant、React、Ant Design、Vitest、Pytest、Docker Compose。

---

## 范围边界

本计划纳入：
- 风险规则表完整导入与运行时执行。
- 动作库完整字段、审核状态、禁忌规则、处方候选筛选。
- 处方模板库导入、版本化、模板匹配和 R3 安全模板。
- `rag_data/` allowlist 和 `docs/knowledge_source_catalog_v0_2.json` 资料入库、切片、来源、重建索引和检索证据。
- 大模型生产配置路径、非 mock 上线检查、LLM 输入输出审计。
- 专家审核工作台结构化编辑。
- 用户端、管理端、科研端、报告导出闭环验收。

本计划暂不纳入：
- 设备接口 `/device-integrations/*`。
- 试点资料 `/pilot-materials/*`。
- 报告模板管理 `/report-templates/*`。
- 成果交付物 `/deliverables/*`。

这些 501 入口保留，但不作为本次上线阻断项。

## 目标文件结构

### 后端模型与迁移
- 修改：`backend/app/models/risk.py`：补充规则优先级、规则类型、来源、适用人群、版本说明。
- 修改：`backend/app/models/template.py`：扩展动作库字段、知识库来源可信度、切片来源元数据。
- 创建：`backend/alembic/versions/0012_launch_content_metadata.py`：规则、动作、知识元数据扩展迁移。
- 修改：`backend/app/schemas/admin_rules.py`：规则 DSL 入参/出参扩展。
- 修改：`backend/app/schemas/template.py`：动作库完整字段 Schema。
- 修改：`backend/app/schemas/knowledge.py`：RAG 来源、页码、章节、可信等级、导入批次 Schema。

### 后端服务
- 修改：`backend/app/services/risk_engine.py`：扩展操作符、优先级、规则类型、冲突解释。
- 修改：`backend/app/services/admin_rule_service.py`：运行时规则排序、导入规则校验、停用/启用审计。
- 修改：`backend/app/services/template_service.py`：动作筛选、模板匹配、动作禁忌匹配。
- 修改：`backend/app/services/prescription_orchestrator.py`：把风险规则、动作候选、RAG 证据、模板来源完整传给 LLM。
- 修改：`backend/app/services/prescription_safety_service.py`：增加 R0/R1/R2 的强度、禁忌、动作候选二次校验。
- 修改：`backend/app/services/knowledge_service.py`：导入批次、页码/章节、来源可信度、检索审计。
- 修改：`backend/app/services/expert_review_service.py`：支持结构化编辑、审核详情完整化、审核前安全校验。
- 修改：`backend/app/services/report_service.py`：报告引用正式规则、模板、证据和专家修改记录。

### 导入脚本与数据校验
- 修改：`backend/scripts/import_risk_rules.py`：从 `docs/ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json` 导入正式规则。
- 修改：`backend/scripts/import_exercise_actions.py`：从 `docs/ai_exercise_action_library_v0_1_expert_review_draft.json` 导入完整动作字段。
- 修改：`backend/scripts/import_prescription_templates.py`：从 `docs/ai_exercise_prescription_template_library_v0_1_expert_review_draft.json` 导入模板。
- 修改：`backend/scripts/import_rag_data.py`：从 `rag_data/_manifests/rag_ingest_allowlist.txt` 和 `docs/knowledge_source_catalog_v0_2.json` 入库 RAG。
- 修改：`backend/scripts/seed_reference_data.py`：串联规则、动作、模板、合规、RAG 的幂等导入。
- 创建：`backend/scripts/validate_reference_data.py`：上线前资料覆盖率与缺口报告。

### API
- 修改：`backend/app/api/v1/endpoints/admin_rules.py`：规则导入状态、规则测试、规则来源展示。
- 修改：`backend/app/api/v1/endpoints/admin_templates.py`：动作库完整字段展示和审核。
- 修改：`backend/app/api/v1/endpoints/admin_knowledge.py`：RAG 导入批次、重建索引、检索证据验证。
- 修改：`backend/app/api/v1/endpoints/expert_reviews.py`：专家详情页保存编辑内容。
- 修改：`backend/app/api/v1/endpoints/prescriptions.py`：生成前资料完整性检查和生产 LLM 检查。
- 修改：`backend/app/api/v1/endpoints/reports.py`：报告导出审计包含证据引用。

### 前端
- 修改：`frontend/src/pages/admin/AdminRulesPage.tsx`：正式规则库字段、来源、优先级、测试快照。
- 修改：`frontend/src/pages/admin/AdminTemplatePage.tsx`：动作库、模板库、知识库完整字段和导入状态。
- 修改：`frontend/src/pages/expert/ExpertReviewPage.tsx`：三栏审核工作台、结构化处方编辑、证据/动作/规则完整展示。
- 修改：`frontend/src/pages/user/PrescriptionPage.tsx`：展示处方来源、审核状态、证据摘要和 R3 边界提示。
- 修改：`frontend/src/pages/user/TodayExercisePage.tsx`：反馈后展示调整原因、是否进入专家复核。
- 修改：`frontend/src/pages/research/ResearchExportPage.tsx`：展示脱敏导出字段说明和导出审计提示。

### 测试与验收
- 修改/创建：`backend/app/tests/scripts/test_import_reference_data.py`
- 修改/创建：`backend/app/tests/scripts/test_validate_reference_data.py`
- 修改：`backend/app/tests/api/test_admin_rules.py`
- 修改：`backend/app/tests/api/test_admin_actions.py`
- 修改：`backend/app/tests/api/test_admin_knowledge.py`
- 修改：`backend/app/tests/api/test_prescriptions.py`
- 修改：`backend/app/tests/api/test_expert_reviews.py`
- 修改：`backend/app/tests/services/test_prescription_orchestrator.py`
- 修改：`backend/app/tests/services/test_prescription_safety.py`
- 修改：`frontend/src/adminRules.test.tsx`
- 修改：`frontend/src/adminTemplates.test.tsx`
- 修改：`frontend/src/expertReviews.test.tsx`
- 修改：`docs/10_online_checklist.md`
- 修改：`docs/12_acceptance_evidence.md`

---

## 任务 1：建立当前资料覆盖率基线

**文件：**
- 创建：`backend/scripts/validate_reference_data.py`
- 创建：`backend/app/tests/scripts/test_validate_reference_data.py`
- 修改：`README.md`

- [x] **步骤 1：编写失败测试**
  - 测试 `validate_reference_data.py` 能读取以下资料并输出 JSON 覆盖率：
    - `docs/ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json`
    - `docs/ai_exercise_action_library_v0_1_expert_review_draft.json`
    - `docs/ai_exercise_prescription_template_library_v0_1_expert_review_draft.json`
    - `docs/ai_exercise_compliance_copy_pack_v0_1_expert_review_draft.json`
    - `rag_data/_manifests/rag_ingest_allowlist.txt`
    - `docs/knowledge_source_catalog_v0_2.json`
  - 断言输出至少包含：`risk_rules_count`、`actions_count`、`templates_count`、`rag_allowlist_count`、`missing_files`、`blocking_errors`。

- [x] **步骤 2：运行测试确认失败**
  - 运行：`cd backend && python -m pytest app/tests/scripts/test_validate_reference_data.py -v`
  - 预期：FAIL，脚本或输出字段不存在。

- [x] **步骤 3：实现资料校验脚本**
  - 脚本支持：
    - 默认从仓库根目录定位 `docs/` 和 `rag_data/`。
    - `--json` 输出机器可读结果。
    - `--strict` 在缺关键资料时返回非 0。
    - 检查 allowlist 中每个文件是否存在。
    - 检查 JSON 文件能解析且顶层数据不为空。

- [x] **步骤 4：运行测试确认通过**
  - 运行：`cd backend && python -m pytest app/tests/scripts/test_validate_reference_data.py -v`
  - 预期：PASS。

- [x] **步骤 5：记录基线命令**
  - 在 `README.md` 的参考资料导入章节加入：
    - `PYTHONPATH=. python scripts/validate_reference_data.py --json`
    - `PYTHONPATH=. python scripts/validate_reference_data.py --strict`

- [x] **步骤 6：Commit**
  - `git add backend/scripts/validate_reference_data.py backend/app/tests/scripts/test_validate_reference_data.py README.md`
  - `git commit -m "chore: add reference data validation baseline"`

---

## 任务 2：扩展风险规则 DSL 并完整导入规则表

**文件：**
- 修改：`backend/app/models/risk.py`
- 修改：`backend/app/schemas/admin_rules.py`
- 修改：`backend/app/services/risk_engine.py`
- 修改：`backend/app/services/admin_rule_service.py`
- 修改：`backend/scripts/import_risk_rules.py`
- 修改：`backend/app/tests/api/test_admin_rules.py`
- 修改：`backend/app/tests/scripts/test_import_reference_data.py`
- 创建：`backend/alembic/versions/0012_launch_content_metadata.py`

- [x] **步骤 1：编写失败测试**
  - 覆盖这些规则行为：
    - 胸痛、晕厥、严重气短、SBP >= 180、DBP >= 110、疼痛 >= 7、医生明确限制、急性损伤 -> R3。
    - 高血压、糖尿病/糖代谢异常、血脂异常、骨质疏松、老年平衡差、疼痛 4-6、用药影响 -> R2 或按规则表目标等级。
    - BMI >= 28、体脂/腰围/久坐 -> R1 或 R2，按规则表配置执行。
    - R0 配置项不作为“命中规则”覆盖默认 R0。
  - API 测试断言管理端能看到 `priority`、`rule_type`、`source_ref`、`version`。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/api/test_admin_rules.py app/tests/scripts/test_import_reference_data.py -v`

- [x] **步骤 3：迁移规则模型**
  - `RiskRuleConfig` 增加：
    - `priority: int`
    - `rule_type: str`
    - `source_ref: str | None`
    - `applies_to: list[str]`
    - `review_status: str`
  - Alembic 迁移默认：
    - `priority=100`
    - `rule_type="RISK_LEVEL"`
    - `applies_to=[]`
    - `review_status="EXPERT_REVIEW_DRAFT"`

- [x] **步骤 4：扩展 DSL 操作符**
  - 在 `risk_engine.py` 支持：
    - `eq`、`neq`
    - `gt`、`gte`、`lt`、`lte`
    - `between`
    - `in_any`
    - `contains`
    - `not_empty_restriction`
    - `exists`
  - 不实现复杂嵌套表达式，避免重写引擎；多条件规则由导入脚本拆成多条原子规则。

- [x] **步骤 5：实现导入脚本**
  - 从 JSON 读取规则。
  - R0/绿色默认说明类规则不导入为命中规则。
  - 每条规则写入 `RiskRuleConfig`，同 code 幂等更新并增加版本。
  - 缺少 code 的规则用稳定 code 生成：`DOC_<severity>_<slug>_<index>`。
  - 导入后输出：导入数、跳过 R0 数、停用旧规则数、错误数。

- [x] **步骤 6：运行导入和测试**
  - `cd backend && PYTHONPATH=. python scripts/import_risk_rules.py ../docs/ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json`
  - `cd backend && python -m pytest app/tests/api/test_admin_rules.py app/tests/api/test_risk.py app/tests/scripts/test_import_reference_data.py -v`

- [x] **步骤 7：Commit**
  - `git add backend/app/models/risk.py backend/app/schemas/admin_rules.py backend/app/services/risk_engine.py backend/app/services/admin_rule_service.py backend/scripts/import_risk_rules.py backend/alembic/versions/0012_launch_content_metadata.py backend/app/tests`
  - `git commit -m "feat: import and execute full risk rule library"`

---

## 任务 3：扩展动作库字段并导入正式动作库

**文件：**
- 修改：`backend/app/models/template.py`
- 修改：`backend/app/schemas/template.py`
- 修改：`backend/app/services/template_service.py`
- 修改：`backend/scripts/import_exercise_actions.py`
- 修改：`backend/app/tests/api/test_admin_actions.py`
- 修改：`backend/app/tests/scripts/test_import_exercise_actions.py`
- 修改：`frontend/src/pages/admin/AdminTemplatePage.tsx`
- 修改：`frontend/src/adminTemplates.test.tsx`

- [x] **步骤 1：编写失败测试**
  - 导入动作库 JSON 后，断言包含：
    - `source`
    - `source_exercise_id`
    - `name`
    - `name_en`
    - `exercise_type`
    - `image_url`
    - `joint_stress_level`
    - `impact_level`
    - `requires_equipment`
    - `is_traditional_exercise`
    - `suitable_tags`
    - `contraindication_tags`
    - `stop_signals`
    - `evidence_refs`
  - 断言新导入动作默认 `PENDING_REVIEW`。
  - 断言专家/管理员批准后才进入处方候选。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/api/test_admin_actions.py app/tests/scripts/test_import_exercise_actions.py -v`

- [x] **步骤 3：迁移动作模型**
  - `ExerciseAction` 增加缺失字段，保留现有字段以兼容前端。
  - `name` 继续作为中文主名称；`name_en` 可空。
  - `risk_level` 支持单值或 `/` 分隔多等级，现有候选筛选逻辑继续可用。

- [x] **步骤 4：实现动作导入映射**
  - 读取 `docs/ai_exercise_action_library_v0_1_expert_review_draft.json`。
  - 对太极拳、八段锦、五禽戏、易筋经、健身气功标记 `is_traditional_exercise=true`。
  - 对跳跃、长跑、深蹲、大重量、快速变向等动作写入 `contraindication_tags`。
  - 对快走、功率车、椭圆机、低冲击操、坐站训练、弹力带训练、关节活动度训练、平衡训练保持低冲击标签。

- [x] **步骤 5：前端补齐动作字段展示**
  - 管理端动作库表格展示风险等级、冲击等级、关节压力、传统功法、审核状态。
  - 动作详情或展开行展示适宜人群、禁忌人群、停止信号、证据引用。

- [x] **步骤 6：运行测试**
  - `cd backend && python -m pytest app/tests/api/test_admin_actions.py app/tests/scripts/test_import_exercise_actions.py -v`
  - `cd frontend && npm run test -- --run src/adminTemplates.test.tsx`

- [x] **步骤 7：Commit**
  - `git add backend/app/models/template.py backend/app/schemas/template.py backend/app/services/template_service.py backend/scripts/import_exercise_actions.py backend/app/tests frontend/src/pages/admin/AdminTemplatePage.tsx frontend/src/adminTemplates.test.tsx`
  - `git commit -m "feat: import reviewed exercise action library"`

---

## 任务 4：导入处方模板库并强化模板匹配

**文件：**
- 修改：`backend/app/models/template.py`
- 修改：`backend/app/schemas/template.py`
- 修改：`backend/app/services/template_service.py`
- 修改：`backend/scripts/import_prescription_templates.py`
- 修改：`backend/app/tests/scripts/test_import_prescription_templates.py`
- 修改：`backend/app/tests/services/test_template_matching.py`
- 修改：`frontend/src/pages/admin/AdminTemplatePage.tsx`

- [x] **步骤 1：编写失败测试**
  - 导入模板库后断言：
    - R0/R1/R2 模板具有完整 FITT-VP。
    - R3 模板 `fitt_vp is None`，只含安全提醒和转介建议。
    - 模板有 `risk_level`、`cluster_tags`、`goal_tags`、`precautions`、`contraindications`、`evidence_refs`、`version`、`status`。
    - R2 匹配模板后处方状态仍是 `PENDING_REVIEW`。
    - 模板匹配按风险等级优先，再按分型标签和目标打分。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/scripts/test_import_prescription_templates.py app/tests/services/test_template_matching.py -v`

- [x] **步骤 3：实现模板导入**
  - 从 `docs/ai_exercise_prescription_template_library_v0_1_expert_review_draft.json` 读取。
  - 已审核专家草案导入为 `APPROVED` 或 `DRAFT_PENDING_EXPERT_REVIEW` 按文件字段决定；如果文件没有状态，第一版设为 `APPROVED`，同时保留 `review_status="EXPERT_REVIEW_DRAFT"`。
  - R3 模板导入为无训练计划模板。

- [x] **步骤 4：强化模板匹配**
  - R3 不走普通模板匹配。
  - R2 必须匹配 R2 模板或使用 R2 谨慎兜底模板。
  - 没有模板时记录审计事件 `PRESCRIPTION_TEMPLATE_FALLBACK_USED`。

- [x] **步骤 5：前端模板库展示**
  - 模板列表展示风险等级、分型标签、目标标签、版本、状态。
  - 模板详情展示 FITT-VP JSON、注意事项、禁忌、证据引用。

- [x] **步骤 6：运行测试**
  - `cd backend && python -m pytest app/tests/scripts/test_import_prescription_templates.py app/tests/services/test_template_matching.py app/tests/services/test_prescription_orchestrator.py -v`
  - `cd frontend && npm run test -- --run src/adminTemplates.test.tsx`

- [x] **步骤 7：Commit**
  - `git add backend/app/models/template.py backend/app/schemas/template.py backend/app/services/template_service.py backend/scripts/import_prescription_templates.py backend/app/tests frontend/src/pages/admin/AdminTemplatePage.tsx`
  - `git commit -m "feat: import prescription template library"`

---

## 任务 5：RAG 资料入库、索引和证据来源完整化

**文件：**
- 修改：`backend/app/models/template.py`
- 修改：`backend/app/schemas/knowledge.py`
- 修改：`backend/app/services/knowledge_service.py`
- 修改：`backend/scripts/import_rag_data.py`
- 修改：`backend/scripts/seed_reference_data.py`
- 修改：`backend/app/tests/api/test_admin_knowledge.py`
- 修改：`backend/app/tests/scripts/test_import_rag_data.py`
- 修改：`backend/app/tests/services/test_knowledge_retrieval.py`
- 修改：`frontend/src/pages/admin/AdminTemplatePage.tsx`

- [x] **步骤 1：编写失败测试**
  - 导入 allowlist 后断言：
    - 每个 allowlist 文件对应 `KnowledgeDocument` 或明确记录 skipped reason。
    - `KnowledgeChunk` 具有 `source_section`、`page_start/page_end` 或可解释的空值。
    - 检索结果返回 `document_title`、`source_type`、`version`、`section`、`page_start/page_end`。
    - Qdrant 不可用时回退关键词检索。
    - 重建索引接口返回 `indexed/skipped`。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/api/test_admin_knowledge.py app/tests/scripts/test_import_rag_data.py app/tests/services/test_knowledge_retrieval.py -v`

- [x] **步骤 3：实现 RAG 导入增强**
  - 从 `rag_data/_manifests/rag_ingest_allowlist.txt` 读取文件路径。
  - 从 `docs/knowledge_source_catalog_v0_2.json` 合并来源元数据。
  - 支持 `.md`、`.txt`、`.json`、`.pdf`。
  - PDF 文本可解析时记录页码；无法解析时记录 `skipped_reason`，不静默成功。
  - 每次导入生成 `import_batch_id`。

- [x] **步骤 4：增强检索审计**
  - 处方生成时记录 `RAG_RETRIEVE_EVIDENCE` 审计，包含 query、tags、hit_count、chunk_ids。
  - 专家端可看到证据来源标题、章节、页码、内容摘要。

- [x] **步骤 5：前端知识库管理增强**
  - 知识库列表展示来源类型、版本、年份、切片数、状态。
  - 检索验证展示命中分数、章节、页码、内容片段。

- [x] **步骤 6：运行测试**
  - `cd backend && python -m pytest app/tests/api/test_admin_knowledge.py app/tests/scripts/test_import_rag_data.py app/tests/services/test_knowledge_retrieval.py -v`
  - `cd frontend && npm run test -- --run src/adminTemplates.test.tsx`

- [x] **步骤 7：Commit**
  - `git add backend/app/models/template.py backend/app/schemas/knowledge.py backend/app/services/knowledge_service.py backend/scripts/import_rag_data.py backend/scripts/seed_reference_data.py backend/app/tests frontend/src/pages/admin/AdminTemplatePage.tsx`
  - `git commit -m "feat: ingest rag sources with evidence metadata"`

---

## 任务 6：处方生成安全校验升级到“资料驱动”

**文件：**
- 修改：`backend/app/services/prescription_orchestrator.py`
- 修改：`backend/app/services/prescription_safety_service.py`
- 修改：`backend/app/schemas/prescription.py`
- 修改：`backend/app/tests/services/test_prescription_orchestrator.py`
- 修改：`backend/app/tests/services/test_prescription_safety.py`
- 修改：`backend/app/tests/api/test_prescriptions.py`

- [x] **步骤 1：编写失败测试**
  - R0/R1 处方必须有 FITT-VP、证据引用、模板来源。
  - R2 处方必须 `PENDING_REVIEW`，且 `expert_review_required=true`。
  - R3 处方必须 `REFERRED`，且 `fitt_vp is None`。
  - LLM 返回包含禁忌动作时，安全校验删除或阻断。
  - 候选动作为空时，生成审计警告但不崩溃；处方只能使用模板安全动作。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/services/test_prescription_orchestrator.py app/tests/services/test_prescription_safety.py app/tests/api/test_prescriptions.py -v`

- [x] **步骤 3：补全 LLM 输入**
  - `llm_payload` 包含：
    - 完整风险结果。
    - 分型标签和聚类摘要。
    - 模板 id、版本、FITT-VP。
    - 已审核动作候选完整字段。
    - RAG 证据片段和来源。
    - 明确 forbidden constraints。

- [x] **步骤 4：补全安全校验**
  - R2 禁止高强度/HIIT/冲刺/大重量/憋气。
  - 疼痛标签命中时禁止跳跃、长跑、深蹲大负荷、快速扭转。
  - 高血压命中时禁止憋气和大重量抗阻。
  - 糖尿病/降糖药命中时必须出现血糖监测提示。
  - R3 强制清空训练动作、强度、组数、时长、进阶计划。

- [x] **步骤 5：生产 LLM 检查**
  - 在生成接口中增加 readiness 风险提示：
    - 开发环境允许 `LLM_PROVIDER=mock`。
    - 生产环境 `ENVIRONMENT=production` 时，如果 `LLM_PROVIDER=mock`，处方生成返回 503，并提示配置生产 LLM。

- [x] **步骤 6：运行测试**
  - `cd backend && python -m pytest app/tests/services/test_prescription_orchestrator.py app/tests/services/test_prescription_safety.py app/tests/api/test_prescriptions.py app/tests/services/test_openai_compatible_provider.py -v`

- [x] **步骤 7：Commit**
  - `git add backend/app/services/prescription_orchestrator.py backend/app/services/prescription_safety_service.py backend/app/schemas/prescription.py backend/app/tests`
  - `git commit -m "feat: enforce data-driven prescription safety"`

---

## 任务 7：专家审核工作台实现结构化编辑

**文件：**
- 修改：`backend/app/services/expert_review_service.py`
- 修改：`backend/app/schemas/review.py`
- 修改：`backend/app/api/v1/endpoints/expert_reviews.py`
- 修改：`backend/app/tests/api/test_expert_reviews.py`
- 修改：`frontend/src/pages/expert/ExpertReviewPage.tsx`
- 修改：`frontend/src/api/expertReviews.ts`
- 修改：`frontend/src/expertReviews.test.tsx`

- [x] **步骤 1：编写失败测试**
  - 专家提交 `edited_prescription.fitt_vp` 后，批准发布的处方保存专家修改。
  - 专家不能把 R3 转介处方批准为训练处方。
  - 专家修改会写入 `PrescriptionVersion`，`change_reason=EXPERT_APPROVE`。
  - 前端点击批准时提交真实编辑内容，不再提交 `{}`。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/api/test_expert_reviews.py -v`
  - `cd frontend && npm run test -- --run src/expertReviews.test.tsx`

- [x] **步骤 3：后端编辑校验**
  - `ExpertReviewAction` 允许编辑：
    - `fitt_vp`
    - `precautions`
    - `contraindications`
    - `reassessment`
    - `safety_notice`
  - 保存前调用 `enforce_prescription_safety(record.risk_level, edited_payload)`。

- [x] **步骤 4：前端三栏工作台**
  - 左栏：用户画像、六类数据、风险等级。
  - 中栏：FITT-VP 结构化编辑表单。
  - 右栏：命中规则、禁忌动作、RAG 证据、审核意见。
  - 审核按钮：
    - 批准：提交编辑后的处方。
    - 驳回：必须填写意见。
    - 转介：必须填写转介原因。

- [x] **步骤 5：运行测试**
  - `cd backend && python -m pytest app/tests/api/test_expert_reviews.py -v`
  - `cd frontend && npm run test -- --run src/expertReviews.test.tsx`

- [x] **步骤 6：Commit**
  - `git add backend/app/services/expert_review_service.py backend/app/schemas/review.py backend/app/api/v1/endpoints/expert_reviews.py backend/app/tests/api/test_expert_reviews.py frontend/src/pages/expert/ExpertReviewPage.tsx frontend/src/api/expertReviews.ts frontend/src/expertReviews.test.tsx`
  - `git commit -m "feat: add structured expert prescription editing"`

---

## 任务 8：管理端资料导入与上线状态可视化

**文件：**
- 修改：`backend/app/api/v1/endpoints/admin_dashboard.py`
- 修改：`backend/app/services/admin_dashboard_service.py`
- 修改：`backend/app/schemas/admin_dashboard.py`
- 修改：`frontend/src/pages/admin/AdminDashboardPage.tsx`
- 修改：`frontend/src/adminDashboard.test.tsx`

- [x] **步骤 1：编写失败测试**
  - 管理看板返回：
    - 风险规则总数/启用数。
    - 已审核动作数/待审核动作数。
    - 模板总数/启用模板数。
    - 知识文档数/切片数/已索引切片数。
    - LLM provider 当前值和是否生产可用。
  - 前端展示“上线资料状态”区域。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/api/test_admin_dashboard.py -v`
  - `cd frontend && npm run test -- --run src/adminDashboard.test.tsx`

- [x] **步骤 3：实现后端统计**
  - 在 `AdminDashboardService.summary()` 增加 `reference_data_status`。
  - 不把设备/试点/报告模板/成果交付物纳入本次阻断项。

- [x] **步骤 4：实现前端展示**
  - 管理看板显示：
    - 规则库：启用/总数。
    - 动作库：已审核/待审核。
    - 模板库：已批准/总数。
    - RAG：文档/切片/索引。
    - LLM：mock 或 production provider。

- [x] **步骤 5：运行测试**
  - `cd backend && python -m pytest app/tests/api/test_admin_dashboard.py -v`
  - `cd frontend && npm run test -- --run src/adminDashboard.test.tsx`

- [x] **步骤 6：Commit**
  - `git add backend/app/api/v1/endpoints/admin_dashboard.py backend/app/services/admin_dashboard_service.py backend/app/schemas/admin_dashboard.py frontend/src/pages/admin/AdminDashboardPage.tsx frontend/src/adminDashboard.test.tsx`
  - `git commit -m "feat: show launch reference data status"`

---

## 任务 9：统一初始化脚本和上线导入流程

**文件：**
- 修改：`backend/scripts/seed_reference_data.py`
- 修改：`README.md`
- 修改：`docs/10_online_checklist.md`
- 修改：`docs/12_acceptance_evidence.md`
- 修改：`backend/app/tests/scripts/test_seed_initial_data.py`
- 修改：`backend/app/tests/scripts/test_import_reference_data.py`

- [x] **步骤 1：编写失败测试**
  - `seed_reference_data.py --no-rag-index` 会依次执行：
    - 风险规则导入。
    - 动作库导入。
    - 处方模板导入。
    - 合规材料导入。
    - RAG 文档入库，但不写 Qdrant。
  - 重复运行不产生重复记录。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/scripts/test_seed_initial_data.py app/tests/scripts/test_import_reference_data.py -v`

- [x] **步骤 3：实现统一导入**
  - `seed_reference_data.py` 支持：
    - `--no-rag-index`
    - `--strict`
    - `--skip-rag`
    - `--only risk|actions|templates|compliance|rag`
  - 每个阶段输出导入数量和错误数量。

- [x] **步骤 4：更新上线文档**
  - `README.md` 明确：
    - 本地初始化命令。
    - 生产初始化命令。
    - mock LLM 只允许开发。
  - `docs/10_online_checklist.md` 明确本次不阻断的四个 501 模块。
  - `docs/12_acceptance_evidence.md` 补充资料驱动证据。

- [x] **步骤 5：运行测试**
  - `cd backend && python -m pytest app/tests/scripts/test_seed_initial_data.py app/tests/scripts/test_import_reference_data.py -v`

- [x] **步骤 6：Commit**
  - `git add backend/scripts/seed_reference_data.py backend/app/tests/scripts README.md docs/10_online_checklist.md docs/12_acceptance_evidence.md`
  - `git commit -m "chore: unify reference data seeding workflow"`

---

## 任务 10：端到端路径验收测试

**文件：**
- 创建：`backend/app/tests/api/test_end_to_end_launch_paths.py`
- 修改：`frontend/src/prescription.test.tsx`
- 修改：`frontend/src/feedback.test.tsx`
- 修改：`frontend/src/phaseReport.test.tsx`
- 修改：`docs/12_acceptance_evidence.md`

- [x] **步骤 1：编写后端 E2E 测试**
  - 路径 A：R0 用户建档 -> 规则评估 R0 -> 生成处方 -> 自动发布 -> 导出报告。
  - 路径 B：R2 高血压用户建档 -> 生成初稿 -> 专家编辑批准 -> 用户查看发布处方。
  - 路径 C：R3 胸痛用户建档 -> 生成安全提醒 -> 无 FITT-VP -> 状态 REFERRED。
  - 路径 D：已发布处方 -> 用户打卡 RPE/完成率/不适 -> 动态调整 -> 阶段报告。

- [x] **步骤 2：运行测试确认失败或发现缺口**
  - `cd backend && python -m pytest app/tests/api/test_end_to_end_launch_paths.py -v`

- [x] **步骤 3：补齐缺口**
  - 只修复 E2E 暴露出的真实闭环问题。
  - 不引入设备接口、试点资料、报告模板、成果交付物。

- [x] **步骤 4：前端关键页面测试**
  - 用户处方页断言显示风险、状态、FITT-VP/R3 安全提醒、导出按钮。
  - 今日运动页断言提交打卡后显示调整结果。
  - 阶段报告页断言可展示周期汇总。

- [x] **步骤 5：运行测试**
  - `cd backend && python -m pytest app/tests/api/test_end_to_end_launch_paths.py -v`
  - `cd frontend && npm run test -- --run src/prescription.test.tsx src/feedback.test.tsx src/phaseReport.test.tsx`

- [x] **步骤 6：Commit**
  - `git add backend/app/tests/api/test_end_to_end_launch_paths.py frontend/src/prescription.test.tsx frontend/src/feedback.test.tsx frontend/src/phaseReport.test.tsx docs/12_acceptance_evidence.md`
  - `git commit -m "test: cover launch end-to-end prescription paths"`

---

## 任务 11：生产配置和非 mock 上线门禁

**文件：**
- 修改：`.env.example`
- 修改：`docker-compose.yml`
- 修改：`backend/app/core/readiness.py`
- 修改：`backend/app/tests/core/test_readiness.py`
- 修改：`backend/app/tests/deployment/test_docker_compose_env.py`
- 修改：`docs/08_deployment.md`
- 修改：`docs/10_online_checklist.md`

- [x] **步骤 1：编写失败测试**
  - `ENVIRONMENT=production` 且 `LLM_PROVIDER=mock` 时 `/ready` 返回 degraded 或 fail。
  - `ENVIRONMENT=production` 且 `LLM_PROVIDER=aliyun` 但没有 API key 时 `/ready` 返回 fail。
  - `ENVIRONMENT=development` 且 `LLM_PROVIDER=mock` 时 `/ready` 允许通过。

- [x] **步骤 2：运行测试确认失败**
  - `cd backend && python -m pytest app/tests/core/test_readiness.py -v`

- [x] **步骤 3：实现 readiness 门禁**
  - 生产环境检查：
    - `SECRET_KEY != change-me-in-production`
    - `LLM_PROVIDER != mock`
    - 阿里云/DashScope API key 存在。
    - Qdrant 可访问。
    - MinIO 可访问。
  - 不在 readiness 中真实调用生成处方，避免消耗生产 token。

- [x] **步骤 4：更新配置文档**
  - `.env.example` 注释写明：
    - 开发可用 mock。
    - 生产必须用 `LLM_PROVIDER=aliyun` 或其他 OpenAI-compatible provider。
    - Key 只通过环境变量注入。

- [x] **步骤 5：运行测试**
  - `cd backend && python -m pytest app/tests/core/test_readiness.py app/tests/deployment/test_docker_compose_env.py -v`

- [x] **步骤 6：Commit**
  - `git add .env.example docker-compose.yml backend/app/core/readiness.py backend/app/tests/core/test_readiness.py backend/app/tests/deployment/test_docker_compose_env.py docs/08_deployment.md docs/10_online_checklist.md`
  - `git commit -m "chore: enforce production readiness gates"`

---

## 任务 12：全量验证和上线试运行清单

**文件：**
- 修改：`docs/12_acceptance_evidence.md`
- 修改：`docs/10_online_checklist.md`
- 修改：`README.md`
- 修改：`backend/scripts/seed_reference_data.py`
- 修改：`backend/scripts/validate_reference_data.py`
- 修改：`backend/app/tests/scripts/test_seed_initial_data.py`
- 修改：`backend/app/tests/scripts/test_validate_reference_data.py`

- [x] **步骤 1：后端测试**
  - 运行：`cd backend && python -m pytest`
  - 预期：全部 PASS。

- [x] **步骤 2：前端验证**
  - 运行：`cd frontend && npm run lint`
  - 预期：exit 0。
  - 运行：`cd frontend && npm run test -- --run`
  - 预期：全部 PASS。
  - 运行：`cd frontend && npm run build`
  - 预期：构建成功。

- [x] **步骤 3：容器验收**
  - 运行：
    - `docker compose up -d --build`
    - `docker compose exec backend alembic upgrade head`
    - `docker compose exec backend python scripts/seed_initial_data.py`
    - `docker compose exec backend python scripts/seed_reference_data.py --strict`
  - 预期：容器启动、迁移和资料导入成功。

- [x] **步骤 4：接口 Smoke**
  - 检查：
    - `GET /health`
    - `GET /ready`
    - `GET /api/v1/openapi.json`
    - 管理端规则列表。
    - 管理端动作库。
    - 管理端知识库检索。
    - R0/R2/R3 三条处方路径。
    - 专家审核批准路径。
    - 用户打卡和阶段报告路径。

- [x] **步骤 5：文档更新**
  - `docs/12_acceptance_evidence.md` 记录最新测试命令和结果。
  - `docs/10_online_checklist.md` 把本次范围内的上线项改为可勾选状态。
  - `README.md` 更新为最终启动、初始化、验证、生产配置说明。

- [x] **步骤 6：Commit**
  - `git add docs/12_acceptance_evidence.md docs/10_online_checklist.md README.md backend/scripts/seed_reference_data.py backend/scripts/validate_reference_data.py backend/app/tests/scripts/test_seed_initial_data.py backend/app/tests/scripts/test_validate_reference_data.py`
  - `git commit -m "docs: update launch acceptance evidence"`

---

## 最终上线验收标准

上线试运行前必须全部满足：

- 后端 `python -m pytest` 通过。
- 前端 `npm run lint`、`npm run test -- --run`、`npm run build` 通过。
- `seed_reference_data.py --strict` 通过。
- 风险规则库、动作库、模板库、RAG 资料均有导入数量和状态展示。
- 生产环境不能使用 mock LLM。
- R0 用户可自动发布处方。
- R2 用户只能进入专家审核，专家编辑批准后才能发布。
- R3 用户不生成 FITT-VP 或训练动作，只生成安全提醒/转介。
- 专家审核记录、处方版本、报告导出均写入审计日志。
- 科研导出不包含姓名、电话、身份证等直接识别信息。
- 设备接口、试点资料、报告模板、成果交付物仍可返回 501，但上线文档明确它们不属于本次试运行范围。

## 执行建议

推荐按任务 1 到任务 12 顺序执行。任务 2-5 是资料驱动基础，必须先完成；任务 6-8 是业务闭环质量；任务 9-12 是上线验收。

每完成一个任务就提交一次 commit。不要把所有资料导入、规则引擎、专家端、RAG 和上线文档混在同一个提交里。
