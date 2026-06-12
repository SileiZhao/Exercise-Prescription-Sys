# 全量 UI 重设计执行登记（2026-06-12 续，第二次执行）

> 本登记替换上一次中途退出的同名记录。记录本轮（接手方）的真实审计、决策、改动、验证与未解决风险。服务器源码以 `/home/zhaosilei/exercise-prescription-ui-current/source` 为准；本地工作副本在 `/Users/zhaosilei/eps-redesign/frontend`。

## 0. 关键背景发现（接手时的真实状态）

- 上一个 AI 完成了**代码级重设计**但**从未部署到 5173**：其执行登记自述「当前 SSH 用户无 Docker daemon 权限，无法更新 5173 容器」。
- 其重设计是 **52 个未提交改动**，未做 git 提交（无版本管理），并在 `:5174`(preview)/`:5175`(dev) 留下游离进程。
- 线上 `http://100.99.170.46:5173/` 由 root 的 Docker nginx 容器提供，本轮已确认接手方具备 sudo/docker 权限，可非破坏性重建 frontend 容器（绝不动数据库）。
- 安全备份：未提交 diff 已存为服务器 `/tmp/leftover_redesign_20260613.patch`（23744 行），并经 git stash 往返保留。

## 1. 目标与设计读数（Design Read）

目标：把服务器前端重设计为可直接给团队展示的、成熟的医疗健康干预 SaaS 中台。不叠补丁，结构级重做，逐批自审到通过。

Design Read（taste-skill §0.B）：受监管临床运营中台（非健身 App / 营销页 / 作品集 / Apple 风消费品）。语言=克制·问责·密集。Dials：VARIANCE 3 / MOTION 2 / DENSITY 6。

遵循 skill：`$impeccable`（product register + critique/audit + 复审登记）、`$ui-ux-pro-max`（a11y/touch/responsive/forms/charts 规则）、`$design-taste-frontend`（anti-slop / AI-tell / 视觉克制 / 预检；注意：taste-skill §13 明确 dashboard/数据表/多步表单不属其 landing-page 适用面，故只取其反 slop 与预检纪律）。

## 2. 真实审计结论（基于代码 + 125 张线上截图 + DOM 指标）

线上 5173 与上一个 AI 最新构建（4180）DOM 指标一致，说明 5173 已基本反映其重设计。

可保留（已验证干净）：
- 设计令牌层（`styles.css` 顶部 `:root`）：无 AI 紫蓝、radius 8/10、单一柔和阴影、语义风险色 R0/R1/R2/R3。
- 组件体系（`ProductUI.tsx`，1473 行）：AppShell / PageHeader / RoleNav / DataWorkbench / DecisionBanner / ChartCard（带数据表 fallback）/ StatusTile / FormDrawer 等，词汇完整、命名一致。
- 布局层（`product-layout.css`，499 行）：响应式断点齐全、零 `!important`、grid 规范。
- 状态码中文化与脱敏：`sanitizeDisplayText` / `formatStatusLabel` / `ClinicalStatusBadge`。

必须重做（本轮焦点）：
- **页面构图卡片墙**：admin dashboard 首屏 27 个 card-like（单页阈值 24）、user health-data 首屏 14（阈值 12）。IA 方向对，但单路由堆叠过多 section/卡片，读感像「方框堆叠」。
- **CSS 体量**：`styles.css` 3257 行 + 16 `!important` 为历史负担；3 个 CSS 文件共 5190 行。需收敛，禁止继续 `!important` 堆覆盖。
- **触控与无障碍**：43 处 <44px 小触控目标、15 处 icon-only 无 aria-label（集中在 admin templates/users/audit、research）。
- **巨型页面未拆分**：AdminTemplatePage 1643 行、ExpertReviewPage 1550 行、ResearchExportPage 1002 行。

## 3. 执行方式与批次

工具：本机 Playwright + 缓存 Chromium 真实登录 demo 账号截图 + DOM 指标；接手方无法在本会话亲眼看图，故采「我改 + 指标自检 + 用户看图复审」协作循环（已与用户确认）。

批次：Batch0 设计系统/Shell 收敛 → Batch1 登录/入口 → Batch2 用户端 → Batch3 专家端 → Batch4 管理端 → Batch5 科研端 → Batch6 状态/响应式/清理/部署/复审。

部署：开发期用服务器 vite dev/preview + 本机 Playwright 对其截图；每批稳定后 `sudo docker compose build frontend && up -d frontend` 更新 5173；最终全量复审。版本管理：服务器 git 分支提交。

## 4. 改动文件记录

（随批次更新）

## 5. 验证结果

（随批次更新：DOM 指标 before/after、lint/test/build、截图目录）

## 6. 复审（每批按页面覆盖表 / P0-P3 / 堆砌判断 / 清爽 / 实用 / 响应式·a11y / 医疗安全表达）

（随批次更新）

## 7. 未解决风险

- 接手方在本会话无法亲眼查看截图（已用受控测试确认图像视觉不可用）；纯视觉精细度（留白·节奏·层级美感）依赖用户看图复审纠偏。
- Vite 单包 chunk 偏大；route-level 代码分割列为后续。
