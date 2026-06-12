# 服务器当前状态与代码交付说明

本文用于团队交接当前服务器上的 AI 个性化运动处方平台。内容以服务器目录 `/home/zhaosilei/exercise-prescription-ui-current/source` 为准，本机副本仅作辅助。

## 1. 当前运行状态

### 1.1 基本信息

| 项目 | 当前值 |
| --- | --- |
| 服务器 | `zhaosilei@100.99.170.46` |
| 项目目录 | `/home/zhaosilei/exercise-prescription-ui-current/source` |
| Git 分支 | `codex/server-ui-productization` |
| 最新提交 | `fa1e939 docs: record ai bundle ui acceptance evidence` |
| 前端访问 | `http://100.99.170.46:5173/` |
| 后端健康检查 | `http://100.99.170.46:8000/ready` |
| 后端环境 | `production` |
| LLM | `aliyun:qwen3.7-max` |
| Embedding | `dashscope:text-embedding-v4` |
| OCR | `paddleocr:enabled` |

### 1.2 Docker Compose 服务

当前使用：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

服务状态：

| 服务 | 容器 | 端口 | 作用 |
| --- | --- | --- | --- |
| `frontend` | `source-frontend-1` | `5173 -> 80` | Nginx 托管 Vite 构建后的 React 前端 |
| `backend` | `source-backend-1` | `8000 -> 8000` | FastAPI 后端，启动前执行生产运行态校验 |
| `postgres` | `source-postgres-1` | `5432` | 主业务数据库 |
| `redis` | `source-redis-1` | `6379` | 缓存/任务辅助依赖 |
| `qdrant` | `source-qdrant-1` | `6333/6334` | RAG 向量检索 |
| `minio` | `source-minio-1` | `9000/9001` | 文件对象存储 |
| `ollama` | `source-ollama-1` | `11434` | 开发/兼容服务；生产 `/ready` 当前不使用它作为 LLM |

### 1.3 最新验收结果

| 验收项 | 结果 |
| --- | --- |
| `/ready` | `status=ok`，production，aliyun/dashscope/paddleocr 均正常 |
| 前端 HTTP | `/` 返回 `200` |
| 后端 HTTP | `/ready` 返回 `200` |
| 后端测试 | `303 passed, 2 warnings` |
| 前端测试 | `20 files / 127 tests passed` |
| 前端构建 | 通过，仅保留 Vite chunk size warning |
| UI 截图烟测 | `/tmp/eps-full-ui-20260610T014210/report.json`，26/26 页面通过 |
| AI 资料库校验 | 禁忌证 60、动作 154、模板 16、风险规则 80，`blocking_errors=[]` |
| 真实 LLM smoke | `llm_provider=aliyun`，R2 处方进入 `PENDING_REVIEW` |

## 2. 业务边界与系统定位

系统定位为“医疗健康干预中台”，不是普通健身 App。默认上线边界为成人一般健康、慢病风险管理、体重管理、心肺/肌力/柔韧提升。儿童、孕产、术后康复、急性病、高危心血管事件默认转专家或医疗机构，不直接给具体训练处方。

核心安全边界：

| 风险等级 | 系统行为 |
| --- | --- |
| R0/R1 | 可生成完整 FITT-VP 处方，仍需安全提示和反馈监测 |
| R2 | 强制专家审核，审核通过前不展示训练动作和开始入口 |
| R3 | 不生成训练处方，只展示医学评估/转介建议 |

处方生成链路：

```text
六类数据采集 -> 风险分级 -> 禁忌过滤 -> 动作库候选 -> 模板匹配 -> LLM 组合解释 -> 后置安全校验 -> R2 专家审核 / R3 转介阻断
```

## 3. 顶层部署与配置文件

| 文件 | 作用 |
| --- | --- |
| `.env.example` | 环境变量示例文件，只记录变量名和默认说明，不应写入真实密钥 |
| `docker-compose.yml` | 基础服务编排，定义 backend、frontend、postgres、redis、qdrant、minio、ollama、端口和卷挂载 |
| `docker-compose.prod.yml` | 生产覆盖配置，强制 `ENVIRONMENT=production`、aliyun、dashscope、OCR enabled，并在后端启动前执行运行态校验 |
| `backend/Dockerfile` | 后端镜像构建文件，安装 Python 依赖并运行 FastAPI 服务 |
| `backend/pyproject.toml` | 后端 Python 项目依赖和 pytest/ruff 配置 |
| `backend/uv.lock` | 后端依赖锁定文件，用于稳定构建 |
| `backend/alembic.ini` | Alembic 数据库迁移配置 |
| `frontend/Dockerfile` | 前端多阶段构建文件，先构建 React/Vite，再用 Nginx 提供静态资源 |
| `frontend/.dockerignore` | 前端 Docker 构建忽略规则 |
| `frontend/package.json` | 前端依赖和脚本定义，包含 `dev`、`build`、`lint`、`test` |
| `frontend/package-lock.json` | 前端 npm 依赖锁定文件 |
| `frontend/eslint.config.js` | 前端 ESLint 规则配置 |
| `frontend/index.html` | Vite HTML 入口 |
| `frontend/nginx.conf` | 前端生产 Nginx 配置，负责静态资源和 SPA fallback |
| `frontend/tsconfig.json` | 前端 TypeScript 总配置 |
| `frontend/tsconfig.app.json` | 前端应用源码 TypeScript 配置 |
| `frontend/tsconfig.node.json` | Vite/Node 配置脚本 TypeScript 配置 |
| `frontend/vite.config.ts` | Vite 构建和开发服务器配置 |

## 4. 前端结构与文件职责

前端技术栈为 React 18、TypeScript、Vite、Ant Design 5、TanStack Query、React Router、ECharts、Framer Motion、Zod、Axios、lucide-react。主要源码位于 `frontend/src`。

### 4.1 前端入口与全局文件

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/main.tsx` | React 应用入口，挂载根组件和全局依赖 |
| `frontend/src/App.tsx` | 路由总表和页面组织，连接公开页、用户端、专家端、管理端、科研端 |
| `frontend/src/styles.css` | 全局样式、设计 token、响应式布局、医疗 SaaS 视觉系统和页面级样式 |
| `frontend/src/vite-env.d.ts` | Vite TypeScript 环境声明 |
| `frontend/src/test-setup.ts` | Vitest/jsdom 测试初始化，补齐浏览器 API mock |

### 4.2 前端认证与路由保护

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/auth/token.ts` | 本地 token、当前角色、当前用户 ID 的读写工具 |
| `frontend/src/components/ProtectedRoute.tsx` | 受保护路由组件，校验登录态和角色权限，不符合条件则跳转登录或拒绝访问 |

### 4.3 前端 API 客户端

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/api/client.ts` | Axios 基础客户端，统一 baseURL、token 注入、错误处理和响应拦截 |
| `frontend/src/api/auth.ts` | 登录、注册、刷新 token、修改密码等认证接口 |
| `frontend/src/api/healthData.ts` | 六类健康数据建档、快照、缺项提醒和风险数据提交接口 |
| `frontend/src/api/prescriptions.ts` | 用户处方生成、处方列表、详情、报告导出和安全状态接口 |
| `frontend/src/api/feedback.ts` | 今日运动反馈、RPE/疼痛/不适上报和动态调整结果接口 |
| `frontend/src/api/userDashboard.ts` | 用户首页汇总数据、风险状态、趋势图和规则命中摘要接口 |
| `frontend/src/api/expertReviews.ts` | 专家审核队列、任务详情、结构化编辑、批准/驳回/转介等接口 |
| `frontend/src/api/adminDashboard.ts` | 管理端运营驾驶舱 KPI、图表、ready 状态接口 |
| `frontend/src/api/adminContent.ts` | 管理端动作库、模板库、知识库通用内容管理接口 |
| `frontend/src/api/adminRules.ts` | 风险规则列表、详情、编辑、测试、版本和审计接口 |
| `frontend/src/api/adminUsers.ts` | 用户、机构、专家画像和管理端用户列表接口 |
| `frontend/src/api/adminAudit.ts` | 管理端审计日志查询和详情接口 |
| `frontend/src/api/clusters.ts` | 聚类模型、分型结果、训练和激活接口 |
| `frontend/src/api/researchExport.ts` | 科研聚合统计、脱敏明细、导出任务和审批流接口 |

### 4.4 前端公共组件

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/components/ProductUI.tsx` | 产品级 UI 组件集合，包含 AppShell、RoleSidebar、MetricCard、RiskBadge、RiskStatusPanel、FlowProgress、EvidenceTimeline、DemoDataBanner、空状态等 |
| `frontend/src/components/charts/BaseEChart.tsx` | ECharts 基础封装，统一 loading、empty、error、响应式高度和图表容器 |
| `frontend/src/components/charts/index.tsx` | 全站图表组件集合，包括风险分布、处方趋势、审核队列、规则排行、模板使用、反馈趋势、阶段对比、完成率趋势等 |

### 4.5 前端公开页面

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/pages/LoginPage.tsx` | 统一登录页，展示生产 provider 状态和安全边界提示 |
| `frontend/src/pages/RegisterPage.tsx` | 注册页面，创建用户账号 |
| `frontend/src/pages/ChangePasswordPage.tsx` | 修改密码页面 |

### 4.6 用户端页面

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/pages/user/UserDashboardPage.tsx` | 用户端“今日安全状态页”，展示风险等级、可运动判断、处方摘要、反馈预警、完成率趋势和安全边界 |
| `frontend/src/pages/user/OnboardingWizardPage.tsx` | 六类健康数据建档向导，分步采集基础信息、体测、体成分、生化、风险问卷和反馈相关字段 |
| `frontend/src/pages/user/PhenotypePage.tsx` | 人群分型与风险判定报告页面，展示 R0-R3 判定、命中规则、系统动作和分型说明 |
| `frontend/src/pages/user/PrescriptionPage.tsx` | 用户处方页面，处理处方生成、R2 审核锁定、R3 安全建议和报告导出 |
| `frontend/src/pages/user/TodayExercisePage.tsx` | 今日运动任务与反馈页面，展示可执行 FITT-VP、打卡、RPE、疼痛和不适中断提示 |
| `frontend/src/pages/user/PhaseReportPage.tsx` | 阶段复评报告页面，展示阶段指标对比、处方调整建议和复评结论 |

### 4.7 专家端页面

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/pages/expert/ExpertReviewPage.tsx` | 专家审核三栏工作台，包含审核队列、用户画像、处方结构化编辑、规则证据侧栏和批准前安全 checklist |

### 4.8 管理端页面

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/pages/admin/AdminDashboardPage.tsx` | 运营驾驶舱，展示 6 个 KPI、趋势图、风险分布、审核队列、规则命中和资料状态 |
| `frontend/src/pages/admin/AdminTemplatePage.tsx` | 动作库、模板库、知识库管理页面，支持筛选、详情抽屉、版本和审计信息 |
| `frontend/src/pages/admin/AdminRulesPage.tsx` | 风险规则管理页面，左右分栏编辑规则、JSON 测试、列表和图标操作 |
| `frontend/src/pages/admin/AdminClustersPage.tsx` | 聚类模型管理页面，展示模型状态、训练入口、分型分布和冷启动说明 |
| `frontend/src/pages/admin/AdminUsersPage.tsx` | 用户、机构、专家管理页面 |
| `frontend/src/pages/admin/AdminAuditPage.tsx` | 审计日志页面，提供筛选、分页、详情和操作流水查看 |

### 4.9 科研端页面

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/pages/research/ResearchExportPage.tsx` | 科研数据控制台，展示脱敏聚合数据、风险/分型矩阵、干预趋势、导出任务和审批工作流 |

### 4.10 前端测试文件

| 文件 | 功能和作用 |
| --- | --- |
| `frontend/src/App.test.tsx` | 验证路由、平台入口和主要页面可渲染 |
| `frontend/src/ProductUI.test.tsx` | 验证产品 UI 组件、安全边界、设计系统关键文案 |
| `frontend/src/api/client.test.ts` | 验证 Axios 客户端、token 注入和错误处理 |
| `frontend/src/auth.test.tsx` | 验证登录、注册、修改密码和认证流程 |
| `frontend/src/charts.test.tsx` | 验证 ECharts 组件的正常、loading、empty、error 状态和 option |
| `frontend/src/userDashboard.test.tsx` | 验证用户首页、R2 锁定、R3 安全建议和趋势 fallback |
| `frontend/src/onboarding.test.tsx` | 验证建档向导、字段校验、BMI/腰臀比计算和缺项阻断 |
| `frontend/src/cluster.test.tsx` | 验证分型页和风险判定报告 |
| `frontend/src/prescription.test.tsx` | 验证用户处方页、R2 审核前不展示训练计划 |
| `frontend/src/prescriptionReport.test.tsx` | 验证处方报告 Word/PDF 导出入口 |
| `frontend/src/feedback.test.tsx` | 验证今日运动反馈、动态调整和高危不适提示 |
| `frontend/src/phaseReport.test.tsx` | 验证阶段报告指标和建议 |
| `frontend/src/expertReviews.test.tsx` | 验证专家三栏工作台、筛选、审批、驳回、补资料和结构化编辑 |
| `frontend/src/adminDashboard.test.tsx` | 验证管理端运营驾驶舱和 readiness 异常展示 |
| `frontend/src/adminTemplates.test.tsx` | 验证动作库、模板库、知识库管理交互 |
| `frontend/src/adminRules.test.tsx` | 验证风险规则编辑、测试、版本和审计 |
| `frontend/src/adminClusters.test.tsx` | 验证聚类模型管理和训练 |
| `frontend/src/adminUsers.test.tsx` | 验证用户、机构、专家管理 |
| `frontend/src/adminAudit.test.tsx` | 验证审计日志筛选、分页和详情 |
| `frontend/src/researchExport.test.tsx` | 验证科研脱敏统计、导出申请、审批和下载 |

## 5. 后端结构与文件职责

后端技术栈为 FastAPI、SQLAlchemy、Alembic、PostgreSQL、Redis、Qdrant、MinIO、DashScope/OpenAI-compatible LLM、PaddleOCR。主要源码位于 `backend/app`，运行脚本位于 `backend/scripts`。

### 5.1 后端入口与核心模块

| 文件 | 功能和作用 |
| --- | --- |
| `backend/app/main.py` | FastAPI 应用入口，注册路由、中间件、异常处理和 `/health`/`/ready` 等基础接口 |
| `backend/app/__init__.py` | 后端应用包标识 |
| `backend/app/api/__init__.py` | API 包标识 |
| `backend/app/api/v1/__init__.py` | v1 API 包标识 |
| `backend/app/api/v1/router.py` | v1 路由聚合文件，统一挂载各业务 endpoint |
| `backend/app/core/config.py` | 配置中心，确定 `.env` 加载路径、生产 provider 状态、LLM/Embedding/OCR 配置和安全门禁 |
| `backend/app/core/database.py` | 数据库 engine、SessionLocal 和数据库依赖 |
| `backend/app/core/deps.py` | FastAPI 依赖注入，包括当前用户、角色校验、数据库 session |
| `backend/app/core/exceptions.py` | 统一业务异常和 HTTP 错误处理 |
| `backend/app/core/logging.py` | 结构化日志和错误告警相关配置 |
| `backend/app/core/readiness.py` | `/ready` 运行态检查，校验数据库、Redis、Qdrant、MinIO、LLM、Embedding、OCR 和生产配置 |
| `backend/app/core/security.py` | 密码哈希、JWT access/refresh token、权限相关安全工具 |

### 5.2 后端 API endpoints

| 文件 | 功能和作用 |
| --- | --- |
| `backend/app/api/v1/endpoints/__init__.py` | endpoints 包标识 |
| `backend/app/api/v1/endpoints/auth.py` | 登录、注册、刷新 token、修改密码和当前用户认证接口 |
| `backend/app/api/v1/endpoints/users.py` | 用户资料、机构、用户管理相关接口 |
| `backend/app/api/v1/endpoints/health_data.py` | 六类健康数据采集、更新、快照和缺项提醒接口 |
| `backend/app/api/v1/endpoints/risk.py` | 风险分级、规则命中和风险结果接口 |
| `backend/app/api/v1/endpoints/prescriptions.py` | 处方生成、处方列表、详情、R2/R3 安全边界和发布状态接口 |
| `backend/app/api/v1/endpoints/feedback.py` | 运动反馈、RPE/疼痛/不适、动态调整接口 |
| `backend/app/api/v1/endpoints/user_dashboard.py` | 用户首页聚合接口，返回风险、处方、反馈、趋势和规则命中摘要 |
| `backend/app/api/v1/endpoints/expert_reviews.py` | 专家审核队列、任务分配、机构边界、处方编辑、批准、驳回、补资料和转介接口 |
| `backend/app/api/v1/endpoints/admin_dashboard.py` | 管理端运营驾驶舱 KPI、图表、ready 状态和运行态摘要接口 |
| `backend/app/api/v1/endpoints/admin_templates.py` | 管理端动作库、模板库、知识库内容管理接口 |
| `backend/app/api/v1/endpoints/admin_rules.py` | 管理端风险规则列表、详情、编辑、测试、版本和审计接口 |
| `backend/app/api/v1/endpoints/admin_knowledge.py` | 管理端知识库文档、切片、向量索引和上传接口 |
| `backend/app/api/v1/endpoints/admin_audit.py` | 管理端审计日志查询和详情接口 |
| `backend/app/api/v1/endpoints/clusters.py` | 聚类模型训练、激活、用户分型和分型统计接口 |
| `backend/app/api/v1/endpoints/compliance.py` | 合规文案和安全边界内容接口 |
| `backend/app/api/v1/endpoints/reports.py` | 处方报告导出记录和报告生成接口 |
| `backend/app/api/v1/endpoints/research_export.py` | 科研脱敏聚合、导出申请、审批、下载和机构隔离接口 |

### 5.3 后端数据模型

| 文件 | 功能和作用 |
| --- | --- |
| `backend/app/models/__init__.py` | 模型包导出 |
| `backend/app/models/enums.py` | 角色、风险等级、处方状态、审核状态等枚举定义 |
| `backend/app/models/user.py` | 用户、机构、专家 profile、认证 refresh token 等模型 |
| `backend/app/models/health_data.py` | 六类健康数据、风险问卷、体测、体成分、生化指标等模型 |
| `backend/app/models/risk.py` | 风险规则、规则命中和风险分级相关模型 |
| `backend/app/models/prescription.py` | 处方、处方版本、处方证据、训练计划和状态模型 |
| `backend/app/models/review.py` | 专家审核任务、审核动作、版本流水和转介相关模型 |
| `backend/app/models/template.py` | 运动动作库、处方模板、知识文档、知识切片和向量索引模型 |
| `backend/app/models/cluster.py` | 聚类模型、分型标签、模型训练和激活治理模型 |
| `backend/app/models/research.py` | 科研导出申请、审批、下载和脱敏范围快照模型 |
| `backend/app/models/audit.py` | 审计日志模型，记录关键业务操作和安全事件 |

### 5.4 后端 Pydantic schemas

| 文件 | 功能和作用 |
| --- | --- |
| `backend/app/schemas/__init__.py` | schema 包导出 |
| `backend/app/schemas/auth.py` | 登录、注册、token、密码修改请求/响应结构 |
| `backend/app/schemas/user.py` | 用户、机构、专家 profile、管理端用户响应结构 |
| `backend/app/schemas/health_data.py` | 六类数据采集、快照、缺项提醒和校验结构 |
| `backend/app/schemas/risk.py` | 风险分级、规则命中、风险结果响应结构 |
| `backend/app/schemas/prescription.py` | 处方生成、FITT-VP、处方详情、状态和安全建议结构 |
| `backend/app/schemas/feedback.py` | 运动反馈、动态调整和高危不适响应结构 |
| `backend/app/schemas/user_dashboard.py` | 用户首页聚合响应结构 |
| `backend/app/schemas/review.py` | 专家审核队列、详情、编辑、动作和版本结构 |
| `backend/app/schemas/template.py` | 动作、模板、知识库和版本审计结构 |
| `backend/app/schemas/admin_rules.py` | 风险规则编辑、测试和管理端响应结构 |
| `backend/app/schemas/admin_dashboard.py` | 运营驾驶舱 KPI、图表和 ready 状态结构 |
| `backend/app/schemas/audit.py` | 审计日志列表、详情和筛选结构 |
| `backend/app/schemas/cluster.py` | 聚类模型、训练任务、分型结果和统计结构 |
| `backend/app/schemas/compliance.py` | 合规文案和平台安全边界结构 |
| `backend/app/schemas/knowledge.py` | 知识文档、切片、索引和上传响应结构 |
| `backend/app/schemas/report.py` | 报告导出、Word/PDF 报告响应结构 |
| `backend/app/schemas/research_export.py` | 科研脱敏统计、导出任务、审批和下载结构 |

### 5.5 后端服务层

| 文件 | 功能和作用 |
| --- | --- |
| `backend/app/services/auth_service.py` | 认证、注册、登录、刷新 token、密码修改业务逻辑 |
| `backend/app/services/user_service.py` | 用户、机构、专家 profile 和角色管理逻辑 |
| `backend/app/services/health_profile_service.py` | 六类健康数据保存、缺项判断、指标计算和最小必填集 |
| `backend/app/services/risk_engine.py` | 风险规则 DSL 执行器，负责字段路径、操作符和规则命中判定 |
| `backend/app/services/risk_service.py` | 风险分级编排，整合六类数据、规则命中和系统动作 |
| `backend/app/services/template_service.py` | 动作库、处方模板、模板匹配、禁忌过滤和管理端内容服务 |
| `backend/app/services/contraindication_reference_service.py` | 禁忌证资料库读取和动作禁忌冲突校验 |
| `backend/app/services/prescription_orchestrator.py` | 处方生成主编排，串联风险分级、禁忌过滤、模板匹配、LLM 组合和安全后置校验 |
| `backend/app/services/prescription_safety_service.py` | 处方安全校验，保证 R2/R3 边界、禁忌动作和强度限制 |
| `backend/app/services/llm_service.py` | 真实 LLM 接入，支持 aliyun/dashscope/openai-compatible，生产拒绝 mock fallback |
| `backend/app/services/knowledge_service.py` | RAG 知识库文档、切片、向量索引、检索和证据返回逻辑 |
| `backend/app/services/ocr_service.py` | OCR 文档识别和可用性封装 |
| `backend/app/services/expert_review_service.py` | 专家审核任务、机构边界、任务分配校验、结构化编辑和审批动作 |
| `backend/app/services/feedback_adjustment_service.py` | 根据反馈生成调整建议，处理疼痛、RPE、不适和中断条件 |
| `backend/app/services/user_dashboard_service.py` | 用户首页聚合查询，汇总风险、处方、反馈、趋势和雷达图数据 |
| `backend/app/services/admin_dashboard_service.py` | 管理端 KPI、图表、ready 状态和运营驾驶舱数据聚合 |
| `backend/app/services/admin_rule_service.py` | 风险规则管理、测试、版本和审计 |
| `backend/app/services/audit_service.py` | 审计日志写入、查询和上下文封装 |
| `backend/app/services/clustering_service.py` | 聚类模型训练、分型预测、模型激活和统计 |
| `backend/app/services/compliance_service.py` | 合规文案、安全边界和平台说明内容读取 |
| `backend/app/services/report_service.py` | 处方报告 Word/PDF 导出和报告记录 |
| `backend/app/services/research_export_service.py` | 科研端脱敏聚合、导出申请、审批、下载和机构隔离 |
| `backend/app/services/__init__.py` | 服务包标识 |

### 5.6 后端运行脚本

| 文件 | 功能和作用 |
| --- | --- |
| `backend/scripts/_bootstrap.py` | 脚本启动辅助，确保项目根目录加入 Python path |
| `backend/scripts/verify_production_runtime.py` | 生产启动前门禁，拒绝 mock LLM、hash embedding、OCR disabled 等不合规配置 |
| `backend/scripts/validate_reference_data.py` | 严格校验 docs、RAG allowlist、AI 资料库、正式动作/模板/规则/禁忌证覆盖度 |
| `backend/scripts/generate_reference_data_with_ai.py` | 使用真实 LLM 批量生成禁忌证、动作、模板和风险规则资料库并做 schema 校验 |
| `backend/scripts/materialize_ai_generated_reference_bundle.py` | 将真实 LLM 禁忌证 partial 与正式动作/模板/规则资料规范化为完整 split AI bundle |
| `backend/scripts/seed_initial_data.py` | 初始化基础用户、机构、角色等必要数据 |
| `backend/scripts/seed_reference_data.py` | 导入正式动作库、处方模板、风险规则、合规文案等参考资料 |
| `backend/scripts/seed_demo_data.py` | 注入带 `[DEMO]` 标识的演示闭环数据，供用户、专家、管理、科研端展示 |
| `backend/scripts/import_exercise_actions.py` | 导入运动动作库 JSON 到数据库 |
| `backend/scripts/import_prescription_templates.py` | 导入处方模板库 JSON 到数据库 |
| `backend/scripts/import_risk_rules.py` | 导入风险规则库 JSON 到数据库 |
| `backend/scripts/import_compliance_materials.py` | 导入合规文案和安全说明材料 |
| `backend/scripts/import_knowledge.py` | 导入知识库资料并写入知识文档/切片 |
| `backend/scripts/import_rag_data.py` | 按 allowlist 导入 RAG 文档、切片和向量索引 |
| `backend/scripts/train_cluster_model.py` | 训练聚类模型，用于用户分型和管理端聚类模块 |
| `backend/scripts/smoke_real_llm_prescription.py` | 真实 LLM smoke test，生成最小处方并确认 provider 不是 mock |

### 5.7 Alembic 数据库迁移

| 文件 | 功能和作用 |
| --- | --- |
| `backend/alembic/env.py` | Alembic 迁移环境，加载 SQLAlchemy metadata 和数据库连接 |
| `backend/alembic/script.py.mako` | Alembic 新迁移文件模板 |
| `backend/alembic/versions/0001_initial.py` | 初始表结构 |
| `backend/alembic/versions/0002_templates_knowledge.py` | 模板库和知识库相关表 |
| `backend/alembic/versions/0003_clusters.py` | 聚类模型和分型相关表 |
| `backend/alembic/versions/0004_prescriptions.py` | 处方相关表 |
| `backend/alembic/versions/0005_expert_reviews.py` | 专家审核相关表 |
| `backend/alembic/versions/0006_admin_risk_rules.py` | 管理端风险规则表 |
| `backend/alembic/versions/0007_report_export_records.py` | 报告导出记录表 |
| `backend/alembic/versions/0008_user_consents.py` | 用户知情同意记录 |
| `backend/alembic/versions/0009_feedback_pre_exercise_confirmation.py` | 运动前确认和反馈扩展字段 |
| `backend/alembic/versions/0010_nullable_r3_template_fitt_vp.py` | 允许 R3 模板 `fitt_vp` 为空 |
| `backend/alembic/versions/0011_reference_data_metadata.py` | 参考资料元数据字段 |
| `backend/alembic/versions/0012_launch_content_metadata.py` | 上线内容版本和审核状态字段 |
| `backend/alembic/versions/0013_exercise_action_launch_fields.py` | 动作库上线字段扩展 |
| `backend/alembic/versions/0014_template_launch_fields.py` | 模板库上线字段扩展 |
| `backend/alembic/versions/0015_knowledge_fields.py` | 知识库字段扩展 |
| `backend/alembic/versions/0016_cluster_model_governance.py` | 聚类模型治理、训练和激活字段 |
| `backend/alembic/versions/0017_research_export_requests.py` | 科研导出申请表 |
| `backend/alembic/versions/0018_prescription_evidence.py` | 处方 evidence 和 LLM provider 记录 |
| `backend/alembic/versions/0019_auth_refresh_tokens.py` | refresh token 表 |
| `backend/alembic/versions/0020_research_export_scope_snapshot.py` | 科研导出范围快照 |
| `backend/alembic/versions/0021_user_profile_measurements.py` | 用户 profile 测量字段扩展 |

### 5.8 后端测试文件

| 文件 | 功能和作用 |
| --- | --- |
| `backend/app/tests/conftest.py` | 后端测试 fixture、测试数据库、认证用户和依赖覆盖 |
| `backend/app/tests/helpers.py` | 后端测试辅助函数 |
| `backend/app/tests/api/test_auth.py` | 验证登录、注册、token 和权限基础流程 |
| `backend/app/tests/api/test_health.py` | 验证健康检查和 readiness 接口 |
| `backend/app/tests/api/test_health_data.py` | 验证六类数据采集和校验接口 |
| `backend/app/tests/api/test_risk.py` | 验证风险分级和规则命中 API |
| `backend/app/tests/api/test_prescriptions.py` | 验证处方生成、R2/R3 安全边界和状态流转 |
| `backend/app/tests/api/test_feedback.py` | 验证反馈提交和动态调整 API |
| `backend/app/tests/api/test_user_dashboard.py` | 验证用户首页聚合接口 |
| `backend/app/tests/api/test_expert_reviews.py` | 验证专家审核、任务分配、机构边界和审批流程 |
| `backend/app/tests/api/test_admin_dashboard.py` | 验证管理端驾驶舱和 ready 状态 |
| `backend/app/tests/api/test_admin_actions.py` | 验证管理端动作库接口 |
| `backend/app/tests/api/test_admin_knowledge.py` | 验证知识库管理接口 |
| `backend/app/tests/api/test_admin_rules.py` | 验证风险规则管理和测试接口 |
| `backend/app/tests/api/test_admin_users.py` | 验证用户、机构、专家管理接口 |
| `backend/app/tests/api/test_admin_audit.py` | 验证审计日志接口 |
| `backend/app/tests/api/test_clusters.py` | 验证聚类模型和分型 API |
| `backend/app/tests/api/test_compliance_and_not_implemented.py` | 验证合规接口和未实现路由不伪装成功 |
| `backend/app/tests/api/test_reports.py` | 验证报告导出接口 |
| `backend/app/tests/api/test_research_export.py` | 验证科研脱敏导出、审批和机构隔离 |
| `backend/app/tests/api/test_global_rbac.py` | 验证全局 RBAC 权限边界 |
| `backend/app/tests/api/test_end_to_end_launch_paths.py` | 验证上线核心端到端业务路径 |
| `backend/app/tests/core/test_config.py` | 验证配置加载、`.env` 路径和 provider 行为 |
| `backend/app/tests/core/test_readiness.py` | 验证 readiness 组件状态和异常原因 |
| `backend/app/tests/core/test_logging_alerts.py` | 验证日志和告警配置 |
| `backend/app/tests/deployment/test_acceptance_evidence.py` | 验证验收证据文档关键内容 |
| `backend/app/tests/deployment/test_alembic_migrations.py` | 验证数据库迁移链路 |
| `backend/app/tests/deployment/test_backup_restore_scripts.py` | 验证备份恢复脚本约束 |
| `backend/app/tests/deployment/test_docker_compose_env.py` | 验证 compose 生产配置拒绝不合规 provider |
| `backend/app/tests/deployment/test_docker_image_configuration.py` | 验证 Docker 镜像配置 |
| `backend/app/tests/deployment/test_frontend_vite_config.py` | 验证前端 Vite/构建配置 |
| `backend/app/tests/scripts/test_generate_reference_data_with_ai.py` | 验证 AI 资料库生成脚本、schema、R3 `fitt_vp=null` |
| `backend/app/tests/scripts/test_validate_reference_data.py` | 验证资料库严格校验脚本 |
| `backend/app/tests/scripts/test_seed_initial_data.py` | 验证基础数据 seed |
| `backend/app/tests/scripts/test_seed_reference_data.py` | 验证参考资料 seed |
| `backend/app/tests/scripts/test_seed_demo_data.py` | 验证 demo 数据注入和清理 |
| `backend/app/tests/scripts/test_import_reference_data.py` | 验证参考资料导入总流程 |
| `backend/app/tests/scripts/test_import_exercise_actions.py` | 验证动作库导入 |
| `backend/app/tests/scripts/test_import_prescription_templates.py` | 验证模板库导入 |
| `backend/app/tests/scripts/test_import_compliance_materials.py` | 验证合规材料导入 |
| `backend/app/tests/scripts/test_import_knowledge.py` | 验证知识库导入 |
| `backend/app/tests/scripts/test_import_rag_data.py` | 验证 RAG 数据导入 |
| `backend/app/tests/scripts/test_smoke_real_llm_prescription.py` | 验证真实 LLM smoke test |
| `backend/app/tests/scripts/test_verify_production_runtime.py` | 验证生产运行态门禁 |
| `backend/app/tests/services/test_llm_service.py` | 验证 LLM 服务调用和异常处理 |
| `backend/app/tests/services/test_llm_schema.py` | 验证 LLM 输出结构化 schema |
| `backend/app/tests/services/test_openai_compatible_provider.py` | 验证 OpenAI-compatible provider 适配 |
| `backend/app/tests/services/test_embedding_provider.py` | 验证 embedding provider 和 hash/mock 拒绝策略 |
| `backend/app/tests/services/test_ocr_service.py` | 验证 OCR 服务封装 |
| `backend/app/tests/services/test_knowledge_retrieval.py` | 验证 RAG 检索和 evidence 返回 |
| `backend/app/tests/services/test_prescription_orchestrator.py` | 验证处方生成主编排 |
| `backend/app/tests/services/test_prescription_safety.py` | 验证 R2/R3、禁忌动作和安全后置校验 |
| `backend/app/tests/services/test_template_matching.py` | 验证模板匹配、动作候选和禁忌过滤 |
| `backend/app/tests/services/test_feedback_adjustment.py` | 验证反馈调整逻辑 |
| `backend/app/tests/services/test_clustering.py` | 验证聚类训练、分型和模型治理 |

## 6. AI 资料库与交付文档

| 文件 | 功能和作用 |
| --- | --- |
| `docs/ai_generated/ai_generated_contraindications.partial.json` | 真实 LLM 生成的禁忌证 partial，保留生成过程资产 |
| `docs/ai_generated/ai_generated_actions.partial.json` | 历史动作 partial，保留生成过程资产 |
| `docs/ai_generated/ai_generated_contraindications.json` | 完整禁忌证 split 文件，60 条 |
| `docs/ai_generated/ai_generated_exercise_actions.json` | 完整动作库 split 文件，154 条 |
| `docs/ai_generated/ai_generated_prescription_templates.json` | 完整处方模板 split 文件，16 条，R3 模板 `fitt_vp=null` |
| `docs/ai_generated/ai_generated_risk_rules.json` | 完整风险规则 split 文件，80 条 |
| `docs/ai_generated/ai_generated_reference_bundle.json` | 上述四类资料的合并 bundle |
| `docs/ai_generated/ai_generated_reference_manifest.json` | AI 资料库 manifest，记录生成器、provider、计数、schema 版本和文件映射 |
| `docs/ai_generated/ai_generated_reference_validation_report.json` | AI 资料库校验报告，当前 `blocking_errors=[]` |
| `docs/12_acceptance_evidence.md` | 当前验收证据文档，记录测试、构建、UI 截图、真实 LLM smoke 和资料库校验 |
| `docs/13_server_current_state_handoff.md` | 本文档，用于服务器当前状态和团队交付说明 |

## 7. 前后端接口关系速览

| 前端模块 | 对应 API 客户端 | 后端 endpoint | 后端服务 |
| --- | --- | --- | --- |
| 登录/注册 | `api/auth.ts` | `endpoints/auth.py` | `auth_service.py` |
| 用户首页 | `api/userDashboard.ts` | `endpoints/user_dashboard.py` | `user_dashboard_service.py` |
| 六类建档 | `api/healthData.ts` | `endpoints/health_data.py` | `health_profile_service.py`、`risk_service.py` |
| 风险判定 | `api/userDashboard.ts`、`api/clusters.ts` | `endpoints/risk.py`、`endpoints/clusters.py` | `risk_engine.py`、`risk_service.py`、`clustering_service.py` |
| 处方生成 | `api/prescriptions.ts` | `endpoints/prescriptions.py` | `prescription_orchestrator.py`、`prescription_safety_service.py`、`template_service.py`、`llm_service.py` |
| 今日反馈 | `api/feedback.ts` | `endpoints/feedback.py` | `feedback_adjustment_service.py` |
| 专家审核 | `api/expertReviews.ts` | `endpoints/expert_reviews.py` | `expert_review_service.py` |
| 管理驾驶舱 | `api/adminDashboard.ts` | `endpoints/admin_dashboard.py` | `admin_dashboard_service.py` |
| 规则管理 | `api/adminRules.ts` | `endpoints/admin_rules.py` | `admin_rule_service.py`、`audit_service.py` |
| 动作/模板/知识 | `api/adminContent.ts` | `endpoints/admin_templates.py`、`endpoints/admin_knowledge.py` | `template_service.py`、`knowledge_service.py` |
| 用户管理 | `api/adminUsers.ts` | `endpoints/users.py` | `user_service.py` |
| 审计日志 | `api/adminAudit.ts` | `endpoints/admin_audit.py` | `audit_service.py` |
| 科研导出 | `api/researchExport.ts` | `endpoints/research_export.py` | `research_export_service.py` |

## 8. 常用运维命令

### 8.1 启动/重启

```bash
cd /home/zhaosilei/exercise-prescription-ui-current/source
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 8.2 查看状态

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -sS http://127.0.0.1:8000/ready | python3 -m json.tool
```

### 8.3 查看日志

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 backend
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 frontend
```

### 8.4 验证命令

```bash
# 后端全量测试
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python -m pytest -q

# 前端测试与构建
cd frontend
PATH=/home/zhaosilei/.nvm/versions/node/v24.13.0/bin:$PATH CI=1 npm test -- --run --no-cache
PATH=/home/zhaosilei/.nvm/versions/node/v24.13.0/bin:$PATH npm run build

# 资料库严格校验
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend \
  python scripts/validate_reference_data.py --strict --ai-bundle-dir /workspace/docs/ai_generated --json

# 真实 LLM smoke
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend \
  python scripts/smoke_real_llm_prescription.py --json
```

## 9. 交付注意事项

1. 不要把真实 `.env`、API key、数据库密码、MinIO 密钥、JWT secret 打印、提交或复制到文档。
2. 当前生产运行态依赖 aliyun/dashscope/paddleocr，`/ready` 是判断真实 provider 是否生效的第一入口。
3. R2/R3 安全边界是强约束：R2 审核前不展示训练计划，R3 不生成训练处方。
4. `docs/ai_generated` 是当前完整 AI 资料库交付物，不能只看 partial 文件。
5. 工作区中可能存在历史未跟踪备份文件，例如 `backups/`、`.bak-*`、`.orig`。这些不是当前运行代码，不应作为交付源码依据。
6. 外部域名、HTTPS 证书、短信/邮件/告警 webhook 属于部署平台配置，仓库内不伪造完成状态。
