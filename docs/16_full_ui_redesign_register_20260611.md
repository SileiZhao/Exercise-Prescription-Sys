# 启衡运动处方与健康干预系统全量 UI 重设计登记（2026-06-11）

> 本登记用于记录 2026-06-12 执行的服务器线上前端产品化重设计。目标是把当前界面从“页面堆叠/卡片堆叠”推进到可演示的医疗健康干预 SaaS 工作台。服务器源码目录以 `/home/zhaosilei/exercise-prescription-ui-current/source` 为准。

## 1. 基线核对

- 已阅读 `docs/13_server_current_state_handoff.md`，确认服务器、演示账号、前后端地址、Docker Compose 与业务安全边界。
- `docs/15_ui_productization_register_20260611.md` 在当前本地同步目录和服务器源码目录中均未找到；因此无法逐条复核其中 `verified` 项。该项登记为交付资料缺口，不做“已验证”假关闭。
- 已阅读并复核 `frontend/src/App.tsx`、`frontend/src/components/ProductUI.tsx`、`frontend/src/styles.css`、`frontend/src/product-layout.css`、`frontend/src/components/charts/*`、用户/专家/管理/科研主要页面。
- 线上 before 截图已采集：`ui-redesign-screenshots-20260611/before/`。
- before 覆盖 viewport：`1440x900`、`1366x768`、`1024x768`、`390x844`、`375x667`。

## 2. 基线问题

- `styles.css` 体量过大且存在大量历史 `!important` 与重复 card/panel/grid 选择器，继续在其中堆补丁会加重维护风险。
- 旧版 `ChartCard` 依赖 Ant Card 语义，图表缺少统一数据表 fallback，不利于科研审查、移动端阅读和无障碍访问。
- 专家审核队列仍带有长列表/卡片式工作台痕迹，分页表格和右侧选中任务预览不足。
- 用户、处方、专家证据、管理规则、模板/动作/知识库、科研导出等页面存在接口状态码或 seed/source 字段外露风险。
- 移动端二级页不能只依赖汉堡菜单，必须提供就近返回路径。
- 科研导出按钮禁用时需要说明原因，图表需要表格 fallback。
- 管理风险规则 JSON/控制台信息应归入高级折叠，避免首屏像调试台。

## 3. 设计决策

- 产品语气：医疗 SaaS 工作台，采用 Ant Design Pro + 医疗 patient chart + Carbon healthcare 的克制、密集、可信方向。
- 布局优先级：先重建 AppShell、PageHeader、TaskLayout、DataWorkbench、ClinicalSummaryStrip、EvidencePanel、FormDrawer、ChartPanel，再做页面级收敛。
- 页面首屏只回答当前角色任务：用户端先判断能否运动；专家端先处理队列；管理端先看上线闸口；科研端先看脱敏样本与治理状态。
- 风险颜色只做辅助，不单独承载含义，所有状态以中文标签、图标或说明补足。
- 保留 R0/R1/R2/R3 作为临床业务等级；隐藏 `PENDING_REVIEW`、`PUBLISHED`、`REFERRED`、`APPROVED`、`EXPERT_REVIEW_DRAFT`、`seed_*` 等实现字段。
- 新增 CSS 放在 `product-layout.css` 的布局/组件层，不继续扩张 `styles.css`。

## 4. 改动文件

- `frontend/src/components/ProductUI.tsx`
- `frontend/src/product-layout.css`
- `frontend/src/App.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/expert/ExpertReviewPage.tsx`
- `frontend/src/pages/user/UserDashboardPage.tsx`
- `frontend/src/pages/user/PhenotypePage.tsx`
- `frontend/src/pages/user/PrescriptionPage.tsx`
- `frontend/src/pages/admin/AdminRulesPage.tsx`
- `frontend/src/pages/admin/AdminTemplatePage.tsx`
- `frontend/src/pages/research/ResearchExportPage.tsx`
- `frontend/src/ProductUI.test.tsx`
- `frontend/src/expertReviews.test.tsx`
- `docs/16_full_ui_redesign_register_20260611.md`

## 5. 新布局组件与显示层

- `AppShell`：角色侧栏、顶部上下文、面包屑、移动端菜单与就近返回路径。
- `PageHeader`：页面标题、角色上下文、状态条、主行动容器，禁止大 hero。
- `TaskLayout`：主任务区 + 侧栏上下文，替代无序卡片堆叠。
- `DataWorkbench`：filterbar + 主表格/列表 + 选中详情，用于专家队列和治理工作台。
- `ClinicalSummaryStrip`：最多保留 3 个关键状态，避免首屏状态墙。
- `EvidencePanel` / `EvidenceTimeline`：规则、证据、审计可折叠呈现。
- `FormDrawer`：分组表单抽屉 + sticky action bar。
- `ChartCard` / `ChartPanel`：非 Ant Card 语义面板，支持 insight、threshold、empty/error 与数据表 fallback。
- `sanitizeDisplayText`：显示层净化 demo/seed 字段与英文工程状态码。

## 6. 角色页面调整

### 用户端

- 今日通行证聚焦“能不能运动、为什么、下一步”，首屏保留 3 个状态块。
- 建档向导已按当前步骤表单优先，说明放入右侧上下文 rail。
- 风险结果采用报告式布局，突出结论、规则、禁做事项和下一步。
- 处方页保留 R0/R1 可执行、R2 审核锁定、R3 转介阻断，证据来源接入 seed 净化。
- 今日反馈抽屉以基础信息和关键安全条件分段，红旗问题优先阻断普通提交。

### 专家端

- 审核队列改为 DataWorkbench：筛选条、分页表格、右侧选中任务预览，默认面向最高优先级。
- 表格每行保留一个主动作，右侧预览动作改成“处理选中任务”，避免重复主按钮语义。
- R3 详情页隐藏训练编辑，只保留医学评估/转介/暂停运动处理。
- 规则证据和 RAG 证据接入显示净化，避免 seed/source 原文暴露。

### 管理端

- 运营指挥台首屏聚焦“上线闸口 + 待办异常 + 运营趋势”，不再先堆 KPI/图表墙。
- 风险规则 JSON 与测试控制台放入高级折叠；来源引用接入显示净化。
- 动作库、模板库、知识库详情中的来源、证据引用、source id 接入显示净化，但不反写到编辑表单原始值。

### 科研端

- 总览突出脱敏样本、可分析指标和导出治理。
- 风险分布、干预前后变化、分型统计、完成率/RPE/疼痛/血压/血糖趋势均补充数据表 fallback。
- 导出申请按钮禁用时显示“填写导出用途后才能提交申请”。

## 7. 本地验证

- `npm run test -- --run`：20 files / 117 tests passed。
- `npm run lint`：0 errors，6 warnings（Fast Refresh 既有导出 warning）。
- `npm run build`：通过；保留 Vite chunk size warning。
- 关键页面回归：`ProductUI.test.tsx`、`expertReviews.test.tsx`、`userDashboard.test.tsx`、`prescription.test.tsx`、`cluster.test.tsx`、`adminRules.test.tsx`、`adminTemplates.test.tsx`、`researchExport.test.tsx` 均通过。

## 8. 服务器验证与部署

- 服务器源码已同步到 `/home/zhaosilei/exercise-prescription-ui-current/source`。
- 服务器 `/ready`：`status=ok`，production 运行态正常。
- 服务器前端全量测试：`npm run test -- --run`，20 files / 117 tests passed。
- 服务器 lint：`npm run lint`，0 errors，6 warnings（Fast Refresh 既有导出 warning）。
- 服务器 build：`npm run build` 通过；保留 Vite chunk size warning。
- 部署：`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build frontend` 已完成，`source-frontend-1` 重新创建并启动。
- 线上页面：`http://100.99.170.46:5173/` 返回 200，重新截图时加载线上新 bundle。

## 9. 截图与 DOM 指标

- before 截图目录：`ui-redesign-screenshots-20260611/before/`
- before 指标：`ui-redesign-screenshots-20260611/before/metrics-before.json`
- after 截图目录：`ui-redesign-screenshots-20260611/after/`
- after 截图数量：19 张，覆盖公开首页、登录页、R0/R1/R2/R3 用户端、专家队列/详情、管理驾驶舱/规则、科研总览/导出，以及 `1440x900`、`1366x768`、`1024x768`、`390x844`、`375x667` 视口。
- after 指标：`ui-redesign-screenshots-20260611/after/metrics-after.json`，生成时间 `2026-06-12T03:43:42.813Z`。
- after DOM 摘要：
  - `pagesWithOverflow=[]`
  - `pagesWithEnglishStatusCodes=[]`
  - `pagesWithSeedDemoText=[]`
  - `pagesWithMoreThanOnePrimary=[]`
  - `expertQueueHasPagination=true`
  - `expertQueueHasTable=true`
  - `loginMobileFormVisible=true`
  - `totalCardLikeFirstScreens=72`
- 已修复本轮复测发现的问题：
  - 公开首页首屏重复主行动收敛为 1 个。
  - 移动登录页改为表单优先，首屏露出邮箱、密码和登录按钮。
  - 专家队列表格行内动作降级为次级按钮，右侧选中任务保留唯一主行动。
  - 图表数据表 fallback 限制在容器内，消除移动端和专家队列横向溢出。

## 10. 可演示状态

- 可演示：公开首页、登录页、R0/R1/R2/R3 用户端关键路径、专家审核队列、专家详情、管理驾驶舱、管理风险规则、科研总览、科研导出任务。
- 适合团队演示的主线：
  - 用户端：今日通行证先回答“能不能运动、为什么、下一步”，R2/R3 安全边界明确。
  - 专家端：审核队列已经是 DataWorkbench 表格 + 分页 + 选中预览，不再是长卡片列表。
  - 管理端：驾驶舱首屏先看上线闸口、待办异常和运营趋势。
  - 科研端：脱敏样本、可分析指标、导出治理和数据表 fallback 已可说明。

## 11. 剩余风险

- `styles.css` 仍保留大量历史 `!important` 和重复旧样式。本轮没有继续新增 `!important`，但彻底拆分旧样式需要下一轮专项清理。
- Vite 仍有大 chunk warning，属于既有单包构建风险；本轮未做路由级代码分割。
- before 中存在历史角色截图与本轮新增 home/login 截图并存，最终验收以后续 after 截图与指标为准。
- `docs/15_ui_productization_register_20260611.md` 缺失，无法复核其中 claimed verified 状态。
- 首屏 card-like 计数已受控并通过关键页面门槛，但旧页面内部仍有 Ant Card 历史结构；下一轮建议继续从 `styles.css` 中拆分页面层 CSS，并将管理模板/用户/审计进一步统一为 DataWorkbench。
