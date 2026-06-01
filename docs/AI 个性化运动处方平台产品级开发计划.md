# AI 个性化运动处方平台产品级开发计划

## 0. 编程智能体总指令

你是本项目的全栈产品研发智能体。请从空仓库开始，完整实现一个可上线运行的“基于聚类算法与大模型的个性化运动处方智能生成与示范应用平台”。

本系统不是 demo，不允许只实现静态页面或伪流程。你必须实现真实可运行的后端、前端、数据库、规则引擎、RAG 知识库、处方生成、专家审核、用户执行反馈、动态调整、管理后台、部署脚本、测试用例、接口文档和上线检查。

平台业务主线必须遵循：

> 用户建档 → 六类数据采集 → 风险筛查 → 人群分型 → 模板匹配 → RAG 检索 → 大模型生成处方初稿 → 规则校验 → 专家审核 / 自动发布 → 用户执行 → 反馈记录 → 动态调整 → 阶段评估。

该流程来自建设方案中“评测—分型—生成—审核—执行—反馈—优化”的核心业务闭环；方案明确要求采用规则引擎、RAG 知识库、大模型服务、聚类算法服务、专家工作台和数据分析服务组成平台技术架构。

系统必须遵守安全边界：

AI 可以生成运动处方初稿，但不能替代医生诊断；R2 中风险人群必须专家审核后发布；R3 高风险人群不得生成训练处方，只能给出医学评估或安全提醒。

------

# 1. 产品定位与上线目标

## 1.1 产品定位

本系统定位为：

> AI 运动处方智能生成与健康干预服务中台。

服务对象包括社区居民、慢病风险人群、学校师生、老年人群、企事业单位职工、专家、管理员和科研人员。

平台需要支持：

1. 用户运动健康档案管理。
2. 六类数据标准化采集。
3. 运动风险 R0 / R1 / R2 / R3 自动分级。
4. 聚类算法人群分型。
5. RAG 知识库检索。
6. 大模型生成 FITT-VP 结构运动处方。
7. 规则引擎二次安全校验。
8. 专家审核、修改、发布、留痕。
9. 用户运动打卡、RPE、心率、疼痛、不适反馈。
10. 2—4 周小调整、8—12 周阶段评估的闭环机制。
11. 管理端统计看板。
12. 科研端脱敏数据导出。
13. Docker 化部署与生产环境上线。

## 1.2 不允许做成 demo 的要求

编程智能体必须遵守以下硬性要求：

1. 不允许只写页面，不接数据库。
2. 不允许只写假接口。
3. 不允许直接让大模型自由生成处方，必须经过结构化输入、模板匹配、知识检索、规则约束和规则校验。
4. 不允许 R2 用户自动发布处方。
5. 不允许 R3 用户生成具体训练计划。
6. 不允许没有权限控制。
7. 不允许没有日志、版本记录、审核记录。
8. 不允许没有部署脚本。
9. 不允许没有测试数据和测试用例。
10. 不允许没有上线文档。

------

# 2. 开源系统调研与借鉴方案

## 2.1 基础工程框架：fastapi/full-stack-fastapi-template

推荐借鉴 GitHub 项目：`fastapi/full-stack-fastapi-template`。

该项目是一个现代全栈 Web 应用模板，包含 FastAPI、React、SQLModel、PostgreSQL、Docker、GitHub Actions、自动 HTTPS 等能力，并采用 MIT License。([GitHub](https://github.com/fastapi/full-stack-fastapi-template))

### 借鉴内容

借鉴它的：

1. 后端 FastAPI 项目结构。
2. PostgreSQL + SQLModel / SQLAlchemy 数据访问方式。
3. Alembic 数据库迁移。
4. Docker Compose 本地和生产部署方式。
5. GitHub Actions CI/CD。
6. 前后端分离结构。
7. OpenAPI 自动接口文档。
8. 环境变量配置规范。
9. Traefik / HTTPS 部署思路。

### 与本系统对接方式

不要直接 fork 后简单改名。应当：

1. 新建本系统仓库。
2. 参考该模板建立如下结构：

```text
ai-exercise-prescription-platform/
  backend/
  frontend/
  infra/
  docs/
  scripts/
  tests/
  docker-compose.yml
  docker-compose.prod.yml
  .env.example
  README.md
```

1. 将模板中的通用用户认证、Docker、CI、后端 app 初始化方式迁移到本项目。
2. 将业务模块替换为本系统模块：

```text
backend/app/modules/
  auth/
  users/
  health_profile/
  risk_screening/
  clustering/
  knowledge_base/
  rule_engine/
  prescription/
  expert_review/
  feedback/
  analytics/
  research_export/
```

------

## 2.2 用户认证与权限：fastapi-users

推荐借鉴 GitHub 项目：`fastapi-users/fastapi-users`。

该项目为 FastAPI 提供可定制的用户注册、登录、密码重置、邮箱验证、OAuth2、JWT、Cookie、数据库适配等能力。它目前处于维护模式，但仍可作为稳定认证能力的参考。([GitHub](https://github.com/fastapi-users/fastapi-users))

### 借鉴内容

借鉴：

1. 用户注册、登录、JWT 鉴权。
2. 当前用户依赖注入。
3. 角色权限扩展模式。
4. 密码哈希与重置流程。
5. OpenAPI 鉴权集成方式。

### 与本系统对接方式

本系统不要只做普通用户表，必须设计多角色权限：

```text
角色：
- USER：普通用户
- EXPERT：运动健康专家 / 审核专家
- ADMIN：平台管理员
- RESEARCHER：科研人员
- ORG_ADMIN：机构管理员
```

所有接口必须走 RBAC：

```text
USER：
  - 查看自己的档案
  - 填写数据
  - 查看已发布处方
  - 打卡反馈

EXPERT：
  - 查看分配给自己的审核任务
  - 修改 AI 初稿
  - 发布 / 驳回处方
  - 查看用户风险摘要

ADMIN：
  - 管理用户
  - 管理规则库
  - 管理知识库
  - 查看全局统计

RESEARCHER：
  - 只能访问脱敏数据
  - 不能看到姓名、手机号、身份证等敏感信息

ORG_ADMIN：
  - 查看本机构用户和专家
  - 查看机构统计
```

------

## 2.3 运动动作库：yuhonas/free-exercise-db

推荐借鉴 GitHub 项目：`yuhonas/free-exercise-db`。

该项目提供公开领域的运动动作 JSON 数据，包含 800+ 个动作、动作图片、动作分类、主要肌群、器械、难度、说明等，并带有可搜索前端。项目使用 Unlicense。([GitHub](https://github.com/yuhonas/free-exercise-db))

### 借鉴内容

借鉴：

1. 运动项目 JSON Schema。
2. 动作名称、难度、器械、肌群、动作说明、图片路径等字段。
3. 可搜索运动动作库前端。
4. 动作数据导入脚本。

### 与本系统对接方式

本系统需要建立自己的 `exercise_library` 表，不直接把外部动作原样作为处方输出。导入后必须经过本系统规则清洗。

建立导入脚本：

```text
scripts/import_free_exercise_db.py
```

导入流程：

```text
读取 free-exercise-db JSON
→ 翻译 / 本地化动作名称
→ 映射本系统运动类型
→ 标记动作风险等级
→ 标记适宜人群
→ 标记禁忌人群
→ 写入 exercise_library
```

本系统动作库字段：

```sql
exercise_library
- id
- source
- source_exercise_id
- name_cn
- name_en
- category
- exercise_type
- primary_muscles
- secondary_muscles
- equipment
- difficulty_level
- instruction_cn
- image_url
- suitable_risk_levels
- contraindication_tags
- joint_stress_level
- impact_level
- requires_equipment
- is_traditional_exercise
- status
- created_at
- updated_at
```

必须补充本系统特色动作：

```text
太极拳
八段锦
五禽戏
易筋经
健身气功
快走
功率车
椭圆机
低冲击操
坐站训练
弹力带训练
关节活动度训练
平衡训练
```

因为建设方案明确要求建设运动项目库、FITT-VP 原则库、慢病干预知识库、禁忌症知识库、传统运动知识库和专家经验库。

------

## 2.4 可穿戴设备数据：the-momentum/open-wearables

推荐借鉴 GitHub 项目：`the-momentum/open-wearables`。

该项目是一个自托管平台，用统一 API 连接多个可穿戴设备和健身平台，提供标准化健康数据，并可用于 AI 健康洞察。它说明了可以聚合心率、睡眠、活动、步数等数据，并使用 FastAPI、React、TanStack，MIT License。([GitHub](https://github.com/the-momentum/open-wearables))

### 借鉴内容

借鉴：

1. 可穿戴设备统一接入思想。
2. 多设备 OAuth / API 同步结构。
3. 心率、步数、活动、睡眠等数据标准化。
4. Webhook / 同步任务设计。
5. 自托管隐私控制理念。

### 与本系统对接方式

第一阶段不强依赖真实设备，先设计标准接口。

建立模块：

```text
backend/app/modules/device_sync/
```

表结构：

```sql
device_provider
- id
- name
- provider_type
- auth_type
- status

device_connection
- id
- user_id
- provider_id
- external_user_id
- access_token_encrypted
- refresh_token_encrypted
- status
- last_sync_at

wearable_metric
- id
- user_id
- source
- metric_type
- metric_value
- unit
- measured_at
- raw_payload
```

内部标准指标：

```text
heart_rate
steps
active_minutes
sleep_duration
calories
workout_duration
avg_hr
max_hr
resting_hr
```

运动打卡时允许两种来源：

```text
manual：用户手动填写
device：设备同步
```

第二阶段再适配 Open Wearables 或同类自托管服务作为外部同步中台。

------

## 2.5 康复训练与专家端：Proctify

推荐参考 GitHub 项目：`topguns837/Proctify`。

该项目包含康复训练计数、姿态估计、患者进度仪表盘、医生门户、医生为患者设置处方、患者与医生连接等功能。其 README 中提到使用 Mediapipe 统计 reps / sets / joint angles，提供患者进度仪表盘，医生可查看患者进度、添加练习并设置处方。([GitHub](https://github.com/topguns837/Proctify))

### 借鉴内容

借鉴：

1. 专家 / 医生门户。
2. 用户训练进度仪表盘。
3. 处方设置与患者绑定。
4. 训练动作教程。
5. 后续可扩展姿态识别、动作计数、语音提示。

### 与本系统对接方式

第一期不做复杂姿态识别，但必须预留接口：

```text
frontend 用户端：
- 我的处方
- 今日训练
- 动作说明
- 打卡反馈
- 不适上报

frontend 专家端：
- 审核队列
- 用户画像
- AI 初稿
- 规则命中
- 修改处方
- 发布处方
- 追踪反馈
```

后续动作识别接口预留：

```http
POST /api/v1/exercise-sessions/{session_id}/pose-metrics
```

请求体：

```json
{
  "exercise_id": "string",
  "reps": 12,
  "sets": 3,
  "joint_angles": {
    "left_knee": [120, 130, 128],
    "right_knee": [118, 127, 125]
  },
  "quality_score": 0.86,
  "warnings": ["膝关节内扣风险"]
}
```

------

## 2.6 RAG / 知识库：Flexible GraphRAG 或轻量自研

推荐参考 GitHub 项目：`stevereiner/flexible-graphrag`。

该项目是开源 AI 上下文平台，支持文档处理、知识图谱、Schema、多 LLM、GraphRAG、RAG、混合检索、FastAPI REST 后端、React / Angular / Vue 前端、Docker Compose、多种向量数据库和搜索引擎。([GitHub](https://github.com/stevereiner/flexible-graphrag))

### 借鉴内容

借鉴：

1. 文档导入管线。
2. 文档切片。
3. 元数据管理。
4. 向量检索。
5. 混合检索。
6. RAG 调用链。
7. 多 LLM Provider 抽象。

### 与本系统对接方式

不建议第一期完整接入 GraphRAG，复杂度过高。第一期采用轻量 RAG：

```text
PostgreSQL：存知识文档元数据
Qdrant：存向量
MinIO：存原始文档
FastAPI：提供知识库接口
LLM Provider：OpenAI-compatible API / 本地模型 / 云模型
Embedding Provider：bge-m3 / text-embedding-3-small / 其他可配置模型
```

知识库模块：

```text
backend/app/modules/knowledge_base/
  document_service.py
  chunk_service.py
  embedding_service.py
  retrieval_service.py
  citation_service.py
```

知识文档类型：

```text
FITT-VP 处方原则
高血压运动干预
糖尿病运动干预
血脂异常运动干预
肥胖运动干预
老年功能下降运动干预
关节疼痛运动限制
红色风险禁忌
传统功法说明
专家经验案例
```

------

# 3. 总体技术架构

## 3.1 推荐技术栈

```text
前端：
- React 18 / Next.js 或 Vite React
- TypeScript
- Ant Design Pro 或 Chakra UI
- TanStack Query
- ECharts
- Zod
- Axios / Fetch

后端：
- Python 3.12
- FastAPI
- SQLAlchemy 2.x 或 SQLModel
- Pydantic v2
- Alembic
- PostgreSQL
- Redis
- Celery / RQ / Arq
- Qdrant
- MinIO
- scikit-learn
- pandas / numpy
- LangChain 或 LlamaIndex，优先轻量封装，不深度绑定

部署：
- Docker
- Docker Compose
- Nginx / Traefik
- GitHub Actions
- Sentry 可选
- Prometheus + Grafana 可选
```

## 3.2 服务架构

```text
frontend-web
  ↓
backend-api
  ↓
PostgreSQL
Redis
Qdrant
MinIO
LLM Provider
Embedding Provider
```

生产部署：

```text
Nginx / Traefik
  ├── frontend
  ├── backend-api
  ├── postgres
  ├── redis
  ├── qdrant
  ├── minio
  └── worker
```

------

# 4. 仓库初始化任务

编程智能体从空目录开始执行：

```bash
mkdir ai-exercise-prescription-platform
cd ai-exercise-prescription-platform

mkdir backend frontend infra docs scripts tests
touch README.md
touch docker-compose.yml
touch docker-compose.prod.yml
touch .env.example
```

初始化 Git：

```bash
git init
```

创建分支：

```bash
git checkout -b main
```

创建基础文档：

```text
docs/
  01_product_requirements.md
  02_architecture.md
  03_database_design.md
  04_api_design.md
  05_rule_engine.md
  06_rag_design.md
  07_algorithm_design.md
  08_deployment.md
  09_test_plan.md
  10_online_checklist.md
```

------

# 5. 核心业务模块拆分

## 5.1 用户与权限模块

必须实现：

```text
注册
登录
退出
刷新 token
修改密码
找回密码，可后置
用户角色
机构归属
专家资质信息
账号启用 / 禁用
```

核心表：

```sql
users
- id
- email
- phone
- hashed_password
- full_name
- role
- organization_id
- is_active
- is_verified
- created_at
- updated_at

organizations
- id
- name
- type
- contact_person
- contact_phone
- address
- status
- created_at
- updated_at

expert_profile
- id
- user_id
- title
- specialty
- certificate_no
- bio
- review_capacity_per_day
- status
```

------

## 5.2 六类数据采集模块

系统必须围绕六类数据建模：基础信息、体质测试、身体成分、生化与健康指标、疾病与运动风险、运动过程与反馈。上传文件中的数据标准明确说明，这些字段可作为数据库建表、用户采集表单、专家审核页面和处方生成模型输入依据。

### 基础信息表

```sql
user_profile
- id
- user_id
- name
- sex
- birth_date
- age
- height_cm
- weight_kg
- bmi
- waist_cm
- hip_cm
- whr
- occupation_type
- sedentary_hours
- sleep_hours
- exercise_goal
- exercise_habit
- exercise_experience
- created_at
- updated_at
```

字段范围必须校验：

```text
height_cm：80-230
weight_kg：20-250
waist_cm：40-180
hip_cm：50-200
sedentary_hours：0-16
sleep_hours：0-14
```

基础信息字段包括用户编号、姓名、性别、出生日期、年龄、身高、体重、BMI、腰围、臀围、腰臀比、职业类型、久坐时间、睡眠时长、运动目标、运动习惯和运动经验等。

### 体质测试表

```sql
fitness_test
- id
- user_id
- resting_hr
- sbp
- dbp
- vital_capacity
- grip_left
- grip_right
- sit_reach
- vertical_jump
- push_up
- sit_up
- single_leg_stand
- reaction_time
- step_test_index
- six_mwt
- pain_score
- rpe_baseline
- measured_at
- source
- created_by
```

必须实现校验：

```text
resting_hr：30-140
sbp：70-250
dbp：40-150
pain_score：0-10
rpe_baseline：0-10 或 6-20
```

体质测试规则中，静息心率 <50 或 >100 需要关注，收缩压 ≥160 或舒张压 ≥100 不建议直接进行中高强度运动处方，收缩压 ≥180 或舒张压 ≥110 建议医学评估，疼痛评分 ≥4 需要限制相关动作，疼痛评分 ≥7 建议暂停相关部位训练并转介评估。

### 身体成分表

```sql
body_composition
- id
- user_id
- body_fat_pct
- skeletal_muscle_kg
- muscle_mass_kg
- fat_free_mass
- visceral_fat_level
- bmr
- body_water_pct
- bone_mass_kg
- protein_pct
- body_type
- device_model
- measured_at
- is_fasting
- operator_id
```

身体成分数据用于识别肥胖、肌肉不足、内脏脂肪风险和基础代谢水平；例如 BMI 正常但体脂率偏高应标记为隐性肥胖 / 代谢风险型，体脂率高、腰围高、内脏脂肪等级高应标记为腹型肥胖 / 代谢风险型。

### 生化指标表

```sql
biochemical_index
- id
- user_id
- fbg
- pbg_2h
- hba1c
- tc
- tg
- hdl_c
- ldl_c
- uric_acid
- creatinine
- alt
- ast
- hemoglobin
- spo2
- measured_at
- source
- report_file_url
```

### 疾病与风险筛查表

```sql
risk_screening
- id
- user_id
- has_hypertension
- has_diabetes
- has_chd
- has_stroke
- has_ckd
- has_respiratory_disease
- has_osteoporosis
- has_joint_pain
- pain_location
- recent_injury
- surgery_history
- medication
- chest_pain
- syncope
- abnormal_dyspnea
- palpitation
- doctor_restriction
- parq_result
- risk_level
- risk_reasons
- created_at
```

风险数据决定系统是自动生成处方、专家复核还是医学转介；红色风险包括胸痛、晕厥、严重气短、血压显著异常、急性损伤、医生明确限制运动等，平台不应自动出具训练处方。

### 运动反馈表

```sql
exercise_feedback
- id
- user_id
- prescription_id
- exercise_date
- exercise_type
- frequency_week
- duration_min
- intensity_level
- avg_hr
- max_hr
- pre_ex_bp_sbp
- pre_ex_bp_dbp
- post_ex_bp_sbp
- post_ex_bp_dbp
- pre_glucose
- post_glucose
- rpe
- completion_rate
- discomfort
- discomfort_detail
- pain_score_after
- source
- created_at
```

------

# 6. 风险分级与规则引擎

## 6.1 风险等级

必须实现四级风险：

```text
R0：普通健康型
R1：低风险改善型
R2：中风险干预型
R3：高风险转介型
```

规则表明确要求：R0 可自动生成基础处方，R1 可生成改善型处方并建议抽查，R2 只能生成谨慎型初稿且必须专家审核后发布，R3 暂停处方生成并提示医学评估或转介。

## 6.2 规则引擎实现方式

第一期自研轻量规则引擎，规则存数据库，同时支持 YAML 导入导出。

表结构：

```sql
rule_set
- id
- name
- code
- version
- description
- status
- created_at
- updated_at

risk_rule
- id
- rule_set_id
- name
- category
- priority
- condition_json
- action_json
- risk_level
- message
- enabled
- created_at
- updated_at
```

规则条件格式：

```json
{
  "all": [
    {"field": "fitness_test.sbp", "operator": ">=", "value": 180},
    {"field": "fitness_test.dbp", "operator": ">=", "value": 110, "logic": "or"}
  ]
}
```

规则动作格式：

```json
{
  "set_risk_level": "R3",
  "allow_generate_prescription": false,
  "require_expert_review": true,
  "message": "静息血压达到红色风险阈值，建议医学评估后再运动"
}
```

## 6.3 必须内置的红色规则

```text
近期胸痛 / 胸闷 / 心前区压榨感 → R3
晕厥 / 黑蒙 / 原因不明头晕 → R3
轻微活动即严重气短 → R3
明显心悸且未评估 → R3
SBP ≥ 180 或 DBP ≥ 110 → R3
严重低血糖症状或血糖极端异常 → R3
近期骨折 / 韧带严重损伤 / 急性关节肿痛 → R3
医生明确限制运动 → R3
疼痛评分 ≥ 7 → R3
PAR-Q+ 阳性且未进一步评估 → 至少 R2，必要时 R3
```

## 6.4 必须内置的黄色规则

```text
稳定高血压 → R2，必须审核
糖尿病或糖代谢异常 → R2，必须审核
血脂异常 → R1/R2，建议审核
BMI ≥ 28 或体脂明显偏高 → R1/R2，建议审核
男性腰围 ≥ 90cm 或女性腰围 ≥ 85cm → R1/R2
老年功能下降 → R2，必须审核
疼痛评分 4-6 → R2，必须审核
过去 3 个月无规律运动 → R1/R2
使用 β 受体阻滞剂、胰岛素、降糖药、抗凝药 → R2
术后恢复期 → R2
```

------

# 7. 人群分型与聚类算法

## 7.1 第一阶段：规则分型

先实现可解释规则分型：

```text
肥胖代谢风险型
心肺功能不足型
肌力不足型
柔韧平衡不足型
慢病稳定干预型
损伤风险限制型
久坐低体能型
老年功能下降型
```

建设方案要求第一阶段采用“专家规则分型 + 聚类验证”，第二阶段再引入 K-means、DBSCAN、层次聚类、谱聚类或高斯混合模型，并由专家对聚类结果命名、合并、拆分或调整。

## 7.2 第二阶段：聚类建模

模块：

```text
backend/app/modules/clustering/
  feature_builder.py
  preprocessing.py
  model_train.py
  model_registry.py
  cluster_explainer.py
  cluster_service.py
```

特征输入：

```text
age
sex
bmi
waist_cm
whr
sedentary_hours
sleep_hours
exercise_habit
resting_hr
sbp
dbp
vital_capacity
grip_left
grip_right
sit_reach
single_leg_stand
step_test_index
six_mwt
pain_score
body_fat_pct
skeletal_muscle_kg
visceral_fat_level
fbg
hba1c
tc
tg
hdl_c
ldl_c
has_hypertension
has_diabetes
has_joint_pain
```

实现算法：

```text
KMeans
DBSCAN
AgglomerativeClustering
GaussianMixture
```

模型评估：

```text
silhouette_score
calinski_harabasz_score
davies_bouldin_score
专家可解释性评分
处方效果反馈评分
```

模型表：

```sql
cluster_model
- id
- name
- algorithm
- version
- params_json
- feature_schema
- metrics_json
- model_file_url
- status
- trained_at

cluster_profile
- id
- user_id
- model_id
- cluster_id
- cluster_label
- feature_vector
- confidence
- explanation
- created_at
```

## 7.3 聚类不是安全判断

必须写入代码注释和文档：

> 聚类结果只能用于处方模板匹配和个性化参数调整，不能覆盖风险规则。风险规则优先级永远高于聚类模型。

------

# 8. 处方模板库

表结构：

```sql
prescription_template
- id
- name
- code
- target_risk_level
- target_cluster_label
- goal
- aerobic_rule_json
- resistance_rule_json
- flexibility_rule_json
- balance_rule_json
- traditional_exercise_rule_json
- contraindication_rule_json
- progression_rule_json
- reassessment_rule_json
- status
- version
- created_at
- updated_at
```

必须内置模板：

```text
普通健康型模板
久坐低体能模板
超重肥胖模板
高血压稳定型模板
糖代谢异常模板
血脂异常模板
老年功能下降模板
膝关节疼痛模板
肌力不足模板
柔韧平衡不足模板
```

输出必须采用 FITT-VP：

```text
F：Frequency，频率
I：Intensity，强度
T：Time，时间
T：Type，类型
V：Volume，总量
P：Progression，进阶
```

风险规则表明确规定平台处方应按照 FITT-VP 结构生成，并包含运动目标、运动类型、运动频率、运动强度、单次时间、总量、进阶方式、注意事项、禁忌动作和复测周期。

------

# 9. RAG 知识库模块

## 9.1 数据表

```sql
knowledge_document
- id
- title
- doc_type
- source
- file_url
- version
- status
- uploaded_by
- created_at

knowledge_chunk
- id
- document_id
- chunk_index
- content
- metadata_json
- embedding_id
- created_at
```

Qdrant collection：

```text
exercise_prescription_knowledge
```

向量 payload：

```json
{
  "document_id": "uuid",
  "doc_type": "hypertension_guideline",
  "risk_level": "R2",
  "disease": "hypertension",
  "exercise_type": "aerobic",
  "version": "1.0"
}
```

## 9.2 检索流程

```text
用户结构化数据
→ 提取检索 query
→ 根据风险、慢病、疼痛、目标生成多个检索关键词
→ Qdrant 检索 top_k=8
→ 规则过滤
→ 返回证据片段
→ 交给 LLM 生成
```

## 9.3 RAG 必须约束

禁止大模型编造医学依据。生成结果中保存引用的 `knowledge_chunk_id`。

```sql
prescription_evidence
- id
- prescription_id
- knowledge_chunk_id
- used_for
- created_at
```

------

# 10. 大模型处方生成模块

## 10.1 LLM Provider 抽象

```text
backend/app/modules/llm/
  provider_base.py
  openai_compatible_provider.py
  prompt_templates.py
  output_parser.py
  safety_guard.py
```

环境变量：

```env
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
EMBEDDING_PROVIDER=
EMBEDDING_MODEL=
```

## 10.2 生成流程

必须严格按以下流程：

```text
1. 读取用户档案
2. 读取最新六类数据
3. 执行风险规则
4. 若 R3：不生成训练处方，生成安全提醒
5. 若 R0/R1/R2：匹配处方模板
6. 构造 RAG query
7. 检索知识库
8. 构造大模型提示词
9. 生成结构化 JSON
10. JSON Schema 校验
11. 规则引擎二次校验
12. 保存 AI 初稿
13. R0/R1 可发布或抽查
14. R2 进入专家审核队列
```

建设方案中也明确采用“结构化输入—模板匹配—知识检索—规则约束—大模型生成—安全校验—专家审核”的路线。

## 10.3 大模型输出 JSON Schema

```json
{
  "risk_level": "R1",
  "cluster_label": "肥胖代谢风险型",
  "goal": ["减脂", "改善心肺功能"],
  "summary": "用户画像摘要",
  "prescription": {
    "frequency": "每周 4 次",
    "intensity": {
      "level": "低-中等强度",
      "heart_rate_range": "最大心率 40%-60%",
      "rpe": "4-6/10"
    },
    "time": "每次 30-45 分钟",
    "type": [
      {
        "name": "快走",
        "duration": "20-30 分钟",
        "notes": "保持可完整说话"
      }
    ],
    "volume": "每周累计 150 分钟左右",
    "progression": "每 2 周根据完成率和 RPE 小幅增加 5-10 分钟",
    "precautions": ["运动中出现胸闷、头晕应立即停止"],
    "contraindications": ["避免高冲击跳跃"],
    "reassessment": "2-4 周小评估，8-12 周阶段评估"
  },
  "review_required": false,
  "evidence_chunk_ids": [],
  "llm_notes": "生成说明"
}
```

------

# 11. 处方记录与版本管理

表结构：

```sql
prescription_record
- id
- user_id
- template_id
- risk_level
- cluster_profile_id
- version
- status
- ai_generated_json
- final_prescription_json
- generation_prompt_hash
- model_name
- rule_check_result_json
- review_required
- published_at
- created_by
- created_at
- updated_at
```

状态：

```text
AI_DRAFT
RULE_REJECTED
PENDING_REVIEW
EXPERT_REJECTED
EXPERT_APPROVED
PUBLISHED
ARCHIVED
SUPERSEDED
```

版本规则：

```text
每次调整生成新版本
旧版本状态改为 SUPERSEDED
保留所有版本
用户端只展示最新 PUBLISHED 版本
专家端可查看历史版本
```

------

# 12. 专家审核模块

## 12.1 审核队列

```sql
expert_review
- id
- prescription_id
- user_id
- assigned_expert_id
- review_status
- review_result
- review_comment
- modified_prescription_json
- risk_acknowledgement
- reviewed_at
- created_at
```

审核状态：

```text
PENDING
IN_PROGRESS
APPROVED
REJECTED
NEED_MORE_INFO
TRANSFER_RECOMMENDED
```

## 12.2 专家端页面

必须实现：

```text
审核任务列表
按风险等级筛选
按机构筛选
查看用户档案
查看六类数据
查看风险命中规则
查看聚类标签
查看 RAG 证据
查看 AI 处方初稿
在线编辑处方
批准发布
驳回重生成
建议转介
审核留痕
```

## 12.3 审核规则

```text
R0：可自动发布
R1：可自动发布，但后台抽查
R2：必须专家审核后发布
R3：不得发布训练处方
```

------

# 13. 用户执行与反馈模块

## 13.1 用户端功能

```text
查看我的处方
查看今日运动任务
查看动作说明
运动打卡
填写 RPE
填写疼痛变化
填写不适反应
填写血压 / 血糖，可选
查看完成率
查看阶段报告
```

## 13.2 动态调整规则

必须实现自动判断：

```text
完成率 ≥ 80% 且 RPE 合理且无不适 → 可维持或小幅进阶
完成率 < 50% → 降低时间或频率
RPE 连续偏高 → 降低强度
疼痛加重 → 暂停相关动作，进入专家复核
出现胸痛、晕厥、严重气短 → 立即 R3，停止处方，提示医学评估
运动后血压 / 血糖异常 → 专家复核
```

## 13.3 阶段评估

```text
2-4 周：小评估
8-12 周：阶段评估
```

输出：

```text
完成率
平均运动时长
平均 RPE
疼痛变化
体重 / 腰围变化
血压 / 血糖变化
处方调整建议
是否需要专家复核
```

------

# 14. 管理后台

必须实现：

```text
用户总数
新增用户趋势
风险等级分布
处方生成数量
处方发布数量
专家审核数量
R2 审核平均时长
R3 转介数量
用户打卡完成率
不同模板使用量
不同人群分型数量
规则命中统计
知识库文档管理
处方模板管理
规则库管理
专家管理
机构管理
```

------

# 15. 科研端与脱敏导出

## 15.1 脱敏规则

科研人员不得直接看到：

```text
姓名
手机号
邮箱
身份证
详细地址
原始上传报告中的个人身份信息
```

导出用户 ID 必须替换为：

```text
research_subject_id = hash(user_id + salt)
```

## 15.2 导出内容

```text
基础体征
体质测试
身体成分
生化指标
风险等级
聚类标签
处方模板
运动反馈
阶段效果
```

导出格式：

```text
CSV
Excel
JSON
```

------

# 16. API 设计

## 16.1 Auth

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

## 16.2 用户档案

```http
POST /api/v1/profiles
GET  /api/v1/profiles/me
PUT  /api/v1/profiles/me
GET  /api/v1/admin/users/{user_id}/profile
```

## 16.3 六类数据

```http
POST /api/v1/health-data/fitness-test
POST /api/v1/health-data/body-composition
POST /api/v1/health-data/biochemical-index
POST /api/v1/health-data/risk-screening
GET  /api/v1/health-data/me/latest
GET  /api/v1/admin/users/{user_id}/health-data
```

## 16.4 风险筛查

```http
POST /api/v1/risk/evaluate
GET  /api/v1/risk/me/latest
GET  /api/v1/risk/rules
POST /api/v1/admin/risk-rules
PUT  /api/v1/admin/risk-rules/{id}
```

## 16.5 聚类分型

```http
POST /api/v1/clustering/profile/me
POST /api/v1/admin/clustering/train
GET  /api/v1/admin/clustering/models
POST /api/v1/admin/clustering/models/{id}/activate
```

## 16.6 知识库

```http
POST /api/v1/admin/knowledge/documents
GET  /api/v1/admin/knowledge/documents
POST /api/v1/admin/knowledge/documents/{id}/chunk
POST /api/v1/admin/knowledge/documents/{id}/embed
POST /api/v1/knowledge/retrieve
```

## 16.7 处方

```http
POST /api/v1/prescriptions/generate
GET  /api/v1/prescriptions/me
GET  /api/v1/prescriptions/{id}
POST /api/v1/prescriptions/{id}/regenerate
POST /api/v1/prescriptions/{id}/publish
```

## 16.8 专家审核

```http
GET  /api/v1/expert/reviews
GET  /api/v1/expert/reviews/{id}
POST /api/v1/expert/reviews/{id}/start
POST /api/v1/expert/reviews/{id}/approve
POST /api/v1/expert/reviews/{id}/reject
POST /api/v1/expert/reviews/{id}/transfer
```

## 16.9 运动反馈

```http
POST /api/v1/feedback
GET  /api/v1/feedback/me
GET  /api/v1/prescriptions/{id}/feedback
POST /api/v1/prescriptions/{id}/adjust
```

## 16.10 管理统计

```http
GET /api/v1/admin/dashboard/overview
GET /api/v1/admin/dashboard/risk-distribution
GET /api/v1/admin/dashboard/prescription-stats
GET /api/v1/admin/dashboard/review-stats
GET /api/v1/admin/dashboard/adherence-stats
```

------

# 17. 前端页面规划

## 17.1 用户端

```text
/login
/register
/user/dashboard
/user/profile
/user/health-data
/user/risk-result
/user/prescriptions
/user/prescriptions/:id
/user/today
/user/feedback
/user/follow-up-report
```

## 17.2 专家端

```text
/expert/dashboard
/expert/reviews
/expert/reviews/:id
/expert/users/:id
/expert/prescription-editor
```

## 17.3 管理端

```text
/admin/dashboard
/admin/users
/admin/organizations
/admin/experts
/admin/rules
/admin/templates
/admin/exercises
/admin/knowledge
/admin/clustering
/admin/research-export
/admin/audit-logs
```

------

# 18. 数据库迁移顺序

编程智能体按以下顺序创建 Alembic migration：

```text
001_create_users_and_orgs
002_create_user_profile
003_create_health_data_tables
004_create_risk_rules
005_create_exercise_library
006_create_prescription_templates
007_create_knowledge_base_tables
008_create_cluster_tables
009_create_prescription_records
010_create_expert_reviews
011_create_feedback_tables
012_create_device_sync_tables
013_create_audit_logs
014_create_research_export_jobs
```

------

# 19. 后端开发顺序

## Phase 1：工程骨架

```text
完成 FastAPI 项目
完成配置管理
完成数据库连接
完成 Alembic
完成 Redis
完成统一错误处理
完成日志
完成 OpenAPI
完成 Docker Compose
```

验收：

```bash
docker compose up -d
curl http://localhost:8000/health
```

返回：

```json
{"status": "ok"}
```

## Phase 2：认证与权限

```text
实现注册登录
实现 JWT
实现当前用户
实现角色权限
实现机构
实现专家资料
```

验收：

```text
普通用户不能访问专家接口
专家不能访问管理接口
科研人员不能访问用户身份信息
```

## Phase 3：六类数据采集

```text
实现用户档案
实现体质测试
实现身体成分
实现生化指标
实现风险筛查
实现运动反馈
实现字段校验
实现最新数据聚合接口
```

## Phase 4：规则引擎

```text
实现规则 DSL
实现规则执行器
实现 R0/R1/R2/R3 分级
实现规则命中解释
实现规则版本管理
实现后台规则增删改查
```

## Phase 5：动作库与模板库

```text
实现 exercise_library
实现 free-exercise-db 导入脚本
实现本地化动作补充
实现处方模板 CRUD
实现模板匹配服务
```

## Phase 6：聚类分型

```text
实现特征构建
实现规则分型
实现 sklearn 聚类训练
实现模型保存
实现聚类解释
实现用户分型接口
```

## Phase 7：RAG 知识库

```text
实现文档上传
实现文档切片
实现 embedding
实现 Qdrant 写入
实现检索
实现 chunk 引用记录
```

## Phase 8：处方生成

```text
实现生成编排器
实现 LLM Provider
实现提示词模板
实现 JSON Schema 校验
实现规则二次校验
实现 AI_DRAFT 保存
实现 R0/R1 发布逻辑
实现 R2 审核队列
实现 R3 安全提醒
```

## Phase 9：专家审核

```text
实现审核队列
实现专家编辑处方
实现批准发布
实现驳回
实现转介建议
实现审核留痕
```

## Phase 10：反馈与动态调整

```text
实现用户打卡
实现反馈统计
实现调整规则
实现生成新版本处方
实现阶段评估报告
```

## Phase 11：管理后台与科研导出

```text
实现统计接口
实现看板
实现脱敏导出
实现审计日志
```

## Phase 12：测试、部署、上线

```text
单元测试
接口测试
端到端测试
权限测试
风险规则测试
R3 禁止生成测试
Docker 生产部署
Nginx / Traefik
HTTPS
备份策略
上线检查
```

------

# 20. 测试要求

## 20.1 必须有单元测试

```text
test_bmi_calculation
test_waist_hip_ratio
test_risk_r0
test_risk_r1
test_risk_r2
test_risk_r3_chest_pain
test_risk_r3_high_bp
test_risk_r3_pain_score
test_template_matching
test_llm_output_schema
test_r2_requires_expert_review
test_r3_no_training_plan
test_feedback_adjustment
```

## 20.2 风险规则测试用例

### 用例 1：R0

```json
{
  "age": 30,
  "bmi": 22,
  "sbp": 118,
  "dbp": 76,
  "pain_score": 0,
  "chest_pain": false,
  "syncope": false
}
```

期望：

```text
risk_level = R0
allow_generate = true
review_required = false
```

### 用例 2：R2

```json
{
  "age": 66,
  "has_hypertension": true,
  "sbp": 145,
  "dbp": 88,
  "pain_score": 3
}
```

期望：

```text
risk_level = R2
allow_generate = true
review_required = true
status = PENDING_REVIEW
```

### 用例 3：R3

```json
{
  "chest_pain": true,
  "sbp": 170,
  "dbp": 90
}
```

期望：

```text
risk_level = R3
allow_generate_training_plan = false
只生成安全提醒
```

------

# 21. 提示词模板要求

## 21.1 系统提示词

```text
你是运动处方生成助手，只能根据系统提供的结构化用户数据、处方模板、规则限制和知识库证据生成运动处方初稿。
你不能诊断疾病，不能调整药物，不能承诺疗效。
如果用户风险等级为 R3，禁止生成具体训练计划、运动强度、动作组数和进阶计划，只能输出安全提醒和医学评估建议。
输出必须是合法 JSON，符合系统提供的 JSON Schema。
```

## 21.2 用户数据提示词

```text
请根据以下结构化数据生成 FITT-VP 运动处方初稿。

用户数据：
{{user_profile_json}}

风险等级：
{{risk_level}}

命中规则：
{{risk_reasons_json}}

聚类标签：
{{cluster_label}}

处方模板：
{{template_json}}

知识库证据：
{{retrieved_chunks}}

输出格式：
{{json_schema}}
```

------

# 22. 安全与合规要求

必须实现：

```text
密码哈希
JWT 过期
接口权限控制
敏感信息脱敏
审计日志
专家审核留痕
处方版本管理
知识库版本管理
规则库版本管理
科研导出脱敏
备份恢复
错误日志
用户知情同意页面
免责声明页面
```

免责声明必须包含：

```text
本平台提供运动健康指导、风险提示、运动处方建议和运动干预跟踪服务，不替代医疗诊断、药物治疗和临床处置。
若出现胸痛、晕厥、严重气短、血压显著异常、急性损伤或医生明确限制运动等情况，应停止运动并寻求医学评估。
```

------

# 23. 生产部署方案

## 23.1 docker-compose.prod.yml

服务：

```text
frontend
backend
worker
postgres
redis
qdrant
minio
nginx
```

## 23.2 环境变量

```env
ENV=production
SECRET_KEY=
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
DATABASE_URL=
REDIS_URL=
QDRANT_URL=
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
EMBEDDING_MODEL=
FRONTEND_URL=
BACKEND_CORS_ORIGINS=
```

## 23.3 上线命令

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
docker compose -f docker-compose.prod.yml exec backend python scripts/seed_initial_data.py
```

## 23.4 初始化数据

`seed_initial_data.py` 必须写入：

```text
默认管理员账号
默认机构
默认专家账号
R0/R1/R2/R3 规则
基础处方模板
基础动作库
知识库示例文档
测试用户
```

------

# 24. 上线验收清单

上线前必须全部通过：

```text
[ ] 用户注册登录正常
[ ] 角色权限正常
[ ] 六类数据采集正常
[ ] 字段范围校验正常
[ ] R0 风险判断正确
[ ] R1 风险判断正确
[ ] R2 必须进入专家审核
[ ] R3 不生成训练处方
[ ] 处方输出符合 FITT-VP
[ ] RAG 能检索知识片段
[ ] LLM 输出通过 JSON Schema 校验
[ ] 规则二次校验能拦截不安全处方
[ ] 专家能修改并发布处方
[ ] 用户能看到发布后的处方
[ ] 用户能运动打卡
[ ] 反馈能触发动态调整
[ ] 阶段评估能生成报告
[ ] 管理后台有统计数据
[ ] 科研导出已脱敏
[ ] 审计日志完整
[ ] Docker 生产环境可启动
[ ] 数据库备份脚本可执行
[ ] README 部署文档完整
[ ] OpenAPI 文档可访问
[ ] 单元测试通过
[ ] 端到端测试通过
```

------

# 25. 最终交付物

编程智能体最终必须交付：

```text
1. 完整 Git 仓库
2. 后端 FastAPI 源码
3. 前端 React 源码
4. PostgreSQL 数据库迁移
5. Docker Compose 开发与生产配置
6. 规则库初始化脚本
7. 处方模板初始化脚本
8. 动作库导入脚本
9. 知识库导入脚本
10. 聚类训练脚本
11. 测试用例
12. API 文档
13. 管理员使用手册
14. 专家审核手册
15. 用户使用说明
16. 上线部署文档
17. 上线检查清单
18. 数据备份与恢复文档
```

------

# 26. 第一版产品范围

第一版必须上线以下功能：

```text
用户端：
- 注册登录
- 建档
- 填写六类数据
- 查看风险结果
- 查看正式处方
- 运动打卡
- 查看阶段反馈

专家端：
- 登录
- 审核队列
- 查看用户画像
- 查看 AI 初稿
- 修改处方
- 发布 / 驳回 / 转介

管理端：
- 用户管理
- 专家管理
- 规则管理
- 模板管理
- 知识库管理
- 处方统计
- 风险统计

算法与 AI：
- R0/R1/R2/R3 风险规则
- 规则分型
- KMeans 聚类
- RAG 检索
- LLM 结构化处方生成
- 规则二次校验

部署：
- Docker Compose
- PostgreSQL
- Redis
- Qdrant
- MinIO
- Nginx
```

第一版可以暂缓：

```text
复杂可穿戴设备 OAuth
姿态识别
视频通话
小程序
医院 HIS / 体检系统深度对接
GraphRAG
多机构 SaaS 计费
```

但必须预留数据表和接口扩展点。

------

# 27. 编程智能体执行优先级

请按以下顺序实现，不要跳步：

```text
1. 初始化仓库和 Docker
2. 完成后端基础框架
3. 完成认证权限
4. 完成数据库模型
5. 完成六类数据采集
6. 完成风险规则引擎
7. 完成处方模板和动作库
8. 完成处方生成主流程，不接 LLM 时先用 mock provider，但接口必须真实
9. 接入真实 LLM Provider
10. 接入 Qdrant RAG
11. 完成专家审核
12. 完成用户反馈
13. 完成管理后台
14. 完成测试
15. 完成生产部署
16. 完成文档
17. 执行上线检查
```

最终目标是：普通用户可以真实提交健康数据，系统可以真实判断风险，AI 可以生成受规则约束的运动处方初稿，专家可以审核发布，用户可以执行反馈，系统可以根据反馈生成新版本处方，管理员可以运营管理，科研人员可以导出脱敏数据。



你说得对。上一版偏“系统方案 + 字段规范”，还不够像能直接驱动编程智能体落地的实现说明。下面这版是**补充开发指令**，建议直接追加到 `DEVELOPMENT_PLAN.md` 后面，作为“实现级任务书”。

它会更明确地告诉智能体：**建哪些文件、写哪些类、接口怎么调、页面怎么交互、每一步怎么验收**。

------

# 28. 实现级开发指令总览

编程智能体必须按“后端服务层 → API 层 → 前端页面 → 测试 → 部署”的顺序实现。不要只生成表结构或伪代码，每个业务能力都必须有：

```text
1. 数据模型
2. Pydantic Schema
3. Service 业务逻辑
4. API Router
5. 权限控制
6. 前端页面
7. 前端 API Client
8. 表单校验
9. 加载 / 空状态 / 错误状态
10. 单元测试 / 接口测试
```

本平台的产品闭环必须严格实现“数据采集—风险筛查—智能分型—处方生成—专家审核—运动执行—反馈优化—效果评估”，这是总体方案中明确提出的平台核心闭环。

第一版必须至少实现用户建档、六类数据录入、风险问卷、风险等级判定、健康画像、人群分型、AI 处方生成、规则校验、专家审核、处方报告导出、运动打卡反馈、管理统计看板和科研数据导出；这些也是方案附件中列出的 MVP 功能清单。

------

# 29. 后端代码结构必须这样实现

## 29.1 目录结构

编程智能体创建如下后端目录：

```text
backend/
  app/
    main.py
    core/
      config.py
      security.py
      database.py
      deps.py
      exceptions.py
      logging.py
    models/
      user.py
      organization.py
      health_data.py
      risk.py
      prescription.py
      review.py
      feedback.py
      knowledge.py
      clustering.py
      audit.py
    schemas/
      auth.py
      user.py
      health_data.py
      risk.py
      prescription.py
      review.py
      feedback.py
      knowledge.py
      clustering.py
    api/
      v1/
        router.py
        endpoints/
          auth.py
          users.py
          health_data.py
          risk.py
          prescriptions.py
          expert_reviews.py
          feedback.py
          admin_rules.py
          admin_templates.py
          admin_knowledge.py
          admin_dashboard.py
          research_export.py
    services/
      auth_service.py
      health_profile_service.py
      risk_engine/
        evaluator.py
        operators.py
        rules_seed.py
      clustering/
        feature_builder.py
        rule_based_classifier.py
        train.py
        service.py
      prescription/
        orchestrator.py
        template_matcher.py
        safety_validator.py
        versioning.py
      llm/
        base.py
        openai_compatible.py
        mock.py
        prompts.py
        output_schema.py
      rag/
        document_loader.py
        chunker.py
        embedder.py
        retriever.py
      review_service.py
      feedback_service.py
      report_service.py
      audit_service.py
    repositories/
      base.py
      user_repo.py
      health_data_repo.py
      prescription_repo.py
      review_repo.py
      knowledge_repo.py
    workers/
      celery_app.py
      tasks.py
    tests/
      unit/
      integration/
  alembic/
  scripts/
    seed_initial_data.py
    import_exercise_db.py
    import_knowledge_docs.py
```

不要把所有逻辑写进 router。Router 只负责参数接收、权限检查和调用 service。

------

# 30. 后端核心代码骨架

## 30.1 FastAPI 入口

新建 `backend/app/main.py`：

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.router import api_router

app = FastAPI(
    title="AI Exercise Prescription Platform",
    version="1.0.0",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(api_router, prefix="/api/v1")
```

## 30.2 配置文件

新建 `backend/app/core/config.py`：

```python
from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl


class Settings(BaseSettings):
    ENV: str = "development"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"

    QDRANT_URL: str = "http://qdrant:6333"
    QDRANT_COLLECTION: str = "exercise_prescription_knowledge"

    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET: str = "exercise-platform"

    LLM_PROVIDER: str = "mock"
    LLM_BASE_URL: str | None = None
    LLM_API_KEY: str | None = None
    LLM_MODEL: str = "gpt-4o-mini"

    EMBEDDING_MODEL: str = "bge-m3"

    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"


settings = Settings()
```

------

# 31. 数据模型实现方式

## 31.1 枚举统一定义

新建 `backend/app/models/enums.py`：

```python
from enum import Enum


class UserRole(str, Enum):
    USER = "USER"
    EXPERT = "EXPERT"
    ADMIN = "ADMIN"
    RESEARCHER = "RESEARCHER"
    ORG_ADMIN = "ORG_ADMIN"


class RiskLevel(str, Enum):
    R0 = "R0"
    R1 = "R1"
    R2 = "R2"
    R3 = "R3"


class PrescriptionStatus(str, Enum):
    AI_DRAFT = "AI_DRAFT"
    RULE_REJECTED = "RULE_REJECTED"
    PENDING_REVIEW = "PENDING_REVIEW"
    EXPERT_REJECTED = "EXPERT_REJECTED"
    EXPERT_APPROVED = "EXPERT_APPROVED"
    PUBLISHED = "PUBLISHED"
    SUPERSEDED = "SUPERSEDED"


class ReviewStatus(str, Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    NEED_MORE_INFO = "NEED_MORE_INFO"
    TRANSFER_RECOMMENDED = "TRANSFER_RECOMMENDED"
```

------

## 31.2 健康数据模型

新建 `backend/app/models/health_data.py`，不要为了省事把六类数据塞进一张大 JSON 表。总体方案明确要求以六类运动健康数据作为数据体系核心，并拆分为用户基础表、体质测试表、身体成分表、生化指标表、风险筛查表、处方记录表、运动反馈表和复测评估表。

```python
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, date
from app.core.database import Base


class UserProfile(Base):
    __tablename__ = "user_profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)

    name: Mapped[str] = mapped_column(String(64))
    sex: Mapped[str] = mapped_column(String(16))
    birth_date: Mapped[date] = mapped_column(Date)
    age: Mapped[int] = mapped_column(Integer)

    height_cm: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)
    bmi: Mapped[float] = mapped_column(Float)

    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hip_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    whr: Mapped[float | None] = mapped_column(Float, nullable=True)

    occupation_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sedentary_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    exercise_goal: Mapped[list[str]] = mapped_column(JSON, default=list)
    exercise_habit: Mapped[str] = mapped_column(String(64))
    exercise_experience: Mapped[str] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FitnessTest(Base):
    __tablename__ = "fitness_test"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    resting_hr: Mapped[int] = mapped_column(Integer)
    sbp: Mapped[int] = mapped_column(Integer)
    dbp: Mapped[int] = mapped_column(Integer)

    vital_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grip_left: Mapped[float | None] = mapped_column(Float, nullable=True)
    grip_right: Mapped[float | None] = mapped_column(Float, nullable=True)
    sit_reach: Mapped[float | None] = mapped_column(Float, nullable=True)
    single_leg_stand: Mapped[float | None] = mapped_column(Float, nullable=True)
    reaction_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    step_test_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    six_mwt: Mapped[float | None] = mapped_column(Float, nullable=True)

    pain_score: Mapped[int] = mapped_column(Integer)
    rpe_baseline: Mapped[float | None] = mapped_column(Float, nullable=True)

    measured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    source: Mapped[str] = mapped_column(String(32), default="manual")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
```

字段校验要放在 Pydantic Schema 中。六类数据标准中，基础信息、体质测试、身体成分、生化指标、疾病风险和运动反馈都明确给出了字段用途与取值范围，可直接作为表单校验依据。

------

# 32. Pydantic Schema 代码细节

新建 `backend/app/schemas/health_data.py`：

```python
from datetime import date, datetime
from pydantic import BaseModel, Field, field_validator


class UserProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    sex: str
    birth_date: date

    height_cm: float = Field(ge=80, le=230)
    weight_kg: float = Field(ge=20, le=250)
    waist_cm: float | None = Field(default=None, ge=40, le=180)
    hip_cm: float | None = Field(default=None, ge=50, le=200)

    occupation_type: str | None = None
    sedentary_hours: float | None = Field(default=None, ge=0, le=16)
    sleep_hours: float | None = Field(default=None, ge=0, le=14)

    exercise_goal: list[str]
    exercise_habit: str
    exercise_experience: str

    @field_validator("exercise_goal")
    @classmethod
    def validate_goal(cls, value: list[str]):
        if not value:
            raise ValueError("至少选择一个运动目标")
        allowed = {
            "减脂", "降血压", "控糖", "增强心肺", "增肌",
            "改善柔韧", "改善平衡", "康复恢复", "体质提升", "其他"
        }
        invalid = [item for item in value if item not in allowed]
        if invalid:
            raise ValueError(f"不支持的运动目标: {invalid}")
        return value


class UserProfileRead(UserProfileCreate):
    id: int
    user_id: int
    age: int
    bmi: float
    whr: float | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class FitnessTestCreate(BaseModel):
    resting_hr: int = Field(ge=30, le=140)
    sbp: int = Field(ge=70, le=250)
    dbp: int = Field(ge=40, le=150)

    vital_capacity: int | None = Field(default=None, ge=500, le=8000)
    grip_left: float | None = Field(default=None, ge=0, le=100)
    grip_right: float | None = Field(default=None, ge=0, le=100)
    sit_reach: float | None = Field(default=None, ge=-30, le=40)
    single_leg_stand: float | None = Field(default=None, ge=0, le=300)
    reaction_time: float | None = Field(default=None, ge=0.1, le=5.0)
    step_test_index: float | None = Field(default=None, ge=0, le=100)
    six_mwt: float | None = Field(default=None, ge=0, le=1000)

    pain_score: int = Field(ge=0, le=10)
    rpe_baseline: float | None = Field(default=None, ge=0, le=20)
```

------

# 33. 健康档案 Service 代码

新建 `backend/app/services/health_profile_service.py`：

```python
from datetime import date
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.health_data import UserProfile, FitnessTest
from app.schemas.health_data import UserProfileCreate, FitnessTestCreate


def calculate_age(birth_date: date) -> int:
    today = date.today()
    return today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )


def calculate_bmi(height_cm: float, weight_kg: float) -> float:
    height_m = height_cm / 100
    return round(weight_kg / (height_m * height_m), 2)


def calculate_whr(waist_cm: float | None, hip_cm: float | None) -> float | None:
    if waist_cm is None or hip_cm is None or hip_cm == 0:
        return None
    return round(waist_cm / hip_cm, 2)


class HealthProfileService:
    def __init__(self, db: Session):
        self.db = db

    def upsert_user_profile(self, user_id: int, payload: UserProfileCreate) -> UserProfile:
        age = calculate_age(payload.birth_date)
        bmi = calculate_bmi(payload.height_cm, payload.weight_kg)
        whr = calculate_whr(payload.waist_cm, payload.hip_cm)

        profile = (
            self.db.query(UserProfile)
            .filter(UserProfile.user_id == user_id)
            .one_or_none()
        )

        data = payload.model_dump()
        data.update({"age": age, "bmi": bmi, "whr": whr})

        if profile is None:
            profile = UserProfile(user_id=user_id, **data)
            self.db.add(profile)
        else:
            for key, value in data.items():
                setattr(profile, key, value)

        self.db.commit()
        self.db.refresh(profile)
        return profile

    def create_fitness_test(
        self,
        user_id: int,
        created_by: int,
        payload: FitnessTestCreate,
    ) -> FitnessTest:
        fitness_test = FitnessTest(
            user_id=user_id,
            created_by=created_by,
            **payload.model_dump(),
        )
        self.db.add(fitness_test)
        self.db.commit()
        self.db.refresh(fitness_test)
        return fitness_test

    def get_latest_health_snapshot(self, user_id: int) -> dict:
        profile = (
            self.db.query(UserProfile)
            .filter(UserProfile.user_id == user_id)
            .one_or_none()
        )
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请先完成基础档案",
            )

        fitness_test = (
            self.db.query(FitnessTest)
            .filter(FitnessTest.user_id == user_id)
            .order_by(FitnessTest.measured_at.desc())
            .first()
        )

        return {
            "profile": profile,
            "fitness_test": fitness_test,
        }
```

------

# 34. 风险规则引擎实现细节

风险引擎是本系统最核心的安全模块。方案明确要求规则引擎负责风险分级、强度上限、禁忌动作、审核触发和预警中止，且规则库要能解决“什么情况下不能出方、怎样安全出方”。

## 34.1 规则执行输入对象

新建 `backend/app/services/risk_engine/evaluator.py`：

```python
from dataclasses import dataclass
from typing import Any


@dataclass
class RuleHit:
    rule_code: str
    rule_name: str
    risk_level: str
    message: str
    priority: int
    action: dict[str, Any]


@dataclass
class RiskEvaluationResult:
    risk_level: str
    allow_generate_prescription: bool
    allow_publish_directly: bool
    require_expert_review: bool
    hits: list[RuleHit]
    contraindications: list[str]
    intensity_limit: str | None
```

## 34.2 操作符实现

新建 `backend/app/services/risk_engine/operators.py`：

```python
from typing import Any


def op_eq(left: Any, right: Any) -> bool:
    return left == right


def op_ne(left: Any, right: Any) -> bool:
    return left != right


def op_gte(left: Any, right: Any) -> bool:
    return left is not None and left >= right


def op_lte(left: Any, right: Any) -> bool:
    return left is not None and left <= right


def op_gt(left: Any, right: Any) -> bool:
    return left is not None and left > right


def op_lt(left: Any, right: Any) -> bool:
    return left is not None and left < right


def op_in(left: Any, right: list[Any]) -> bool:
    if isinstance(left, list):
        return any(item in right for item in left)
    return left in right


OPERATORS = {
    "==": op_eq,
    "!=": op_ne,
    ">=": op_gte,
    "<=": op_lte,
    ">": op_gt,
    "<": op_lt,
    "in": op_in,
}
```

## 34.3 规则执行器

```python
from app.services.risk_engine.operators import OPERATORS
from app.services.risk_engine.evaluator import RuleHit, RiskEvaluationResult


RISK_PRIORITY = {
    "R0": 0,
    "R1": 1,
    "R2": 2,
    "R3": 3,
}


def get_nested_value(data: dict, field_path: str):
    current = data
    for part in field_path.split("."):
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)
    return current


class RiskRuleEvaluator:
    def __init__(self, rules: list[dict]):
        self.rules = sorted(rules, key=lambda item: item.get("priority", 100))

    def evaluate_condition(self, condition: dict, data: dict) -> bool:
        if "all" in condition:
            return all(self.evaluate_condition(item, data) for item in condition["all"])
        if "any" in condition:
            return any(self.evaluate_condition(item, data) for item in condition["any"])

        field = condition["field"]
        operator = condition["operator"]
        expected = condition["value"]

        actual = get_nested_value(data, field)
        fn = OPERATORS[operator]
        return fn(actual, expected)

    def evaluate(self, data: dict) -> RiskEvaluationResult:
        hits: list[RuleHit] = []
        max_risk = "R0"
        contraindications: list[str] = []
        intensity_limit: str | None = None

        for rule in self.rules:
            if not rule.get("enabled", True):
                continue

            matched = self.evaluate_condition(rule["condition"], data)
            if not matched:
                continue

            action = rule["action"]

            hit = RuleHit(
                rule_code=rule["code"],
                rule_name=rule["name"],
                risk_level=rule["risk_level"],
                message=rule["message"],
                priority=rule["priority"],
                action=action,
            )
            hits.append(hit)

            if RISK_PRIORITY[rule["risk_level"]] > RISK_PRIORITY[max_risk]:
                max_risk = rule["risk_level"]

            contraindications.extend(action.get("contraindications", []))

            if action.get("intensity_limit"):
                intensity_limit = action["intensity_limit"]

        if max_risk == "R3":
            return RiskEvaluationResult(
                risk_level="R3",
                allow_generate_prescription=False,
                allow_publish_directly=False,
                require_expert_review=True,
                hits=hits,
                contraindications=list(set(contraindications)),
                intensity_limit="禁止生成训练处方",
            )

        if max_risk == "R2":
            return RiskEvaluationResult(
                risk_level="R2",
                allow_generate_prescription=True,
                allow_publish_directly=False,
                require_expert_review=True,
                hits=hits,
                contraindications=list(set(contraindications)),
                intensity_limit=intensity_limit or "低-中等强度",
            )

        if max_risk == "R1":
            return RiskEvaluationResult(
                risk_level="R1",
                allow_generate_prescription=True,
                allow_publish_directly=True,
                require_expert_review=False,
                hits=hits,
                contraindications=list(set(contraindications)),
                intensity_limit=intensity_limit or "低-中等强度",
            )

        return RiskEvaluationResult(
            risk_level="R0",
            allow_generate_prescription=True,
            allow_publish_directly=True,
            require_expert_review=False,
            hits=hits,
            contraindications=[],
            intensity_limit=None,
        )
```

## 34.4 初始化规则示例

新建 `backend/app/services/risk_engine/rules_seed.py`：

```python
INITIAL_RISK_RULES = [
    {
        "code": "RED_CHEST_PAIN",
        "name": "近期胸痛或胸闷",
        "category": "red",
        "priority": 1,
        "risk_level": "R3",
        "enabled": True,
        "condition": {
            "field": "risk_screening.chest_pain",
            "operator": "==",
            "value": True,
        },
        "action": {
            "allow_generate_prescription": False,
            "require_expert_review": True,
            "contraindications": ["禁止生成训练计划", "建议医学评估"],
            "intensity_limit": "禁止运动训练处方",
        },
        "message": "存在胸痛或胸闷红色风险，系统不生成训练处方。",
    },
    {
        "code": "RED_HIGH_BP",
        "name": "静息血压达到红色阈值",
        "category": "red",
        "priority": 2,
        "risk_level": "R3",
        "enabled": True,
        "condition": {
            "any": [
                {"field": "fitness_test.sbp", "operator": ">=", "value": 180},
                {"field": "fitness_test.dbp", "operator": ">=", "value": 110},
            ]
        },
        "action": {
            "allow_generate_prescription": False,
            "require_expert_review": True,
            "contraindications": ["暂缓运动处方", "建议医学评估"],
            "intensity_limit": "禁止运动训练处方",
        },
        "message": "静息收缩压≥180mmHg或舒张压≥110mmHg，建议医学评估后再运动。",
    },
    {
        "code": "YELLOW_HYPERTENSION",
        "name": "稳定高血压",
        "category": "yellow",
        "priority": 20,
        "risk_level": "R2",
        "enabled": True,
        "condition": {
            "field": "risk_screening.has_hypertension",
            "operator": "==",
            "value": True,
        },
        "action": {
            "allow_generate_prescription": True,
            "require_expert_review": True,
            "contraindications": ["避免憋气", "避免大重量抗阻", "避免突然冲刺"],
            "intensity_limit": "低-中等强度",
        },
        "message": "存在高血压风险，生成谨慎型处方并进入专家审核。",
    },
    {
        "code": "YELLOW_PAIN_4_6",
        "name": "疼痛评分4-6分",
        "category": "yellow",
        "priority": 21,
        "risk_level": "R2",
        "enabled": True,
        "condition": {
            "all": [
                {"field": "fitness_test.pain_score", "operator": ">=", "value": 4},
                {"field": "fitness_test.pain_score", "operator": "<=", "value": 6},
            ]
        },
        "action": {
            "allow_generate_prescription": True,
            "require_expert_review": True,
            "contraindications": ["避免跳跃", "避免长跑", "避免大负荷深蹲"],
            "intensity_limit": "低强度起步",
        },
        "message": "疼痛评分较高，需要限制相关动作并进入专家审核。",
    },
]
```

------

# 35. 处方生成编排器代码

## 35.1 处方生成不能直接调 LLM

编程智能体必须实现 `PrescriptionOrchestrator`，让它串联风险、分型、模板、RAG、LLM 和安全校验。方案中技术架构明确采用“规则引擎 + RAG 知识库 + 大模型 + 专家审核”的组合，规则负责安全边界，RAG 提供专业依据，大模型生成个性化表达，专家审核中高风险人群。

新建 `backend/app/services/prescription/orchestrator.py`：

```python
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.services.health_profile_service import HealthProfileService
from app.services.risk_engine.evaluator import RiskRuleEvaluator
from app.services.clustering.service import ClusteringService
from app.services.prescription.template_matcher import TemplateMatcher
from app.services.rag.retriever import KnowledgeRetriever
from app.services.llm.base import LLMProvider
from app.services.prescription.safety_validator import PrescriptionSafetyValidator
from app.models.prescription import PrescriptionRecord
from app.models.enums import PrescriptionStatus


class PrescriptionOrchestrator:
    def __init__(
        self,
        db: Session,
        risk_evaluator: RiskRuleEvaluator,
        clustering_service: ClusteringService,
        template_matcher: TemplateMatcher,
        retriever: KnowledgeRetriever,
        llm_provider: LLMProvider,
        safety_validator: PrescriptionSafetyValidator,
    ):
        self.db = db
        self.risk_evaluator = risk_evaluator
        self.clustering_service = clustering_service
        self.template_matcher = template_matcher
        self.retriever = retriever
        self.llm_provider = llm_provider
        self.safety_validator = safety_validator

    def generate_for_user(self, user_id: int, operator_id: int) -> PrescriptionRecord:
        snapshot = HealthProfileService(self.db).get_latest_health_snapshot(user_id)
        input_data = self._serialize_snapshot(snapshot)

        risk_result = self.risk_evaluator.evaluate(input_data)

        if risk_result.risk_level == "R3":
            return self._create_r3_safety_record(
                user_id=user_id,
                risk_result=risk_result,
                operator_id=operator_id,
            )

        cluster_profile = self.clustering_service.classify_user(user_id, input_data)

        template = self.template_matcher.match(
            risk_level=risk_result.risk_level,
            cluster_label=cluster_profile.cluster_label,
            exercise_goal=input_data["profile"]["exercise_goal"],
        )

        evidence_chunks = self.retriever.retrieve_for_prescription(
            user_data=input_data,
            risk_result=risk_result,
            cluster_label=cluster_profile.cluster_label,
            template=template,
        )

        llm_output = self.llm_provider.generate_prescription(
            user_data=input_data,
            risk_result=risk_result,
            cluster_profile=cluster_profile,
            template=template,
            evidence_chunks=evidence_chunks,
        )

        safety_result = self.safety_validator.validate(
            prescription_json=llm_output,
            risk_result=risk_result,
            user_data=input_data,
        )

        if not safety_result.passed:
            status = PrescriptionStatus.RULE_REJECTED
        elif risk_result.require_expert_review:
            status = PrescriptionStatus.PENDING_REVIEW
        else:
            status = PrescriptionStatus.PUBLISHED

        record = PrescriptionRecord(
            user_id=user_id,
            template_id=template.id,
            risk_level=risk_result.risk_level,
            cluster_profile_id=cluster_profile.id,
            version=self._next_version(user_id),
            status=status,
            ai_generated_json=llm_output,
            final_prescription_json=llm_output if status == PrescriptionStatus.PUBLISHED else None,
            rule_check_result_json=safety_result.model_dump(),
            review_required=risk_result.require_expert_review,
            created_by=operator_id,
        )

        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        if status == PrescriptionStatus.PENDING_REVIEW:
            self._create_review_task(record)

        return record

    def _create_r3_safety_record(self, user_id: int, risk_result, operator_id: int):
        safety_json = {
            "risk_level": "R3",
            "title": "暂不生成训练处方",
            "message": "当前存在高风险信号，建议先进行医学评估或专业转介。",
            "risk_reasons": [hit.message for hit in risk_result.hits],
            "forbidden": [
                "不生成具体运动强度",
                "不生成训练动作",
                "不生成进阶计划",
            ],
        }

        record = PrescriptionRecord(
            user_id=user_id,
            template_id=None,
            risk_level="R3",
            version=self._next_version(user_id),
            status=PrescriptionStatus.RULE_REJECTED,
            ai_generated_json=safety_json,
            final_prescription_json=None,
            rule_check_result_json={
                "passed": False,
                "reason": "R3 risk, no training plan allowed",
            },
            review_required=True,
            created_by=operator_id,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def _serialize_snapshot(self, snapshot: dict) -> dict:
        def obj_to_dict(obj):
            if obj is None:
                return None
            return {
                column.name: getattr(obj, column.name)
                for column in obj.__table__.columns
            }

        return {
            "profile": obj_to_dict(snapshot["profile"]),
            "fitness_test": obj_to_dict(snapshot["fitness_test"]),
            "body_composition": obj_to_dict(snapshot.get("body_composition")),
            "biochemical_index": obj_to_dict(snapshot.get("biochemical_index")),
            "risk_screening": obj_to_dict(snapshot.get("risk_screening")),
        }

    def _next_version(self, user_id: int) -> int:
        latest = (
            self.db.query(PrescriptionRecord)
            .filter(PrescriptionRecord.user_id == user_id)
            .order_by(PrescriptionRecord.version.desc())
            .first()
        )
        return 1 if latest is None else latest.version + 1

    def _create_review_task(self, record: PrescriptionRecord):
        # 具体分配策略第一期可以分配给空闲专家；没有专家时保留待分配状态
        pass
```

------

# 36. LLM Provider 具体实现

## 36.1 抽象基类

新建 `backend/app/services/llm/base.py`：

```python
from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    def generate_prescription(
        self,
        user_data: dict,
        risk_result,
        cluster_profile,
        template,
        evidence_chunks: list[dict],
    ) -> dict:
        raise NotImplementedError
```

## 36.2 Mock Provider

先实现 Mock，保证没有大模型 key 时系统也能跑通完整业务。

```python
class MockLLMProvider:
    def generate_prescription(
        self,
        user_data: dict,
        risk_result,
        cluster_profile,
        template,
        evidence_chunks: list[dict],
    ) -> dict:
        return {
            "risk_level": risk_result.risk_level,
            "cluster_label": cluster_profile.cluster_label,
            "goal": user_data["profile"]["exercise_goal"],
            "summary": "根据当前数据生成运动处方初稿。",
            "prescription": {
                "frequency": "每周3-5次",
                "intensity": {
                    "level": risk_result.intensity_limit or "低-中等强度",
                    "heart_rate_range": "最大心率40%-70%",
                    "rpe": "4-6/10",
                },
                "time": "每次20-40分钟",
                "type": [
                    {
                        "name": "快走",
                        "duration": "20-30分钟",
                        "notes": "保持可完整说话，避免突然加速。",
                    }
                ],
                "volume": "每周累计90-150分钟",
                "progression": "每2周根据完成率、RPE和不适反馈调整。",
                "precautions": [hit.message for hit in risk_result.hits],
                "contraindications": risk_result.contraindications,
                "reassessment": "2-4周小评估，8-12周阶段评估。",
            },
            "review_required": risk_result.require_expert_review,
            "evidence_chunk_ids": [item["id"] for item in evidence_chunks],
        }
```

## 36.3 OpenAI-compatible Provider

```python
import json
import httpx
from app.core.config import settings
from app.services.llm.prompts import build_prescription_prompt
from app.services.llm.output_schema import validate_prescription_output


class OpenAICompatibleProvider:
    def generate_prescription(
        self,
        user_data: dict,
        risk_result,
        cluster_profile,
        template,
        evidence_chunks: list[dict],
    ) -> dict:
        messages = build_prescription_prompt(
            user_data=user_data,
            risk_result=risk_result,
            cluster_profile=cluster_profile,
            template=template,
            evidence_chunks=evidence_chunks,
        )

        response = httpx.post(
            f"{settings.LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {settings.LLM_API_KEY}"},
            json={
                "model": settings.LLM_MODEL,
                "messages": messages,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=60,
        )
        response.raise_for_status()

        content = response.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)

        return validate_prescription_output(parsed)
```

------

# 37. 输出 JSON Schema 校验

新建 `backend/app/services/llm/output_schema.py`：

```python
from pydantic import BaseModel, Field


class IntensitySchema(BaseModel):
    level: str
    heart_rate_range: str | None = None
    rpe: str | None = None


class ExerciseItemSchema(BaseModel):
    name: str
    duration: str
    notes: str | None = None


class PrescriptionBodySchema(BaseModel):
    frequency: str
    intensity: IntensitySchema
    time: str
    type: list[ExerciseItemSchema]
    volume: str
    progression: str
    precautions: list[str]
    contraindications: list[str]
    reassessment: str


class PrescriptionOutputSchema(BaseModel):
    risk_level: str
    cluster_label: str | None = None
    goal: list[str]
    summary: str
    prescription: PrescriptionBodySchema | None = None
    review_required: bool
    evidence_chunk_ids: list[int] = Field(default_factory=list)


def validate_prescription_output(data: dict) -> dict:
    parsed = PrescriptionOutputSchema.model_validate(data)
    return parsed.model_dump()
```

------

# 38. 安全校验器代码

大模型输出后必须二次校验，不能直接发布。

新建 `backend/app/services/prescription/safety_validator.py`：

```python
from pydantic import BaseModel


class SafetyValidationResult(BaseModel):
    passed: bool
    errors: list[str] = []
    warnings: list[str] = []


class PrescriptionSafetyValidator:
    def validate(
        self,
        prescription_json: dict,
        risk_result,
        user_data: dict,
    ) -> SafetyValidationResult:
        errors = []
        warnings = []

        if risk_result.risk_level == "R3":
            if prescription_json.get("prescription"):
                errors.append("R3用户禁止生成具体训练处方")
            return SafetyValidationResult(passed=len(errors) == 0, errors=errors)

        prescription = prescription_json.get("prescription")
        if not prescription:
            errors.append("非R3用户处方内容不能为空")
            return SafetyValidationResult(passed=False, errors=errors)

        intensity_text = str(prescription.get("intensity", {}))
        type_text = str(prescription.get("type", []))
        progression_text = prescription.get("progression", "")

        if risk_result.risk_level == "R2":
            banned_terms = ["高强度", "HIIT", "冲刺", "大重量", "极限"]
            for term in banned_terms:
                if term in intensity_text or term in type_text or term in progression_text:
                    errors.append(f"R2用户处方中出现禁用内容: {term}")

        for contraindication in risk_result.contraindications:
            if "避免跳跃" in contraindication and "跳" in type_text:
                errors.append("用户存在跳跃禁忌，但处方中包含跳跃类动作")
            if "避免长跑" in contraindication and "长跑" in type_text:
                errors.append("用户存在长跑禁忌，但处方中包含长跑")

        if "reassessment" not in prescription:
            warnings.append("缺少复测周期说明")

        return SafetyValidationResult(
            passed=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )
```

------

# 39. 专家审核后端实现

## 39.1 审核 Service

新建 `backend/app/services/review_service.py`：

```python
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.review import ExpertReview
from app.models.prescription import PrescriptionRecord
from app.models.enums import PrescriptionStatus, ReviewStatus


class ReviewService:
    def __init__(self, db: Session):
        self.db = db

    def list_my_reviews(self, expert_id: int, status_filter: str | None = None):
        query = self.db.query(ExpertReview).filter(
            ExpertReview.assigned_expert_id == expert_id
        )
        if status_filter:
            query = query.filter(ExpertReview.review_status == status_filter)
        return query.order_by(ExpertReview.created_at.desc()).all()

    def start_review(self, review_id: int, expert_id: int):
        review = self._get_review_for_expert(review_id, expert_id)
        review.review_status = ReviewStatus.IN_PROGRESS
        self.db.commit()
        self.db.refresh(review)
        return review

    def approve(
        self,
        review_id: int,
        expert_id: int,
        modified_prescription_json: dict,
        comment: str,
    ):
        review = self._get_review_for_expert(review_id, expert_id)
        prescription = self.db.get(PrescriptionRecord, review.prescription_id)

        if prescription.risk_level == "R3":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="R3用户不能发布训练处方",
            )

        prescription.final_prescription_json = modified_prescription_json
        prescription.status = PrescriptionStatus.PUBLISHED

        review.review_status = ReviewStatus.APPROVED
        review.review_result = "APPROVED"
        review.review_comment = comment
        review.modified_prescription_json = modified_prescription_json

        self.db.commit()
        self.db.refresh(review)
        return review

    def reject(self, review_id: int, expert_id: int, comment: str):
        review = self._get_review_for_expert(review_id, expert_id)
        prescription = self.db.get(PrescriptionRecord, review.prescription_id)

        prescription.status = PrescriptionStatus.EXPERT_REJECTED
        review.review_status = ReviewStatus.REJECTED
        review.review_result = "REJECTED"
        review.review_comment = comment

        self.db.commit()
        self.db.refresh(review)
        return review

    def transfer(self, review_id: int, expert_id: int, comment: str):
        review = self._get_review_for_expert(review_id, expert_id)
        prescription = self.db.get(PrescriptionRecord, review.prescription_id)

        prescription.status = PrescriptionStatus.RULE_REJECTED
        review.review_status = ReviewStatus.TRANSFER_RECOMMENDED
        review.review_result = "TRANSFER_RECOMMENDED"
        review.review_comment = comment

        self.db.commit()
        self.db.refresh(review)
        return review

    def _get_review_for_expert(self, review_id: int, expert_id: int):
        review = self.db.get(ExpertReview, review_id)
        if not review or review.assigned_expert_id != expert_id:
            raise HTTPException(status_code=404, detail="审核任务不存在")
        return review
```

------

# 40. API Router 实现样例

## 40.1 处方生成接口

新建 `backend/app/api/v1/endpoints/prescriptions.py`：

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.services.factory import get_prescription_orchestrator
from app.schemas.prescription import PrescriptionRead

router = APIRouter()


@router.post("/generate", response_model=PrescriptionRead)
def generate_prescription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    orchestrator = get_prescription_orchestrator(db)
    return orchestrator.generate_for_user(
        user_id=current_user.id,
        operator_id=current_user.id,
    )


@router.get("/me", response_model=list[PrescriptionRead])
def list_my_prescriptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(PrescriptionRecord)
        .filter(PrescriptionRecord.user_id == current_user.id)
        .order_by(PrescriptionRecord.created_at.desc())
        .all()
    )
```

------

# 41. 前端交互设计总原则

前端不要做成管理后台表格拼接。必须按照角色提供不同产品体验：

```text
普通用户：向导式、少术语、强调安全提示、能理解处方。
专家：信息密度高、强调风险命中、AI 初稿、修改对比、快速审核。
管理员：配置型、统计型、可追溯。
科研人员：脱敏导出、分型统计、干预效果分析。
```

方案中明确要求面向用户端、专家端、管理端、科研端提供服务，并通过专家端支持审核、修改、发布和追踪处方。

------

# 42. 前端目录结构

```text
frontend/
  src/
    main.tsx
    app/
      router.tsx
      providers.tsx
    api/
      client.ts
      auth.ts
      healthData.ts
      risk.ts
      prescriptions.ts
      expertReviews.ts
      feedback.ts
      admin.ts
    components/
      layout/
        AppLayout.tsx
        RoleBasedSidebar.tsx
        PageHeader.tsx
      common/
        LoadingState.tsx
        EmptyState.tsx
        ErrorState.tsx
        ConfirmDialog.tsx
        RiskBadge.tsx
        StatusBadge.tsx
      prescription/
        FittVpCard.tsx
        PrescriptionTimeline.tsx
        ContraindicationList.tsx
        EvidencePanel.tsx
      forms/
        BasicProfileForm.tsx
        FitnessTestForm.tsx
        BodyCompositionForm.tsx
        BiochemicalForm.tsx
        RiskScreeningForm.tsx
        FeedbackForm.tsx
    pages/
      auth/
        LoginPage.tsx
        RegisterPage.tsx
      user/
        UserDashboardPage.tsx
        OnboardingWizardPage.tsx
        RiskResultPage.tsx
        PrescriptionListPage.tsx
        PrescriptionDetailPage.tsx
        TodayExercisePage.tsx
        FeedbackPage.tsx
      expert/
        ExpertDashboardPage.tsx
        ReviewListPage.tsx
        ReviewDetailPage.tsx
      admin/
        AdminDashboardPage.tsx
        RuleListPage.tsx
        RuleEditorPage.tsx
        TemplateListPage.tsx
        KnowledgePage.tsx
        ExerciseLibraryPage.tsx
      researcher/
        ResearchExportPage.tsx
    hooks/
      useAuth.ts
      useCurrentUser.ts
      useRoleGuard.ts
      usePrescription.ts
      useHealthData.ts
    types/
      user.ts
      healthData.ts
      prescription.ts
      review.ts
      rule.ts
```

------

# 43. 普通用户端具体交互

## 43.1 用户首页 `/user/dashboard`

页面目标：告诉用户下一步该干什么。

### 页面布局

```text
顶部：
- 平台 Logo
- 当前用户
- 退出按钮

主区域：
1. 健康档案完成度卡片
2. 当前风险等级卡片
3. 最新处方卡片
4. 今日运动任务卡片
5. 运动反馈入口
```

### 状态逻辑

```text
没有基础档案：
  显示「开始建档」按钮 → /user/onboarding

有基础档案但没有风险筛查：
  显示「继续完成风险问卷」

已完成数据但没有处方：
  显示「生成运动处方」按钮

处方为 PENDING_REVIEW：
  显示「处方正在专家审核中」

处方为 PUBLISHED：
  显示「查看我的处方」和「开始今日运动」

处方为 RULE_REJECTED 且 R3：
  显示红色安全提示，不显示训练入口
```

------

## 43.2 建档向导 `/user/onboarding`

必须采用 Stepper，不允许把所有字段堆到一个页面。

```text
Step 1：知情同意
Step 2：基础信息
Step 3：体质测试
Step 4：身体成分，可跳过
Step 5：生化指标，可跳过
Step 6：疾病与运动风险问卷
Step 7：提交并生成风险结果
```

### Step 1：知情同意

文案：

```text
本平台提供运动健康指导、风险提示、运动处方建议和运动干预跟踪服务，不替代医疗诊断、药物治疗和临床处置。若您存在胸痛、晕厥、严重气短、血压显著异常、急性损伤或医生明确限制运动，请先进行医学评估。
```

按钮：

```text
[不同意，退出]
[我已阅读并同意]
```

点击同意后写入：

```http
POST /api/v1/consents
```

### Step 2：基础信息表单

字段分组：

```text
身份信息：
- 姓名
- 性别
- 出生日期

身体指标：
- 身高
- 体重
- 腰围
- 臀围

生活方式：
- 职业类型
- 日均久坐时间
- 睡眠时长

运动目标：
- 减脂
- 降血压
- 控糖
- 增强心肺
- 增肌
- 改善柔韧
- 改善平衡
- 康复恢复
- 体质提升

运动基础：
- 当前运动习惯
- 运动经验
```

交互细节：

```text
用户输入身高体重后，前端实时计算 BMI。
BMI 只展示，不允许用户手改。
输入腰围臀围后，实时计算腰臀比。
表单底部显示「保存并下一步」。
保存成功后 toast：「基础信息已保存」。
保存失败时定位到第一个错误字段。
```

------

## 43.3 风险结果页 `/user/risk-result`

### 页面内容

```text
1. 风险等级卡片
2. 命中规则列表
3. 系统处理结果
4. 下一步按钮
```

### 不同风险等级展示

```text
R0：
  绿色徽标：普通健康型
  文案：可自动生成基础运动处方
  按钮：生成我的运动处方

R1：
  蓝色徽标：低风险改善型
  文案：可生成改善型处方，平台可能进行专家抽查
  按钮：生成我的运动处方

R2：
  橙色徽标：中风险干预型
  文案：AI 将生成谨慎型处方初稿，必须专家审核后才能发布
  按钮：提交专家审核

R3：
  红色徽标：高风险转介型
  文案：当前不适合直接生成训练处方，建议医学评估或专业转介
  按钮：查看安全建议
  禁止显示「开始训练」
```

------

## 43.4 处方详情页 `/user/prescriptions/:id`

页面使用 FITT-VP 卡片：

```text
处方摘要：
- 风险等级
- 人群标签
- 目标
- 执行周期
- 状态

FITT-VP：
- 频率 Frequency
- 强度 Intensity
- 时间 Time
- 类型 Type
- 总量 Volume
- 进阶 Progression

安全提醒：
- 注意事项
- 禁忌动作
- 何时停止运动
- 复测周期

底部按钮：
- 下载处方报告
- 开始今日运动
```

如果状态不是 `PUBLISHED`：

```text
PENDING_REVIEW：
  显示「专家审核中，暂不可执行」

RULE_REJECTED：
  显示「当前未生成可执行训练处方」

EXPERT_REJECTED：
  显示「专家已驳回，请等待重新生成或补充数据」
```

------

# 44. 专家端具体交互

## 44.1 审核列表 `/expert/reviews`

表格列：

```text
用户
年龄 / 性别
风险等级
人群标签
处方状态
命中规则数量
创建时间
等待时长
操作
```

筛选器：

```text
风险等级：R2 / R3 / 全部
状态：待审核 / 审核中 / 已通过 / 已驳回 / 建议转介
人群标签
创建时间
```

操作：

```text
[查看审核]
[开始审核]
```

------

## 44.2 审核详情 `/expert/reviews/:id`

页面三栏布局：

```text
左栏：用户画像
中栏：AI 处方初稿编辑器
右栏：风险规则与证据
```

### 左栏：用户画像

```text
基础信息：
- 年龄、性别、BMI、腰围、运动目标

体质测试：
- 血压、静息心率、疼痛评分、握力、平衡、心肺指标

身体成分：
- 体脂率、骨骼肌量、内脏脂肪等级

生化指标：
- 血糖、血脂、血氧

风险问卷：
- 慢病史
- 用药
- 红旗症状
```

### 中栏：处方编辑器

采用结构化编辑，不允许专家只编辑一整段富文本。

```text
运动目标：多选
频率：输入框
强度：输入框 + 推荐标签
时间：输入框
运动类型：可添加多项
总量：输入框
进阶方式：多行文本
注意事项：Tag 编辑
禁忌动作：Tag 编辑
复测周期：输入框
```

按钮：

```text
[保存草稿]
[批准并发布]
[驳回重生成]
[建议医学评估 / 转介]
```

点击批准前弹出确认：

```text
请确认你已审核用户风险信息、处方强度、禁忌动作和复测周期。发布后用户将可以执行该处方。
```

------

# 45. 管理端规则编辑器交互

## 45.1 规则列表 `/admin/rules`

列：

```text
规则名称
规则编码
风险等级
分类
优先级
是否启用
更新时间
操作
```

操作：

```text
[编辑]
[复制]
[禁用]
[测试规则]
```

## 45.2 规则编辑器

左侧表单：

```text
规则名称
规则编码
分类
风险等级
优先级
提示文案
是否启用
```

右侧 JSON 编辑器：

```json
{
  "condition": {
    "any": [
      {
        "field": "fitness_test.sbp",
        "operator": ">=",
        "value": 180
      },
      {
        "field": "fitness_test.dbp",
        "operator": ">=",
        "value": 110
      }
    ]
  },
  "action": {
    "allow_generate_prescription": false,
    "require_expert_review": true,
    "contraindications": ["暂缓运动处方", "建议医学评估"]
  }
}
```

底部提供测试区：

```text
粘贴用户健康数据 JSON
点击「运行规则测试」
显示：
- 是否命中
- 输出风险等级
- 输出动作
- 错误信息
```

------

# 46. 前端 API Client 示例

新建 `frontend/src/api/client.ts`：

```ts
import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1",
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
```

新建 `frontend/src/api/prescriptions.ts`：

```ts
import { apiClient } from "./client";

export async function generatePrescription() {
  const res = await apiClient.post("/prescriptions/generate");
  return res.data;
}

export async function listMyPrescriptions() {
  const res = await apiClient.get("/prescriptions/me");
  return res.data;
}

export async function getPrescription(id: string) {
  const res = await apiClient.get(`/prescriptions/${id}`);
  return res.data;
}
```

------

# 47. 前端页面代码示例：生成处方按钮

```tsx
import { useMutation } from "@tanstack/react-query";
import { generatePrescription } from "@/api/prescriptions";
import { useNavigate } from "react-router-dom";

export function GeneratePrescriptionButton() {
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: generatePrescription,
    onSuccess: (data) => {
      if (data.status === "PENDING_REVIEW") {
        navigate(`/user/prescriptions/${data.id}?notice=pending_review`);
      } else if (data.risk_level === "R3") {
        navigate(`/user/prescriptions/${data.id}?notice=r3_safety`);
      } else {
        navigate(`/user/prescriptions/${data.id}`);
      }
    },
  });

  return (
    <button
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      className="rounded-xl px-4 py-2 bg-blue-600 text-white disabled:opacity-50"
    >
      {mutation.isPending ? "正在生成处方..." : "生成我的运动处方"}
    </button>
  );
}
```

------

# 48. 运动打卡交互实现

## 48.1 今日运动页 `/user/today`

页面内容：

```text
今日建议：
- 运动类型
- 推荐时长
- 推荐强度
- 注意事项
- 禁忌动作

运动前确认：
- 今天是否有胸痛 / 头晕 / 明显气短？
- 是否有疼痛明显加重？
- 是否有医生新限制？

若任何问题选择「是」：
  禁止开始运动
  显示「建议暂停运动并联系专家」
  POST /api/v1/feedback/pre-check-alert
```

## 48.2 打卡表单

字段：

```text
运动日期
运动项目
运动时长
实际强度
平均心率
最高心率
RPE
完成率
是否不适
不适描述
运动后疼痛评分
运动前血压，可选
运动后血压，可选
运动前血糖，可选
运动后血糖，可选
```

运动反馈数据用于动态运动处方，是平台区别于普通问卷系统和一次性处方系统的关键；反馈字段包括处方编号、运动日期、运动项目、频率、时长、强度、平均心率、最高心率、血压、血糖等。

------

# 49. 动态调整 Service 代码

新建 `backend/app/services/feedback_service.py`：

```python
class FeedbackAdjustmentResult:
    def __init__(self, action: str, reasons: list[str], require_review: bool):
        self.action = action
        self.reasons = reasons
        self.require_review = require_review


class FeedbackService:
    def evaluate_adjustment(self, prescription_id: int, recent_feedback: list[dict]):
        if not recent_feedback:
            return FeedbackAdjustmentResult(
                action="MAINTAIN",
                reasons=["暂无反馈数据，维持原处方"],
                require_review=False,
            )

        reasons = []
        require_review = False
        action = "MAINTAIN"

        avg_completion = sum(item["completion_rate"] for item in recent_feedback) / len(recent_feedback)
        avg_rpe = sum(item["rpe"] for item in recent_feedback if item.get("rpe") is not None) / max(
            1, len([item for item in recent_feedback if item.get("rpe") is not None])
        )

        if any(item.get("discomfort") for item in recent_feedback):
            action = "PAUSE_AND_REVIEW"
            require_review = True
            reasons.append("用户反馈存在运动不适")

        if any(item.get("pain_score_after", 0) >= 7 for item in recent_feedback):
            action = "PAUSE_AND_REVIEW"
            require_review = True
            reasons.append("运动后疼痛评分达到高风险范围")

        if avg_completion < 50:
            action = "DOWNGRADE"
            reasons.append("近期完成率低于50%，建议降低频率或时长")

        if avg_rpe >= 8:
            action = "DOWNGRADE"
            reasons.append("近期RPE偏高，建议降低强度")

        if avg_completion >= 80 and avg_rpe <= 6 and not require_review:
            action = "PROGRESS"
            reasons.append("完成率较好且主观强度可接受，可小幅进阶")

        return FeedbackAdjustmentResult(
            action=action,
            reasons=reasons,
            require_review=require_review,
        )
```

------

# 50. 报告导出实现要求

第一期必须支持处方报告 PDF 或 Word 导出，因为 MVP 功能清单中明确包含“处方报告导出”。

后端接口：

```http
GET /api/v1/prescriptions/{id}/report.pdf
GET /api/v1/prescriptions/{id}/report.docx
```

报告内容：

```text
1. 用户基础摘要
2. 风险等级
3. 命中风险规则
4. 人群分型
5. FITT-VP 处方
6. 注意事项
7. 禁忌动作
8. 复测周期
9. 专家审核信息
10. 免责声明
```

------

# 51. 开源系统对接落地任务

这部分要写成智能体的具体任务，不只是“可以借鉴”。

## 51.1 借鉴 full-stack-fastapi-template

该模板使用 FastAPI、React、SQLModel、PostgreSQL、Docker、GitHub Actions、OpenAPI、Traefik 等，适合参考本项目的工程骨架和部署结构。([GitHub](https://github.com/fastapi/full-stack-fastapi-template?utm_source=chatgpt.com))

智能体执行：

```bash
mkdir external_references
cd external_references
git clone https://github.com/fastapi/full-stack-fastapi-template.git
```

然后只参考，不直接复制业务代码。迁移重点：

```text
1. Docker Compose 组织方式
2. 环境变量命名方式
3. 后端 / 前端分离方式
4. GitHub Actions 测试流程
5. OpenAPI 文档暴露方式
```

## 51.2 借鉴 free-exercise-db

该项目提供 800+ 运动动作 JSON 数据和可搜索前端，并采用 Unlicense。([GitHub](https://github.com/yuhonas/free-exercise-db?utm_source=chatgpt.com))

智能体执行：

```bash
cd external_references
git clone https://github.com/yuhonas/free-exercise-db.git
```

写导入脚本：

```python
import json
from pathlib import Path


def map_difficulty(value: str) -> str:
    mapping = {
        "beginner": "初级",
        "intermediate": "中级",
        "expert": "高级",
    }
    return mapping.get(value, "未知")


def map_impact_level(exercise: dict) -> str:
    name = exercise.get("name", "").lower()
    category = exercise.get("category", "").lower()

    if any(keyword in name for keyword in ["jump", "burpee", "sprint"]):
        return "high"
    if category in ["stretching"]:
        return "low"
    return "medium"


def transform_exercise(raw: dict) -> dict:
    return {
        "source": "free-exercise-db",
        "source_exercise_id": raw.get("id"),
        "name_en": raw.get("name"),
        "name_cn": None,
        "category": raw.get("category"),
        "exercise_type": raw.get("category"),
        "primary_muscles": raw.get("primaryMuscles", []),
        "secondary_muscles": raw.get("secondaryMuscles", []),
        "equipment": raw.get("equipment"),
        "difficulty_level": map_difficulty(raw.get("level")),
        "instruction_cn": None,
        "instruction_en": "\n".join(raw.get("instructions", [])),
        "image_urls": raw.get("images", []),
        "impact_level": map_impact_level(raw),
        "suitable_risk_levels": ["R0", "R1"],
        "contraindication_tags": [],
        "status": "PENDING_REVIEW",
    }


def main():
    source_file = Path("external_references/free-exercise-db/dist/exercises.json")
    data = json.loads(source_file.read_text())

    transformed = [transform_exercise(item) for item in data]

    output_file = Path("backend/app/scripts/seed_data/exercises_import.json")
    output_file.write_text(
        json.dumps(transformed, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
```

注意：导入后的动作默认 `PENDING_REVIEW`，管理员必须审核后才允许进入处方模板。

## 51.3 借鉴 Open Wearables

Open Wearables 提供统一 API 连接多个可穿戴设备和健身平台，并对健康数据做标准化，适合作为本系统后续设备接入参考。([GitHub](https://github.com/the-momentum/open-wearables?utm_source=chatgpt.com))

第一期不直接强依赖它，但预留接口：

```http
POST /api/v1/device-connections
POST /api/v1/device-sync/webhook
GET  /api/v1/wearable-metrics/me
```

内部统一成：

```ts
type WearableMetric = {
  source: string;
  metric_type:
    | "heart_rate"
    | "steps"
    | "active_minutes"
    | "sleep_duration"
    | "workout_duration"
    | "avg_hr"
    | "max_hr";
  metric_value: number;
  unit: string;
  measured_at: string;
};
```

------

# 52. 必须实现的端到端用户路径

智能体完成后，必须能跑通以下完整路径：

## 路径 A：R0 用户自动生成处方

```text
1. 注册普通用户
2. 完成知情同意
3. 填写基础信息
4. 填写体质测试：血压正常、无疼痛
5. 填写风险问卷：无胸痛、无晕厥、无慢病
6. 点击生成处方
7. 系统判定 R0
8. 系统生成 FITT-VP 处方
9. 状态为 PUBLISHED
10. 用户可查看处方
11. 用户可打卡
```

## 路径 B：R2 用户进入专家审核

```text
1. 用户填写高血压病史
2. 当前血压未达到 R3
3. 系统判定 R2
4. AI 生成谨慎型处方初稿
5. 状态为 PENDING_REVIEW
6. 用户端显示「专家审核中」
7. 专家登录
8. 专家查看审核任务
9. 专家修改处方
10. 专家批准发布
11. 用户端可查看正式处方
```

## 路径 C：R3 用户禁止生成训练处方

```text
1. 用户填写胸痛 = 是
2. 点击生成处方
3. 系统判定 R3
4. 系统不得调用训练处方生成 prompt
5. 系统保存安全提醒记录
6. 用户端只显示医学评估建议
7. 不显示「开始运动」
8. 专家端可查看转介任务
```

------

# 53. 测试代码示例

新建 `backend/app/tests/unit/test_risk_engine.py`：

```python
from app.services.risk_engine.evaluator import RiskRuleEvaluator
from app.services.risk_engine.rules_seed import INITIAL_RISK_RULES


def test_r3_chest_pain():
    evaluator = RiskRuleEvaluator(INITIAL_RISK_RULES)

    data = {
        "risk_screening": {
            "chest_pain": True,
            "has_hypertension": False,
        },
        "fitness_test": {
            "sbp": 120,
            "dbp": 80,
            "pain_score": 0,
        },
    }

    result = evaluator.evaluate(data)

    assert result.risk_level == "R3"
    assert result.allow_generate_prescription is False
    assert result.require_expert_review is True


def test_r3_high_bp():
    evaluator = RiskRuleEvaluator(INITIAL_RISK_RULES)

    data = {
        "risk_screening": {
            "chest_pain": False,
            "has_hypertension": True,
        },
        "fitness_test": {
            "sbp": 182,
            "dbp": 90,
            "pain_score": 0,
        },
    }

    result = evaluator.evaluate(data)

    assert result.risk_level == "R3"
    assert result.allow_generate_prescription is False


def test_r2_hypertension():
    evaluator = RiskRuleEvaluator(INITIAL_RISK_RULES)

    data = {
        "risk_screening": {
            "chest_pain": False,
            "has_hypertension": True,
        },
        "fitness_test": {
            "sbp": 145,
            "dbp": 88,
            "pain_score": 0,
        },
    }

    result = evaluator.evaluate(data)

    assert result.risk_level == "R2"
    assert result.allow_generate_prescription is True
    assert result.require_expert_review is True
```

------

# 54. 智能体最终验收命令

智能体完成后，必须在 README 中写清并实际通过：

```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_initial_data.py
docker compose exec backend pytest
```

前端：

```bash
cd frontend
npm install
npm run lint
npm run test
npm run build
```

浏览器验收：

```text
http://localhost:5173/login
http://localhost:5173/user/dashboard
http://localhost:5173/expert/reviews
http://localhost:5173/admin/dashboard
```

API 验收：

```text
GET /health → {"status": "ok"}
GET /api/v1/openapi.json → 返回 OpenAPI JSON
```

------

# 55. 给编程智能体的最终执行指令

你必须从空仓库开始实现，不要跳过任何核心业务流程。实现顺序如下：

```text
第一步：搭建 FastAPI + React + PostgreSQL + Redis + Docker 工程。
第二步：完成认证、角色权限、机构和专家账户。
第三步：完成六类数据采集表单和接口。
第四步：完成风险规则引擎，确保 R3 永远不能生成训练处方。
第五步：完成规则分型和基础聚类接口。
第六步：完成处方模板、动作库和知识库。
第七步：完成 RAG 检索和 LLM Provider。
第八步：完成处方生成编排器。
第九步：完成专家审核工作台。
第十步：完成用户运动打卡和动态调整。
第十一步：完成管理后台、规则编辑器、知识库管理。
第十二步：完成报告导出、科研脱敏导出。
第十三步：完成测试、Docker 生产部署、上线文档。
```

最终产品必须达到：

```text
用户能真实建档；
系统能真实风险分级；
AI 能在规则约束下生成结构化运动处方；
R2 必须专家审核；
R3 禁止生成训练计划；
专家能修改发布；
用户能执行反馈；
系统能根据反馈调整；
管理员能配置规则和知识库；
科研人员能导出脱敏数据；
整套系统能用 Docker 上线运行。
```