# AI 个性化运动处方平台参考资料缺口分析 v0.1

检索日期：2026-06-01
本地目录：`/Users/zhaosilei/Documents/Exercise Prescription Sys/rag_data`

## 结论摘要

当前知识库已经覆盖 WHO 身体活动指南、PAR-Q+、Exercise is Medicine 运动前筛查、中国 2024 慢病营养和运动指导原则、国民体质测定标准、部分慢病指南、部分 ACSM 参考书和少量传统功法材料。用户已确认 ACSM 教材/参考书也允许入库，因此 `80_reference_books_limited` 已纳入 RAG 白名单。

仍建议不要使用 Z-Library、盗版教材下载站、论坛求书、网盘搬运版作为资料来源。对于 ACSM、NSCA、AACVPR、Human Kinetics、Wolters Kluwer 等受版权保护教材，应以「已购电子书/纸书扫描件/机构授权」为入库前提；若用于对外商业系统，需要保留采购或授权记录。

## 本地已有参考书

| 状态 | 文件 | 判断 |
|---|---|---|
| 已有 | `ACSM_2025_guidelines_for_exercise_testing_and_prescription_12th_edition_reference_only.pdf` | 核心主教材，已可入库；建议记录采购/授权来源。 |
| 已有但可能较旧 | `ACSM_resources_for_personal_trainer_5th_reference_only.pdf` | ACSM CPT 资源已有第 5 版，但官方当前重点为第 6 版。 |
| 已有但可能较旧 | `ACSM_certification_review_5th_reference_only.pdf` | 当前官方页为第 6 版，建议补新版或只作旧版参考。 |
| 已有 | `ACSM_complete_guide_to_fitness_health_2nd_reference_only.pdf` | 面向健康体适能和大众健康，适合辅助库。 |
| 已有 | `ACSM_foundations_of_strength_training_conditioning_reference_only.pdf` | 可支撑力量训练，但缺 NSCA 系列作为动作技术和周期化补强。 |
| 已有 | `ACSM_health_fitness_facility_standards_guidelines_reference_only.pdf` | 适合设施安全、免责声明、服务边界。 |
| 已有 | `ACSM_exercise_for_older_adults_chinese_reference_only.pdf` | 适合老年处方，但需与 WHO 跌倒、老年肌少症资料互校。 |
| 已有 | `ACSM_8th_exercise_testing_prescription_chinese_reference_only.pdf` / `ACSM_exercise_testing_and_prescription_guidelines_chinese_reference_only.pdf` | 中文旧版可做术语参考，不宜覆盖第 12 版主规则。 |
| 已有 | `Physical_activity_and_health_the_evidence_explained_reference_only.pdf` | 适合证据解释、用户报告科普，不作为处方规则主源。 |

## 优先缺口清单

| 优先级 | 资料名称 | 来源机构/出版方 | 官方链接 | 当前状态 | 适合模块 | 授权/处理建议 | 缺口说明 |
|---|---|---|---|---|---|---|---|
| P0 | ACSM's Resources for the Exercise Physiologist, 3rd Edition | ACSM / Wolters Kluwer | [ACSM 页面](https://acsm.org/education-resources/books/resources-exercise-physiologist/) / [Wolters Kluwer](https://www.wolterskluwer.com/en/know/acsm/exercise-physiologist) | 缺失 | 风险筛查、FITT-VP、特殊人群、行为改变 | 需购买/授权；全文入库需采购记录 | 当前有 GETP，但缺 EP 认证体系下更完整的评估、编程、特殊人群和行为改变内容。 |
| P0 | ACSM's Clinical Exercise Physiology, 2nd Edition | ACSM / Wolters Kluwer | [ACSM Q&A](https://acsm.org/all-blog-posts/acsm-blog/acsm-blog/2024/04/29/acsm-s-clinical-exercise-physiology--2nd-edition--q-a-with-the-editors) / [LWW](https://shop.lww.com/ACSM-s-Clinical-Exercise-Physiology/p/9781975196790) | 缺失 | 慢病干预、临床禁忌、专家审核依据 | 需购买/授权；P0 采购 | 对 35+ 临床状况给出运动干预逻辑和 FITT 表，是慢病处方平台的关键临床层。 |
| P0 | ACSM's Exercise Management for Persons With Chronic Diseases and Disabilities, 4th Edition | ACSM / Human Kinetics | [Human Kinetics](https://us.humankinetics.com/products/acsms-exercise-management-for-persons-with-chronic-diseases-and-disabilities-4th) | 缺失 | 慢病干预、禁忌动作、适应症/转诊 | 需购买/授权；P0 采购 | 覆盖慢病和残障人群，是当前中文慢病资料之外的重要横向补强。 |
| P0 | ACSM's Fitness Assessment Manual, 6th Edition | ACSM | [ACSM 页面](https://acsm.org/education-resources/books/fitness-assessment-manual/) | 缺失 | 体质测试、评估解释、处方前测 | 需购买/授权 | 当前有国民体质标准，但缺 ACSM 体适能测试实验室手册和测试解释体系。 |
| P1 | ACSM's Resources for the Personal Trainer, 6th Edition | ACSM | [ACSM 页面](https://acsm.org/education-resources/books/resources-personal-trainer/) | 已有第 5 版，缺第 6 版 | 处方生成、动作库、特殊人群 | 需购买/授权；替换或并存 | 第 6 版更新客户筛查、训练计划和特殊人群，建议升级。 |
| P2 | ACSM's Certification Review, 6th Edition | ACSM | [ACSM 页面](https://acsm.org/education-resources/books/certification-review/) | 已有第 5 版，缺第 6 版 | 专家审核依据、题库式校验 | 需购买/授权；摘要或元数据为主 | 适合校验知识点覆盖，不是处方规则主源。 |
| P1 | ACSM's Exercise Testing and Prescription, 2nd Edition | ACSM | [ACSM 页面](https://chapters.acsm.org/education-resources/books/exercise-testing-prescription) | 缺失 | FITT-VP、案例、特殊人群 | 需购买/授权 | 比 GETP 更教材化，有案例和 FITT 表，适合 RAG 解释生成。 |
| P2 | ACSM's Essentials of Exercise Oncology | ACSM | [ACSM 页面](https://acsm.org/education-resources/books/essentials-exercise-oncology/) | 缺失 | 肿瘤康复、慢病扩展、禁忌 | 需购买/授权 | 如果平台未来覆盖肿瘤康复，应补；第一版可 P2。 |
| P2 | Preparticipation Physical Evaluation Monograph, 5th Edition | ACSM 等 | [ACSM 页面](https://corkscrew.acsm.org/education-resources/books/preparticipation-physical-evaluation-monograph/) | 缺失 | 学校体育、青少年运动风险筛查 | 需购买/授权 | 学校体育和青少年运动资格筛查可用。 |
| P0 | Guidelines for Cardiac Rehabilitation and Secondary Prevention Programs, 6th Edition | AACVPR / Human Kinetics | [AACVPR 出版物页](https://www.aacvpr.org/publications/jcrp) / [Human Kinetics](https://us.humankinetics.com/products/guidelines-for-cardiac-rehabilitation-programs-6th-edition-with-web-resource) | 缺失 | 冠心病、心脏康复、运动监护 | 需购买/授权 | 当前只有 AHA/ASA 卒中 slide set，缺心脏康复程序级指南。 |
| P0 | Guidelines for Pulmonary Rehabilitation Programs, 5th/6th Edition | AACVPR / Human Kinetics | [AACVPR 出版物页](https://www.aacvpr.org/publications/jcrp) / [第 6 版页面](https://us.humankinetics.com/products/guidelines-for-pulmonary-rehabilitation-programs-6th-edition) | 缺失 | COPD、肺康复、运动训练禁忌 | 需购买/授权；第 6 版 2026-09-15 发布 | COPD 指南已有中国资料，但缺程序化肺康复操作、评估和训练细节。 |
| P0 | GOLD 2026 Report | Global Initiative for Chronic Obstructive Lung Disease | [GOLD 报告页](https://goldcopd.org/2026-gold-report-and-pocket-guide/) / [PDF](https://goldcopd.org/wp-content/uploads/2026/01/GOLD-REPORT-2026-v1.3-8Dec2025_WMV2.pdf) | 缺失 | COPD、肺康复、禁忌与转诊 | 免费公开；全文或摘要入库 | 可补充 COPD 国际最新版药物-康复-运动框架。 |
| P0 | Standards of Care in Diabetes 2026 | American Diabetes Association | [ADA 指南资源页](https://professional.diabetes.org/standards-of-care/practice-guidelines-resources) | 缺失 | 糖尿病、老年糖尿病、儿童青少年糖尿病 | 免费公开/期刊版权；建议摘要入库或按许可处理 | 本地已有中国 2 型糖尿病运动治疗指南，但缺 ADA 年度更新和特殊人群运动建议。 |
| P0 | KDIGO 2024 Clinical Practice Guideline for CKD | KDIGO | [KDIGO 页面](https://kdigo.org/guidelines/ckd-evaluation-and-management/kdigo-2024-ckd-guideline/) / [PDF](https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf) | 缺失 | 慢性肾病、体力活动、跌倒风险 | 免费公开；全文入库需遵循版权说明 | 当前 CKD 是明显缺口，KDIGO 含每周 150 分钟中等强度活动等建议。 |
| P0 | 2023 AHA/ACC Guideline for Chronic Coronary Disease | AHA/ACC/JACC | [JACC Hub](https://www.jacc.org/guidelines/chronic-coronary-disease) / [AHA Hub](https://professional.heart.org/en/guidelines-statements/2023-ahaaccaccpaspcnlapcna-guideline-for-the-management-of-patients-withcir0000000000001168) | 缺失 | 冠心病、心脏康复、运动禁忌 | 免费公开；建议全文或摘要入库 | 对冠心病患者运动、心脏康复和生活方式有直接建议。 |
| P1 | Guidelines for Adult Stroke Rehabilitation and Recovery | AHA/ASA | [Guideline Central](https://www.guidelinecentral.com/guideline/7080) / [PubMed](https://pubmed.ncbi.nlm.nih.gov/27145936/) | 仅有 slide set，缺全文 | 脑卒中、康复训练、转诊 | 全文公开；补全文 | 本地已有幻灯片，不足以支持 RAG 逐条引用。 |
| P1 | WHO Package of Interventions for Rehabilitation: Module 4 Cardiopulmonary Conditions | WHO | [WHO 页面](https://www.who.int/publications/i/item/9789240071162) / [PDF](https://iris.who.int/bitstream/handle/10665/370505/9789240071162-eng.pdf) | 缺失 | 冠心病、COPD、康复服务包 | 开放许可，非商业 CC BY-NC-SA 3.0 IGO；按许可入库 | 可补充康复干预、设备、人力、服务层级。 |
| P1 | WHO Package of Interventions for Rehabilitation: Module 2 Musculoskeletal Conditions | WHO | [PDF](https://iris.who.int/bitstream/handle/10665/370503/9789240071100-eng.pdf) | 缺失 | 骨关节、骨质疏松、疼痛、禁忌动作 | 开放许可，非商业；按许可入库 | 对肌骨康复和动作限制有价值。 |
| P1 | WHO Rehabilitation Competency Framework | WHO | [WHO 页面](https://www.who.int/publications/i/item/9789240008281) / [IRIS](https://iris.who.int/handle/10665/338782) | 缺失 | 专家审核依据、服务边界、免责声明 | CC BY-NC-SA 3.0 IGO；全文入库可行但非商业限制 | 适合定义平台的专业能力边界和转诊/免责声明。 |
| P1 | Consensus statement of Chinese experts on exercise prescription (2023) | 中国专家组 / PMC | [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11067859/) / [国家体育总局报道](https://www.sport.gov.cn/n20001280/n20001265/n20067664/c25517089/content.html) | 缺失 | 运动处方原则、FITT-VP、中国场景、传统功法 | PMC 免费公开；建议全文入库 | 这是中国语境下运动处方定义、流程、风险评估和传统功法纳入的关键资料。 |
| P0 | 我国成人慢性肾脏病患者运动康复的专家共识 | 中华肾脏病杂志等 | [中华医学期刊网 HTML](https://studite.yiigle.com/uploads/guide_html/%E6%88%91%E5%9B%BD%E6%88%90%E4%BA%BA%E6%85%A2%E6%80%A7%E8%82%BE%E8%84%8F%E7%97%85%E6%82%A3%E8%80%85%E8%BF%90%E5%8A%A8%E5%BA%B7%E5%A4%8D%E7%9A%84%E4%B8%93%E5%AE%B6%E5%85%B1%E8%AF%86.html) | 缺失 | CKD、运动康复、风险筛查 | 授权待确认；建议摘要入库或人工确认 | 可补中国 CKD 运动康复缺口。 |
| P1 | Exercise and Lifestyle in Chronic Kidney Disease Clinical Practice Guideline | UK Kidney Association | [UK Kidney Association](https://www.ukkidney.org/health-professionals/guidelines/exercise-and-lifestyle-chronic-kidney-disease) | 缺失 | CKD、运动处方、生活方式 | 免费公开；按版权说明处理 | 比 KDIGO 更聚焦运动与生活方式。 |
| P1 | NSCA Essentials of Strength Training and Conditioning, 5th Edition | NSCA / Human Kinetics | [NSCA](https://www.nsca.com/certification/cscs/essentials-of-strength-training-and-conditioning-5th-edition/) / [Human Kinetics](https://us.humankinetics.com/products/essentials-of-strength-training-and-conditioning-5th-edition-with-hkpropel-access) | 缺失 | 力量训练、周期化、动作库、运动表现 | 需购买/授权 | 当前 ACSM 力量书不够覆盖 NSCA 的标准力量训练体系。 |
| P1 | NSCA's Essentials of Personal Training, 3rd Edition | NSCA / Human Kinetics | [NSCA](https://www.nsca.com/certification/nsca-cpt/essentials-of-personal-training--3rd-edition/) / [Human Kinetics](https://us.humankinetics.com/products/nscas-essentials-of-personal-training-3rd-edition-with-hkpropel-access) | 缺失 | 客户评估、训练计划、特殊人群 | 需购买/授权 | 可与 ACSM CPT 第 6 版互校动作库和私教场景。 |
| P1 | Exercise Technique Manual for Resistance Training, 4th Edition | NSCA / Human Kinetics | [Human Kinetics](https://us.humankinetics.com/products/exercise-technique-manual-for-resistance-training-4th-edition-with-hkpropel-online-video) | 缺失 | 动作库、禁忌动作、动作提示 | 需购买/授权 | 对动作分解、动作安全和教练提示很有用。 |
| P2 | NSCA's Guide to Program Design, 2nd Edition | NSCA / Human Kinetics | [Human Kinetics](https://us.humankinetics.com/products/nscas-guide-to-program-design-2nd-edition) | 缺失 | 训练周期化、处方进阶 | 需购买/授权 | 更偏运动表现和训练设计，适合作为 P2。 |
| P1 | ACSM Cancer Exercise Guidelines / International Roundtable 2019 | ACSM Roundtable / PMC | [PubMed](https://pubmed.ncbi.nlm.nih.gov/31626055/) / [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8576825/) | 缺失 | 肿瘤康复、医学转诊、禁忌 | PMC 免费公开；全文入库 | 可先用开放共识补肿瘤运动处方，教材后续采购。 |
| P1 | 2023 慢性冠脉疾病运动/心脏康复相关公开资料 | ACC/AHA/AACVPR | [ACC 指南页](https://www.acc.org/guidelines/guidelines/2023/07/20/12/34/chronic-coronary-disease) / [JACC 全文](https://www.jacc.org/doi/10.1016/j.jacc.2023.04.003) | 缺失 | 冠心病、二级预防、报告免责声明 | 免费公开；摘要或全文按期刊政策 | 与 AACVPR 书籍互补，先补开放指南。 |
| P1 | 健身气功·八段锦官方动作解析系列 | 国家体育总局健身气功管理中心 | [八段锦源流](https://www.sport.gov.cn/qgzx/n5407/c781297/content.html) / [动作解析示例](https://www.sport.gov.cn/qgzx/n5407/c825986/content.html) | 仅有团标征求稿和开发指南，缺系统动作归档 | 传统功法、动作库、禁忌动作 | 官方网页公开；建议摘要/网页归档 | 需要逐篇归档动作方法、动作要点、易犯错误和注意事项。 |
| P1 | 健身气功·五禽戏官方动作解析资料 | 国家体育总局健身气功管理中心 | [五禽戏资料示例](https://www.sport.gov.cn/qgzx/n5407/c670036/content.html) | 缺失 | 传统功法、动作库、老年运动 | 官方网页公开；摘要/归档 | 当前传统功法几乎只有八段锦，五禽戏缺动作分解。 |
| P2 | 健身气功·易筋经、六字诀官方资料 | 国家体育总局健身气功管理中心 | [易筋经示例](https://www.sport.gov.cn/qgzx/n5407/c871226/content.html) | 缺失 | 传统功法、呼吸调节、慢病辅助 | 官方网页公开；摘要/归档 | 需补动作要点、适应人群、禁忌和强度分级。 |

## 建议补齐顺序

### P0：第一版知识库强烈建议补齐

1. ACSM's Clinical Exercise Physiology, 2nd Edition
2. ACSM's Resources for the Exercise Physiologist, 3rd Edition
3. ACSM's Exercise Management for Persons With Chronic Diseases and Disabilities, 4th Edition
4. ACSM's Fitness Assessment Manual, 6th Edition
5. AACVPR Cardiac Rehabilitation Guidelines, 6th Edition
6. AACVPR Pulmonary Rehabilitation Guidelines, 5th Edition；第 6 版发布后替换
7. GOLD 2026 Report
8. ADA Standards of Care in Diabetes 2026
9. KDIGO 2024 CKD Guideline
10. 2023 AHA/ACC Chronic Coronary Disease Guideline
11. Consensus statement of Chinese experts on exercise prescription (2023)
12. 我国成人慢性肾脏病患者运动康复的专家共识

### P1：建议补齐，能显著提高处方质量

1. ACSM Resources for the Personal Trainer, 6th Edition
2. ACSM Exercise Testing and Prescription, 2nd Edition
3. AHA/ASA Adult Stroke Rehabilitation and Recovery 全文
4. WHO Package of Interventions for Rehabilitation：Module 2、Module 4
5. WHO Rehabilitation Competency Framework
6. UK Kidney Association Exercise and Lifestyle in CKD
7. NSCA Essentials of Strength Training and Conditioning, 5th Edition
8. NSCA Essentials of Personal Training, 3rd Edition
9. NSCA Exercise Technique Manual for Resistance Training, 4th Edition
10. ACSM 2019 Cancer Exercise Guidelines
11. 国家体育总局健身气功八段锦、五禽戏官方动作解析网页归档

### P2/P3：可选或元数据优先

1. ACSM Certification Review, 6th Edition
2. ACSM Essentials of Exercise Oncology
3. ACSM Preparticipation Physical Evaluation Monograph, 5th Edition
4. NSCA Guide to Program Design, 2nd Edition
5. 易筋经、六字诀等传统功法资料；需先确认是否有系统动作和禁忌说明。

## 知识库分桶建议

| 知识库类别 | 应补资料 |
|---|---|
| 运动处方原则库 | ACSM GETP 12th（已有）、ACSM Exercise Testing and Prescription 2nd、Consensus statement of Chinese experts on exercise prescription (2023)、WHO 身体活动指南（已有） |
| 风险筛查与禁忌库 | ACSM Resources for Exercise Physiologist、ACSM Clinical Exercise Physiology、PAR-Q+（已有）、EIM 筛查表（已有）、PPE Monograph |
| 慢病运动干预库 | ACSM Clinical Exercise Physiology、ACSM Chronic Diseases and Disabilities、AACVPR cardiac/pulmonary rehab、GOLD、ADA、KDIGO、AHA/ACC CCD、AHA/ASA stroke rehab、ACSM cancer guidelines |
| 体质测试与评价库 | ACSM Fitness Assessment Manual、国民体质测定标准（已有）、国家学生体质健康标准（已有） |
| 传统功法库 | 八段锦团标征求稿（已有）、健身气功运动处方开发指南（已有）、国家体育总局八段锦/五禽戏/易筋经/六字诀动作解析网页 |
| 专家审核依据库 | WHO Rehabilitation Competency Framework、ACSM 认证考试大纲、ACSM Certification Review、AACVPR 认证/项目标准 |
| 用户报告免责声明库 | ACSM Health/Fitness Facility Standards（已有）、WHO RCF、PAR-Q+ 医师许可表（已有）、各慢病指南禁忌和转诊条件 |

## 授权与采购建议

1. 可优先直接补入的开放资料：GOLD 2026、KDIGO 2024、WHO Rehabilitation Package、WHO RCF、PMC 上的中国运动处方共识和 ACSM cancer guideline、AHA/ACC/JACC 开放指南。
2. 可公开访问但授权需谨慎的资料：中华医学期刊网 HTML、中国期刊 PDF、国家体育总局新闻/科普网页。建议先摘要入库或保存网页归档，并保留来源 URL。
3. 需购买/授权的资料：ACSM、NSCA、AACVPR、Human Kinetics、Wolters Kluwer 教材和手册。已购买的电子版可按内部研究/产品研发使用；对外商用要做授权审查。
4. 明确不建议使用：Z-Library、Anna's Archive、LibGen、Sci-Hub、Reddit 求书帖、盗版 PDF 站、网盘搬运、非授权扫描教材。

## 检索关键词摘要

- ACSM Resources for the Exercise Physiologist 3rd Edition official
- ACSM Clinical Exercise Physiology 2nd Edition official
- ACSM Exercise Management Chronic Diseases Disabilities 4th Edition Human Kinetics
- ACSM Fitness Assessment Manual 6th Edition
- AACVPR Guidelines Cardiac Rehabilitation Programs 6th Edition
- AACVPR Guidelines Pulmonary Rehabilitation Programs 6th Edition
- GOLD 2026 COPD report pulmonary rehabilitation PDF
- ADA Standards of Care in Diabetes 2026 physical activity
- KDIGO 2024 CKD Guideline physical activity
- 2023 AHA ACC chronic coronary disease cardiac rehabilitation
- Consensus statement of Chinese experts on exercise prescription 2023
- 慢性肾脏病 运动康复 专家共识
- 国家体育总局 健身气功 八段锦 动作要领
- NSCA Essentials Strength Training Conditioning 5th Edition
