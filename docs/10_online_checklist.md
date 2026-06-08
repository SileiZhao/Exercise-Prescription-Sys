# 上线检查清单

更新时间：2026-06-05

## 生产配置与安全

- [x] `.env` 已在远端隔离环境保留并由 Docker Compose 注入；本轮未把 `.env` 同步入仓库或日志。
- [x] `ENVIRONMENT=production` 已设置，`/ready` 中 `secret_key` 返回 `ok`。
- [x] 生产 LLM 使用真实 provider：`/ready` 返回 `llm=aliyun:qwen3.7-max key=DASHSCOPE_API_KEY:sk-...2443`，未使用 mock/ollama。
- [x] 生产 embedding 使用真实 provider：`/ready` 返回 `embedding=dashscope:text-embedding-v4 key=DASHSCOPE_API_KEY:sk-...2443`，未使用 hash/ollama embedding。
- [x] 生产 OCR 已启用：`/ready` 返回 `ocr=paddleocr:enabled`。
- [x] 生产环境禁止 mock LLM、hash embedding、OCR disabled 的 readiness 门禁已有测试覆盖。
- [x] 默认账号首次登录强制改密；`seed_initial_data.py` 不再打印默认密码。
- [x] refresh token、logout、change password 已实现并有后端/前端测试覆盖。
- [x] 日志脱敏与 secret 扫描纳入验收；本轮 secret 扫描未发现仓库泄漏。
- [ ] 错误告警 Webhook 已配置并完成一次测试触发。阻断原因：远端 `ERROR_ALERT_WEBHOOK_URL_SET=no`，生产平台尚未提供该外部配置；本轮未伪造通过，也未打印 webhook secret。

## 本地最终验证

- [x] `cd backend && ENVIRONMENT=test LLM_PROVIDER=mock EMBEDDING_PROVIDER=hash OCR_ENABLED=false python -m pytest`：239/239 passed，1 个 joblib CPU 探测 warning。
- [x] `cd frontend && npm run lint`：exit 0；仅 `BaseEChart.tsx` fast-refresh export warning，非构建/运行错误。
- [x] `cd frontend && npm run test -- --run`：19 个测试文件、82/82 passed。
- [x] `cd frontend && npm run build`：exit 0；Vite chunk size warning 仍存在但不阻断。
- [x] `cd backend && python scripts/validate_reference_data.py --strict --json`：风险规则 80、动作 154、模板 16、合规材料 8、知识来源 40、RAG allowlist 57，`missing_files=[]`、`knowledge_index_errors=[]`、`blocking_errors=[]`。

## 资料库与 RAG

- [x] 风险规则库可批量标记 `EXPERT_CONFIRMED`，导入写 audit log。
- [x] 动作库 docs 动作 `approved=154`、`pending=0`。
- [x] 处方模板库可批量批准，远端 strict 导入 `templates updated=16`、`errors=0`。
- [x] 合规材料远端 strict 导入 `confirmed=8`、`errors=0`。
- [x] RAG allowlist 保持相对路径；strict 校验无绝对路径、无缺失文件。
- [x] 远端 strict RAG 导入 `skipped=0`、`errors=0`、`chunks=12841`，`import_batch_id=rag-20260603070124637250`。
- [x] Qdrant 可访问，`/ready` 中 `qdrant=ok`；本轮未使用 `--no-rag-index` 降级路径。
- [x] RAG 索引失败会写入 `KnowledgeDocument.status=INDEX_FAILED` 与 `skipped_reason`，管理端可见失败原因，并写 `KNOWLEDGE_INDEX_FAILED` audit log。
- [x] 关键词降级检索允许检索 `INDEX_FAILED` 但有 chunk 的资料，向量检索仍只使用 `ACTIVE` 且已索引 chunk，避免索引故障导致证据完全丢失。

## 核心产品能力

- [x] 聚类模块已上线 KMeans、DBSCAN、GaussianMixture、AgglomerativeClustering。
- [x] BOOTSTRAP_V1 已实现：用户样本不足时使用已确认风险规则锚点补足训练集，`model_origin=bootstrap_rule_calibrated`。
- [x] 远端聚类模型已训练并启用：`id=1`、`status=ACTIVE`、`evaluation_passed=1.0`、`silhouette=0.6122`、`Davies-Bouldin=0.4344`、`cluster_stability=0.70`、`min_cluster_ratio=0.2083`。
- [x] 本轮本地实现已移除 `cluster_stability` 人工保底；冷启动规则校准模型若真实稳定性未达阈值会保留 `evaluation_passed=0.0`，不得伪装为正式科研聚类结论。
- [x] 聚类预测策略已明确：KMeans 最近中心；GMM 保存并使用均值、协方差、精度矩阵和权重做对数似然分类；层次聚类标记“投影分类”；DBSCAN 标记“密度近似分类，不确定时需专家解释”。
- [x] 聚类分类使用已启用模型预测，分型结果不覆盖 R0/R1/R2/R3 风险等级。
- [x] 处方执行安全已修复：今日运动仅显示最新有效 PUBLISHED 处方，R2 审核前不可执行，R3 不显示训练入口，发布新处方会 SUPERSEDED 旧版本。
- [x] 运动反馈与动态调整共用 `require_executable_prescription` 门禁：反馈必须绑定当前用户最新有效、已发布、非 R3、含 FITT-VP 的处方；未绑定反馈不再回退到最新处方，也不能触发发布或清除专家审核。
- [x] 反馈调整规则覆盖血压、血糖、胸痛/晕厥感/严重气促、异常心率、疼痛加重、RPE 连续过高、完成率过低，并保存触发规则与前后版本差异。
- [x] 前端受保护路由不再信任 `localStorage.current_user_role` 授权；每次进入保护页均通过 `/users/me` 水合当前角色，篡改缓存角色只会得到 403 或重新写回真实角色。
- [x] 专家审核工作台支持风险等级、状态、机构、时间、处方类型、异常反馈筛选；支持开始审核、批准、驳回、转诊、要求补充资料、暂停运动；详情返回六类数据摘要、结构化差异、历史版本、趋势摘要和 RAG 证据；动作写 audit log。
- [x] 科研导出支持申请、审批、拒绝、限时下载、CSV/XLSX/JSON、审计日志；`participant_code` 使用 salted hash，默认字段清单已脱敏且不导出姓名、手机号、邮箱、身份证、详细地址和原始身份自由文本。
- [x] 科研导出阶段变化不再输出占位文本；体重/BMI/腰围、血压、身体成分和生化指标均真实计算最早/最新差值，记录不足时输出 structured null 与 `null_reason`。
- [x] Demo 数据脚本 `backend/scripts/seed_demo_data.py` 已覆盖四端演示闭环：`--clear` 后创建 47 个 `[DEMO]` 用户/账号、240 条健康与复测记录、80 条处方/版本记录、20 条专家审核记录、4 条科研导出申请；再次执行普通 seed 为 0 新增，幂等且不打印明文演示密码。
- [x] 用户 dashboard 已替换占位页，展示风险与审核状态、今日运动门禁、周完成率、阶段目标、近期反馈、血压/血糖提醒、处方版本、复评日期和运营指标。
- [x] 前端四端路由与共享组件已补齐：用户建档/风险/处方/今日/反馈/阶段报告，专家审核三栏工作台，管理规则/模板/知识/聚类/审计/用户/看板，科研脱敏导出页面均使用产品级工作台布局。
- [x] 本地浏览器烟测：临时服务 `127.0.0.1:8004/5178` 覆盖 `/login`、`/register`、用户端 5 条、专家端 2 条、管理端 6 条、科研端 4 条关键路由；19/19 routes `ok=true`，无 console error、无失败响应；注册页未出现高权限角色选项；研究员页面未请求 `/research/export/users`。
- [x] `prescription_evidence` 结构化保存风险规则、模板、动作、RAG chunk、LLM provider/model、schema 校验、安全校验和对象引用。

## 远端隔离部署验收

远端目录：`/tmp/exercise-prescription-prod-ai`

- [x] `docker compose up -d --build` 成功；backend/frontend 镜像完成构建。
- [x] `alembic upgrade head` 成功，迁移至 `0019_auth_refresh_tokens`。
- [x] `python scripts/seed_initial_data.py` 成功，未输出默认密码。
- [x] `python scripts/validate_reference_data.py --strict` 成功。
- [x] `python scripts/seed_reference_data.py --strict` 成功。
- [x] `/ready` 返回 `status=ok`，组件 `secret_key/database/redis/qdrant/minio/llm/embedding/ocr` 均为 `ok`。
- [x] backend 容器 `running (healthy)`。
- [x] postgres、redis 容器 `running (healthy)`。
- [x] qdrant、minio、ollama 容器 `running`。
- [x] frontend 容器 `running`，`curl -I http://localhost:5173` 返回 HTTP 200。

## 2026-06-05 远端生产运行复核

远端服务器：`zhaosilei@100.99.170.46`；生产运行目录：`/tmp/exercise-prescription-prod-ai`；当前源码镜像：`/home/zhaosilei/exercise-prescription-ui-current/source`。

- [x] `/ready` 返回 `status=ok`，`llm=aliyun:qwen3.7-max`，`embedding=dashscope:text-embedding-v4`，`ocr=paddleocr:enabled`。
- [x] 前端入口 `curl -I http://127.0.0.1:5173/` 返回 HTTP 200。
- [x] Docker 容器状态：backend `Up (healthy)`，postgres/redis `healthy`，frontend/minio/qdrant/ollama `Up`。
- [x] 7 个 demo 账号存在且 `must_change_password=False`：R0/R1/R2/R3 用户、专家、管理员、科研人员。
- [x] 远端后端容器全量测试：`275 passed, 13 warnings in 35.76s`。
- [x] 远端 strict 资料校验：`blocking_errors=[]`、`missing_files=[]`、`knowledge_index_errors=[]`。
- [x] 远端前端 Vitest：`20 passed files / 107 passed tests`。
- [x] 远端前端 lint：`0 errors, 2 warnings`，均为既有 `react-refresh/only-export-components` warning。
- [x] 远端前端 build：`tsc -b && vite build` 通过，仅 Vite chunk size warning。
- [x] 远端真实 API smoke：R2 用户 dashboard 返回 `today_can_exercise=false`、`today_block_reason=处方发布前不可执行`；R2 处方为 `PENDING_REVIEW`；R3 处方为 `REFERRED`。
- [x] 远端专家 API smoke：`/expert-reviews/stats`、`/expert-reviews` HTTP 200；未领取任务的专家访问 `/expert-reviews/87` 返回 HTTP 403 和 `请先开始审核该任务`，管理员审计访问同一详情 HTTP 200 并返回六类健康数据、风险规则、RAG 证据、模板、候选动作、版本和趋势摘要。
- [x] 远端管理 API smoke：dashboard、规则、动作、模板、知识库、聚类模型、科研导出申请均 HTTP 200；管理端可访问脱敏用户清单。
- [x] 远端科研 API smoke：summary 和本人导出申请 HTTP 200；研究员直接访问 `/research/export/users` 返回 HTTP 403，符合“研究员不直接预览全量脱敏清单”的权限边界。
- [x] 远端浏览器烟测：真实 demo 登录覆盖 R2 用户看板、R2 处方详情、R3 处方详情、今日运动门禁、专家工作台/审核列表；截图保存在 `/private/tmp/eps_acceptance_screenshots_20260605/`。
- [x] 专家审核和科研导出权限边界已复核：专家不能读取或操作分配给其他专家的任务，未领取任务需先开始审核；机构管理员仅能访问本机构；研究员摘要、申请、下载均按本人和机构范围过滤。
- [x] 专家端平均审核时长负数已修复：后端统计对异常时间戳做非负保护，demo seed 不再生成 `reviewed_at < created_at` 的已审核记录；远端红绿回归新增用例通过，截图中专家端显示 `0小时` 而非负数。
- [x] 远端四端截图烟测：独立 Playwright 使用真实 demo token 覆盖 `/admin/dashboard`、`/admin/rules`、`/admin/knowledge`、`/admin/research-export`、`/expert/reviews`、`/expert/reviews/87`、`/research/dashboard`、`/research/cluster-analysis`、`/research/intervention-effects`、`/research/export-jobs`，10/10 routes `ok=true`，`consoleErrors=[]`，截图同目录保存。科研分型页当前按冷启动说明展示脱敏聚合和暂无分型散点数据，未伪造成正式聚类样本。

## 远端源码级回归验证

远端隔离目录：`/home/zhaosilei/exercise-prescription-codex-smoke-20260604`

- [x] 使用当前源码干净包和完整 `rag_data/80_reference_books_limited` 参考资料包解包验证；已清理 smoke 副本中的 `.DS_Store` / `._*` 元数据文件。
- [x] 远端后端 Docker 测试：`ENVIRONMENT=test LLM_PROVIDER=mock EMBEDDING_PROVIDER=hash OCR_ENABLED=false python -m pytest`：239/239 passed，1 个 Starlette deprecation warning。
- [x] 远端 strict 资料校验：`python scripts/validate_reference_data.py --strict --json` 返回 `missing_files=[]`、`knowledge_index_errors=[]`、`blocking_errors=[]`。
- [x] 远端前端干净源码验证：在 `/home/zhaosilei/exercise-prescription-codex-smoke-20260604/frontend-clean-final-20260604095626/frontend` 使用 Node `v24.13.0`、npm `11.6.2` 依次执行 `npm run test -- --run`、`npm run lint`、`npm run build` 成功；Vitest 19 个文件、82/82 passed；lint 仅 `BaseEChart.tsx` fast-refresh warning；build 成功，仅 chunk size warning。

## 备份恢复与运维

- [x] `scripts/backup_data.sh` 已在生产同等远端环境执行成功。
- [x] `backup_manifest.sha256` 校验通过。
- [x] PostgreSQL、Redis、MinIO、Qdrant 数据卷已纳入备份。
- [x] 执行一次备份恢复演练：`CONFIRM_RESTORE=yes scripts/restore_data.sh backups/<timestamp>`。
- [x] `LOG_FORMAT=json` 已开启，容器日志输出已验证为 JSON。

## 本轮试运行不阻断项

以下模块明确未纳入本轮范围；当前仓库不再保留占位 501 路由，访问未实现模块返回 404，避免静态假页面或假成功：

- [x] 设备接口：`/device-integrations/*`。
- [x] 试点资料：`/pilot-materials/*`。
- [x] 报告模板管理：`/report-templates/*`。
- [x] 成果交付物生成：`/deliverables/*`。
