# AI 运动处方平台第一版处方模板库｜专家审核草案 v0.1

> 本资料包为专家审核草案，仅用于平台规则、模板和数据结构设计；不用于临床诊断、药物调整、急救处置或替代医生判断。R2 慢病相关模板均标记为“必须专家审核后发布”；R3 不生成训练处方，仅输出安全提醒和医学评估/转介建议。
>
> 系统适配说明：本版已将 `R1/R2` 混合风险模板拆分为独立 R1 与 R2 模板；R3 安全提醒模板的 `fitt_vp` 已置为 `null`。

## A. Markdown 总览表

| template_code | name | risk_level | cluster_tags | frequency | intensity | expert_review_required | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TPL_R0_001 | R0 普通健康维持模板 | R0 | 普通健康型、PAR-Q阴性、无明显风险 | 有氧3-5天/周；肌力2天/周；柔韧/活动度2-3天/周；久坐打断每日执行。 | RPE 11-13为主，基础较好者可短时RPE 14；心率可作为辅助参考，但不得替代RPE、谈话测试和症状监测；若佩戴设备读数异常，应以主观感受和安全信号优先。 | 否 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R1_001 | R1 久坐低体能改善模板 | R1 | 久坐、低体能、运动不足 | 低强度活动每日；结构化有氧3-5天/周；轻阻力2天/周。 | 起始RPE 9-11，2-4周后可至RPE 11-13；心率仅作趋势参考，不作为唯一强度指标；若心率异常升高或恢复慢，应降低强度并记录。 | 否 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R1_002 | R1 超重肥胖/减脂模板 | R1 | 超重肥胖、体脂偏高、腰围偏高 | 有氧4-6天/周；抗阻2-3天/周；柔韧/恢复2-3天/周。 | 有氧RPE 11-13为主，抗阻RPE 11-14；心率可用于观察趋势，但肥胖、药物、睡眠和压力会影响心率，不能单独作为进阶依据。 | 否 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R1_003 | R1 初级运动习惯建立模板 | R1 | 运动新手、依从性建立、低风险改善 | 每周3天结构化运动；每日设置1-3个微运动任务。 | RPE 9-12；以能说完整句子的轻到中等强度为主；心率只用于记录，不以达成某心率区间为核心目标。 | 否 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_001 | R2 高血压稳定型模板 | R2 | 高血压、慢病稳定型、需专家审核 | 有氧5-7天/周可作为长期目标；起始3-5天/周；抗阻2-3天/周，非连续日。 | 有氧RPE 10-13，避免突然RPE≥15；抗阻RPE 10-13，避免憋气。若使用β受体阻滞剂或其他影响心率药物，不能单纯依赖心率；优先RPE、谈话测试、血压反应和症状。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_002 | R2 糖代谢异常/糖尿病稳定型模板 | R2 | 糖代谢异常、糖尿病稳定型、慢病稳定型… | 有氧3-6天/周，尽量避免连续2天以上完全不活动；抗阻2-3天/周；餐后轻活动可按专家建议加入。 | RPE 10-13为主，稳定后可短时RPE 14；使用胰岛素或促泌剂者不能只看心率，应结合血糖监测、低血糖症状、RPE和进食/用药时间。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_003 | R2 血脂异常模板 | R2 | 血脂异常、心血管风险改善、需专家审核 | 有氧4-6天/周；抗阻2-3天/周；减少久坐每日执行。 | RPE 11-13为主；不以心率作为唯一标准，合并β受体阻滞剂、老年或慢病时更应以RPE、谈话测试和症状为主。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_004 | R2 老年功能下降/跌倒风险模板 | R2 | 老年、跌倒风险、平衡下降… | 平衡/功能训练3天/周或以上；低强度步行3-5天/周；肌力2-3天/周。 | RPE 9-12起始，稳定后RPE 11-13；老年人不可单纯依赖心率，需结合RPE、步态稳定性、谈话测试、血压反应和照护环境。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_005 | R2 膝关节疼痛/下肢损伤风险模板 | R2 | 膝关节疼痛、下肢损伤风险、关节疼痛… | 低冲击有氧3-5天/周；康复性力量/稳定训练2-4天/周；柔韧活动每日轻量。 | RPE 9-12为主，疼痛训练中不超过3/10作为保守草案阈值待专家确认；心率仅辅助，不应推动用户忽视疼痛。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_006 | R2 肌力不足模板 | R2 | 肌力不足、握力低、肌少风险… | 抗阻2-3天/周，非连续日；轻有氧2-4天/周；柔韧2-3天/周。 | 起始RPE 10-12，稳定后RPE 12-14；避免力竭和憋气。老年人、慢病人群或β受体阻滞剂使用者不要单纯依赖心率，力量训练主要用RPE、动作质量和症状监测。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R1_004 | R1 柔韧平衡不足模板 | R1 | 柔韧不足、平衡不足、活动度下降 | 柔韧/活动度3-7天/周；平衡2-5天/周；可作为有氧和力量训练的补充。 | 拉伸为轻到中等牵拉感，RPE 8-11；平衡训练RPE 9-12。心率通常不是主要指标，不应以心率达标为目的。 | 否 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_008 | R2 柔韧平衡不足模板 | R2 | 柔韧不足、平衡不足、活动度下降 | 柔韧/活动度3-7天/周；平衡2-5天/周；可作为有氧和力量训练的补充。 | 拉伸为轻到中等牵拉感，RPE 8-11；平衡训练RPE 9-12。心率通常不是主要指标，不应以心率达标为目的。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R1_005 | R1 传统功法特色模板：太极拳/八段锦/健身气功 | R1 | 传统功法、太极拳、八段锦… | 3-7天/周；初学者每周3天起，熟练后可每日短时练习。 | RPE 9-12为主，动作缓慢、呼吸自然；心率仅作辅助记录，β受体阻滞剂、老年人和慢病用户不要单纯依赖心率。 | 否 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_009 | R2 传统功法特色模板：太极拳/八段锦/健身气功 | R2 | 传统功法、太极拳、八段锦… | 3-7天/周；初学者每周3天起，熟练后可每日短时练习。 | RPE 9-12为主，动作缓慢、呼吸自然；心率仅作辅助记录，β受体阻滞剂、老年人和慢病用户不要单纯依赖心率。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R2_007 | R2 呼吸疾病稳定型低强度活动模板 | R2 | 呼吸疾病、低血氧风险、慢病稳定型… | 低到中等强度有氧3-5天/周；呼吸练习每日短时；轻抗阻2天/周。 | RPE 9-12，呼吸困难评分需纳入监测待专家确认；不单纯依赖心率，尤其是慢病、老年或用药人群；以能说短句、无明显气促恶化为准。 | 是 | DRAFT_PENDING_EXPERT_REVIEW |
| TPL_R3_001 | R3 安全提醒与医学评估/转介模板 | R3 | 高风险转介、红色信号、不生成训练处方 | - | - | 是 | DRAFT_PENDING_EXPERT_REVIEW |

## B. JSON 数组

```json
[
  {
    "template_code": "TPL_R0_001",
    "draft_label": "专家审核草案",
    "name": "R0 普通健康维持模板",
    "risk_level": "R0",
    "cluster_tags": [
      "普通健康型",
      "PAR-Q阴性",
      "无明显风险"
    ],
    "goal_tags": [
      "健康维持",
      "心肺体能",
      "肌力维持",
      "久坐减少"
    ],
    "suitable_population": "成年人或老年人；无红色症状；PAR-Q+阴性或系统未发现R1/R2/R3命中；可按基础处方自动生成。",
    "exclusion_criteria": [
      "任一R3红色信号",
      "静息血压/血糖/血氧达到平台红色预警",
      "医生限制运动",
      "近期急性损伤",
      "未控制疼痛或疼痛≥4/10"
    ],
    "fitt_vp": {
      "frequency": "有氧3-5天/周；肌力2天/周；柔韧/活动度2-3天/周；久坐打断每日执行。",
      "intensity": "RPE 11-13为主，基础较好者可短时RPE 14；心率可作为辅助参考，但不得替代RPE、谈话测试和症状监测；若佩戴设备读数异常，应以主观感受和安全信号优先。",
      "time": "每次20-45分钟；初期可拆分为10分钟×2-3段。",
      "type": [
        "快走",
        "骑行",
        "椭圆机",
        "游泳或水中运动",
        "徒手抗阻",
        "弹力带",
        "核心稳定",
        "拉伸"
      ],
      "volume": "目标逐步达到150-300分钟/周中等强度有氧活动；肌力每次6-8个动作，1-3组，每组8-15次。",
      "progression": "每1-2周总量增加5%-10%；优先增加频率和时间，再增加强度；出现不适则回退至上一阶段。"
    },
    "precautions": [
      "自动发布前仍需提示安全边界",
      "避免突然进入高强度间歇或极限训练",
      "睡眠不足、发热、饮酒后不建议训练"
    ],
    "contraindications": [
      "R3红色信号",
      "急性疾病期",
      "医生禁止运动"
    ],
    "monitoring_indicators": [
      "RPE",
      "运动时长",
      "步数/活动分钟",
      "静息心率",
      "疼痛评分",
      "运动后恢复感"
    ],
    "reassessment_cycle": "4-6周",
    "expert_review_required": false,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R1_001",
    "draft_label": "专家审核草案",
    "name": "R1 久坐低体能改善模板",
    "risk_level": "R1",
    "cluster_tags": [
      "久坐",
      "低体能",
      "运动不足"
    ],
    "goal_tags": [
      "打断久坐",
      "基础心肺提升",
      "疲劳耐受",
      "日常活动能力"
    ],
    "suitable_population": "久坐时间较长、无规律运动或体测提示低体能但无R2/R3红色或黄色限制者。",
    "exclusion_criteria": [
      "R2慢病需审核",
      "R3红色信号",
      "疼痛≥4/10",
      "静息血氧偏低或异常气短",
      "近期急性损伤"
    ],
    "fitt_vp": {
      "frequency": "低强度活动每日；结构化有氧3-5天/周；轻阻力2天/周。",
      "intensity": "起始RPE 9-11，2-4周后可至RPE 11-13；心率仅作趋势参考，不作为唯一强度指标；若心率异常升高或恢复慢，应降低强度并记录。",
      "time": "第1-2周每次10-20分钟；第3-6周每次20-30分钟；可分段完成。",
      "type": [
        "轻快走",
        "原地踏步",
        "坐站训练",
        "弹力带划船",
        "靠墙俯卧撑",
        "踝泵和髋膝活动度"
      ],
      "volume": "起始60-90分钟/周，逐步到120-150分钟/周；久坐每30-60分钟起身2-5分钟。",
      "progression": "先增加每周训练天数，再延长单次时间；连续2周RPE≤11且无不适后再进阶。"
    },
    "precautions": [
      "从低量开始，避免补偿性一次性大量运动",
      "关注运动后24小时疲劳和疼痛反应",
      "久坐打断不等于高强度训练"
    ],
    "contraindications": [
      "胸痛/晕厥/严重气短",
      "疼痛≥7/10",
      "急性损伤未恢复"
    ],
    "monitoring_indicators": [
      "RPE",
      "每日坐姿时长",
      "运动完成率",
      "6分钟步行或台阶测试趋势",
      "疼痛评分"
    ],
    "reassessment_cycle": "4周",
    "expert_review_required": false,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R1_002",
    "draft_label": "专家审核草案",
    "name": "R1 超重肥胖/减脂模板",
    "risk_level": "R1",
    "cluster_tags": [
      "超重肥胖",
      "体脂偏高",
      "腰围偏高"
    ],
    "goal_tags": [
      "减脂",
      "体重管理",
      "心肺耐力",
      "肌肉保留"
    ],
    "suitable_population": "BMI或腰围提示超重/肥胖，未合并需专家审核的未控制慢病或R3信号者。",
    "exclusion_criteria": [
      "R2/R3风险命中",
      "膝踝髋疼痛≥4/10",
      "医生限制运动",
      "疑似低血糖或血糖极高",
      "血压红色预警"
    ],
    "fitt_vp": {
      "frequency": "有氧4-6天/周；抗阻2-3天/周；柔韧/恢复2-3天/周。",
      "intensity": "有氧RPE 11-13为主，抗阻RPE 11-14；心率可用于观察趋势，但肥胖、药物、睡眠和压力会影响心率，不能单独作为进阶依据。",
      "time": "有氧每次20-50分钟，初期可分段；抗阻20-40分钟。",
      "type": [
        "快走",
        "椭圆机",
        "骑行",
        "水中运动",
        "低冲击有氧操",
        "全身大肌群抗阻",
        "核心稳定"
      ],
      "volume": "起始120-180分钟/周，逐步向150-300分钟/周过渡；抗阻6-10个动作，1-3组，每组8-15次。",
      "progression": "每2周小幅增加总量5%-10%；体重较大或关节不适者优先选择低冲击方式，不以跑跳作为默认进阶。"
    },
    "precautions": [
      "减脂模板不承诺疾病治疗或快速减重",
      "避免空腹长时间高强度运动",
      "关注膝、踝、腰疼痛和足部磨损"
    ],
    "contraindications": [
      "R3红色信号",
      "急性关节损伤",
      "疼痛≥7/10",
      "医生禁止运动"
    ],
    "monitoring_indicators": [
      "体重",
      "腰围",
      "RPE",
      "关节疼痛评分",
      "训练总分钟",
      "睡眠和疲劳"
    ],
    "reassessment_cycle": "4-6周",
    "expert_review_required": false,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "待专家确认：中国成人BMI/腰围分层与平台本地阈值"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R1_003",
    "draft_label": "专家审核草案",
    "name": "R1 初级运动习惯建立模板",
    "risk_level": "R1",
    "cluster_tags": [
      "运动新手",
      "依从性建立",
      "低风险改善"
    ],
    "goal_tags": [
      "建立规律",
      "提升自我效能",
      "降低中断率"
    ],
    "suitable_population": "无规律运动经验、担心坚持困难或过去运动中断，但无R2/R3安全限制者。",
    "exclusion_criteria": [
      "PAR-Q+阳性未评估",
      "R2慢病未专家审核",
      "R3信号",
      "疼痛≥4/10"
    ],
    "fitt_vp": {
      "frequency": "每周3天结构化运动；每日设置1-3个微运动任务。",
      "intensity": "RPE 9-12；以能说完整句子的轻到中等强度为主；心率只用于记录，不以达成某心率区间为核心目标。",
      "time": "结构化训练每次10-30分钟；微运动每次2-5分钟。",
      "type": [
        "步行",
        "居家徒手训练",
        "拉伸",
        "呼吸放松",
        "轻量弹力带",
        "兴趣型低冲击活动"
      ],
      "volume": "第1周30-60分钟/周；第4周达到90-120分钟/周；微运动累计10-20分钟/日。",
      "progression": "采用“最小可行处方”：完成率≥80%后再增加时间或动作；优先固定时间、地点和触发提醒。"
    },
    "precautions": [
      "避免一开始追求高强度或大体量",
      "未完成时不惩罚性加量",
      "以稳定习惯优先于短期指标"
    ],
    "contraindications": [
      "R3红色信号",
      "急性损伤或感染期",
      "医生禁止运动"
    ],
    "monitoring_indicators": [
      "完成率",
      "RPE",
      "运动后情绪",
      "疲劳评分",
      "疼痛评分"
    ],
    "reassessment_cycle": "2-4周",
    "expert_review_required": false,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R2_001",
    "draft_label": "专家审核草案",
    "name": "R2 高血压稳定型模板",
    "risk_level": "R2",
    "cluster_tags": [
      "高血压",
      "慢病稳定型",
      "需专家审核"
    ],
    "goal_tags": [
      "血压管理辅助",
      "心肺耐力",
      "生活方式改善"
    ],
    "suitable_population": "已知高血压且无红色症状、无医生禁止运动、静息血压未达R3红色阈值的稳定型用户；必须专家审核后发布。",
    "exclusion_criteria": [
      "静息SBP>200或DBP>115待平台红色阈值确认",
      "胸痛/晕厥/严重气短/明显心悸",
      "近期急性心脑血管事件",
      "医生限制运动",
      "血压测量异常且未复核"
    ],
    "fitt_vp": {
      "frequency": "有氧5-7天/周可作为长期目标；起始3-5天/周；抗阻2-3天/周，非连续日。",
      "intensity": "有氧RPE 10-13，避免突然RPE≥15；抗阻RPE 10-13，避免憋气。若使用β受体阻滞剂或其他影响心率药物，不能单纯依赖心率；优先RPE、谈话测试、血压反应和症状。",
      "time": "有氧每次20-40分钟，含充分热身和整理；抗阻20-30分钟。",
      "type": [
        "步行",
        "骑行",
        "低冲击有氧",
        "轻中等阻力训练",
        "呼吸放松",
        "柔韧活动"
      ],
      "volume": "有氧逐步达到150分钟/周以上；抗阻8-10个动作，1-2组，每组10-15次，低到中等负荷。",
      "progression": "血压记录稳定且无不适时，每2-4周增加5%-10%总量；先加时间再加阻力；避免高强度间歇作为默认。"
    },
    "precautions": [
      "必须专家审核后发布",
      "训练前后记录血压，异常时不训练并提示就医/咨询",
      "避免屏气、用力憋压和极限力量训练",
      "运动后注意体位性低血压"
    ],
    "contraindications": [
      "R3信号",
      "静息血压红色预警",
      "未控制高血压待专家确认",
      "胸痛或神经系统症状"
    ],
    "monitoring_indicators": [
      "训练前后血压",
      "RPE",
      "头晕/胸闷",
      "心悸",
      "用药信息",
      "运动后恢复"
    ],
    "reassessment_cycle": "2-4周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "Exercise is Medicine Rx for Health: Hypertension",
      "ACSM hypertension exercise guidance, 待专家确认"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R2_002",
    "draft_label": "专家审核草案",
    "name": "R2 糖代谢异常/糖尿病稳定型模板",
    "risk_level": "R2",
    "cluster_tags": [
      "糖代谢异常",
      "糖尿病稳定型",
      "慢病稳定型",
      "需专家审核"
    ],
    "goal_tags": [
      "血糖管理辅助",
      "胰岛素敏感性",
      "体重管理",
      "肌力维护"
    ],
    "suitable_population": "空腹血糖、餐后血糖或HbA1c异常，或已报告糖尿病；无低血糖/高血糖红色预警、无急性并发症信号；必须专家审核后发布。",
    "exclusion_criteria": [
      "疑似低血糖",
      "血糖极高或伴酮症风险待专家确认",
      "急性感染或急性并发症",
      "足部溃疡/严重神经病变待系统扩展字段确认",
      "R3信号"
    ],
    "fitt_vp": {
      "frequency": "有氧3-6天/周，尽量避免连续2天以上完全不活动；抗阻2-3天/周；餐后轻活动可按专家建议加入。",
      "intensity": "RPE 10-13为主，稳定后可短时RPE 14；使用胰岛素或促泌剂者不能只看心率，应结合血糖监测、低血糖症状、RPE和进食/用药时间。",
      "time": "有氧每次10-40分钟；餐后轻步行10-20分钟待专家确认；抗阻20-40分钟。",
      "type": [
        "步行",
        "骑行",
        "椭圆机",
        "低冲击有氧",
        "全身抗阻",
        "柔韧和平衡",
        "足部友好运动"
      ],
      "volume": "目标150分钟/周中等强度有氧；抗阻6-10个动作，1-3组，每组8-15次。",
      "progression": "血糖反应可预测、无低血糖且专家确认后，每2-4周增加5%-10%；优先提高规律性，不默认高强度。"
    },
    "precautions": [
      "必须专家审核后发布",
      "胰岛素/降糖药用户需提示随身携带快速糖源并按医生建议监测血糖",
      "注意足部检查、补水和运动后延迟性低血糖",
      "平台不调整药物剂量"
    ],
    "contraindications": [
      "低血糖症状或血糖低于个体安全下限",
      "高血糖伴不适或酮症风险",
      "胸痛/晕厥/严重气短",
      "足部破溃或感染"
    ],
    "monitoring_indicators": [
      "运动前后血糖",
      "低血糖症状",
      "RPE",
      "足部情况",
      "用药和进食时间",
      "疲劳恢复"
    ],
    "reassessment_cycle": "2-4周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "American Diabetes Association: blood glucose and exercise",
      "Exercise is Medicine Rx for Health: Diabetes"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R2_003",
    "draft_label": "专家审核草案",
    "name": "R2 血脂异常模板",
    "risk_level": "R2",
    "cluster_tags": [
      "血脂异常",
      "心血管风险改善",
      "需专家审核"
    ],
    "goal_tags": [
      "有氧耐力",
      "体重管理",
      "代谢健康",
      "肌力维护"
    ],
    "suitable_population": "TC/TG/HDL-C/LDL-C异常但无R3信号；若合并冠心病、糖尿病、CKD或高血压，则按更高风险规则处理并必须专家审核后发布。",
    "exclusion_criteria": [
      "冠心病或胸痛未评估",
      "TG极高待专家确认",
      "R3信号",
      "医生限制运动",
      "血压红色预警"
    ],
    "fitt_vp": {
      "frequency": "有氧4-6天/周；抗阻2-3天/周；减少久坐每日执行。",
      "intensity": "RPE 11-13为主；不以心率作为唯一标准，合并β受体阻滞剂、老年或慢病时更应以RPE、谈话测试和症状为主。",
      "time": "有氧每次20-50分钟；抗阻20-40分钟。",
      "type": [
        "快走",
        "骑行",
        "游泳",
        "椭圆机",
        "全身抗阻",
        "核心训练",
        "柔韧放松"
      ],
      "volume": "逐步达到150-300分钟/周中等强度有氧；抗阻6-10个动作，1-3组，每组8-15次。",
      "progression": "每2-4周增加5%-10%总量；体重管理目标下优先增加低冲击总量，不默认高强度冲刺。"
    },
    "precautions": [
      "必须专家审核后发布",
      "合并其他慢病时套用更严格模板",
      "不承诺替代降脂药物或医疗随访"
    ],
    "contraindications": [
      "胸痛/晕厥/严重气短",
      "运动诱发小腿疼痛明显",
      "血压或心率异常伴不适"
    ],
    "monitoring_indicators": [
      "血脂复查结果",
      "RPE",
      "训练分钟数",
      "体重/腰围",
      "胸闷气短",
      "腿部不适"
    ],
    "reassessment_cycle": "8-12周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "Exercise is Medicine Rx for Health series, chronic conditions"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R2_004",
    "draft_label": "专家审核草案",
    "name": "R2 老年功能下降/跌倒风险模板",
    "risk_level": "R2",
    "cluster_tags": [
      "老年",
      "跌倒风险",
      "平衡下降",
      "功能下降",
      "需专家审核"
    ],
    "goal_tags": [
      "防跌倒",
      "下肢力量",
      "平衡",
      "日常功能"
    ],
    "suitable_population": "年龄较大、单腿站立下降、6分钟步行低、既往跌倒风险或功能下降提示者；无R3信号；必须专家审核后发布。",
    "exclusion_criteria": [
      "近期跌倒伴损伤未评估",
      "晕厥/黑蒙",
      "严重骨质疏松或骨折风险未评估",
      "严重关节疼痛",
      "认知/视力/神经问题待系统扩展字段确认"
    ],
    "fitt_vp": {
      "frequency": "平衡/功能训练3天/周或以上；低强度步行3-5天/周；肌力2-3天/周。",
      "intensity": "RPE 9-12起始，稳定后RPE 11-13；老年人不可单纯依赖心率，需结合RPE、步态稳定性、谈话测试、血压反应和照护环境。",
      "time": "每次20-40分钟；可拆成10-15分钟多段。",
      "type": [
        "坐站训练",
        "扶持下重心转移",
        "半脚跟站/半串联站",
        "低台阶训练",
        "弹力带下肢力量",
        "步行",
        "太极基础步法待确认"
      ],
      "volume": "每次5-8个功能动作，1-3组；平衡动作每项10-30秒，安全扶持下完成。",
      "progression": "先减少扶持程度或增加动作控制时间，再增加复杂度；不得在不安全环境中挑战闭眼或单腿高难度。"
    },
    "precautions": [
      "必须专家审核后发布",
      "建议有人看护或靠近稳定支撑物",
      "环境需防滑、光线充足",
      "任何头晕或步态明显不稳立即停止"
    ],
    "contraindications": [
      "晕厥/黑蒙",
      "新发神经症状",
      "跌倒或接近跌倒",
      "胸痛/严重气短",
      "急性疼痛"
    ],
    "monitoring_indicators": [
      "单腿站立",
      "TUG待扩展字段",
      "跌倒/近跌倒记录",
      "RPE",
      "疼痛",
      "日常步行能力"
    ],
    "reassessment_cycle": "2-4周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "WHO older adults balance and strength recommendations",
      "Exercise is Medicine: older adult exercise prescription, 待专家确认"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R2_005",
    "draft_label": "专家审核草案",
    "name": "R2 膝关节疼痛/下肢损伤风险模板",
    "risk_level": "R2",
    "cluster_tags": [
      "膝关节疼痛",
      "下肢损伤风险",
      "关节疼痛",
      "需专家审核"
    ],
    "goal_tags": [
      "疼痛管理辅助",
      "下肢稳定",
      "低冲击心肺",
      "功能恢复"
    ],
    "suitable_population": "膝关节疼痛、下肢疼痛部位填写或近期轻中度下肢损伤风险者；疼痛未达R3但需谨慎；必须专家审核后发布。",
    "exclusion_criteria": [
      "急性损伤肿胀/畸形/无法负重",
      "疼痛≥7/10",
      "疑似骨折或韧带严重损伤待医生评估",
      "运动后疼痛明显加重超过24小时"
    ],
    "fitt_vp": {
      "frequency": "低冲击有氧3-5天/周；康复性力量/稳定训练2-4天/周；柔韧活动每日轻量。",
      "intensity": "RPE 9-12为主，疼痛训练中不超过3/10作为保守草案阈值待专家确认；心率仅辅助，不应推动用户忽视疼痛。",
      "time": "每次15-40分钟；疼痛敏感者分段完成。",
      "type": [
        "平地步行",
        "固定车",
        "水中步行",
        "臀中肌训练",
        "股四头肌等长/闭链轻负荷",
        "小腿力量",
        "髋踝活动度",
        "核心稳定"
      ],
      "volume": "每次4-8个动作，1-3组，每组8-15次或等长10-30秒；有氧从60-120分钟/周起。",
      "progression": "疼痛稳定、无肿胀且次日不加重时，每1-2周小幅增加次数/时间；跑跳、深蹲大角度和下坡作为禁忌或待专家确认。"
    },
    "precautions": [
      "必须专家审核后发布",
      "疼痛、肿胀、热感和活动受限优先于完成训练量",
      "避免跳跃、急停急转、深蹲到底等高冲击动作"
    ],
    "contraindications": [
      "急性损伤",
      "疼痛≥7/10",
      "关节明显肿胀或无法负重",
      "胸痛/晕厥/严重气短"
    ],
    "monitoring_indicators": [
      "疼痛评分",
      "疼痛部位",
      "肿胀/热感",
      "步态",
      "次日反应",
      "RPE"
    ],
    "reassessment_cycle": "2-4周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "待专家确认：膝痛运动进阶与疼痛阈值"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R2_006",
    "draft_label": "专家审核草案",
    "name": "R2 肌力不足模板",
    "risk_level": "R2",
    "cluster_tags": [
      "肌力不足",
      "握力低",
      "肌少风险",
      "需专家审核"
    ],
    "goal_tags": [
      "肌力提升",
      "功能改善",
      "跌倒风险降低",
      "代谢健康"
    ],
    "suitable_population": "握力、骨骼肌量或功能测试提示肌力不足；无R3信号；若合并慢病或老年风险必须专家审核后发布。",
    "exclusion_criteria": [
      "严重疼痛",
      "近期急性损伤",
      "严重骨质疏松未评估",
      "未控制高血压",
      "胸痛/晕厥/严重气短"
    ],
    "fitt_vp": {
      "frequency": "抗阻2-3天/周，非连续日；轻有氧2-4天/周；柔韧2-3天/周。",
      "intensity": "起始RPE 10-12，稳定后RPE 12-14；避免力竭和憋气。老年人、慢病人群或β受体阻滞剂使用者不要单纯依赖心率，力量训练主要用RPE、动作质量和症状监测。",
      "time": "每次20-45分钟。",
      "type": [
        "弹力带",
        "徒手坐站",
        "靠墙俯卧撑",
        "划船",
        "髋铰链基础",
        "提踵",
        "核心稳定",
        "轻哑铃"
      ],
      "volume": "6-10个动作，1-3组，每组8-15次；动作质量优先。",
      "progression": "连续2周动作稳定且RPE≤12时，先增加1组或少量阻力；不做最大力量测试作为默认。"
    },
    "precautions": [
      "必须专家审核后发布",
      "阻力训练必须包含热身、动作示范和呼吸提示",
      "避免屏气憋压和追求极限重量"
    ],
    "contraindications": [
      "疼痛≥7/10",
      "血压红色预警",
      "急性损伤",
      "严重头晕或胸闷"
    ],
    "monitoring_indicators": [
      "握力",
      "坐站次数待扩展字段",
      "RPE",
      "动作完成质量",
      "肌肉酸痛持续时间",
      "血压慢病用户"
    ],
    "reassessment_cycle": "4-6周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "WHO muscle-strengthening recommendations",
      "待专家确认：肌少/握力阈值"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R1_004",
    "draft_label": "专家审核草案",
    "name": "R1 柔韧平衡不足模板",
    "risk_level": "R1",
    "cluster_tags": [
      "柔韧不足",
      "平衡不足",
      "活动度下降"
    ],
    "goal_tags": [
      "关节活动度",
      "姿势控制",
      "跌倒预防",
      "运动准备"
    ],
    "suitable_population": "坐位体前屈差、单腿站立下降、动作僵硬或活动度不足者；R1可自动生成，R2或合并慢病时必须专家审核后发布。",
    "exclusion_criteria": [
      "R3信号",
      "急性损伤",
      "关节红肿热痛",
      "严重骨质疏松或骨折风险未评估",
      "眩晕或晕厥"
    ],
    "fitt_vp": {
      "frequency": "柔韧/活动度3-7天/周；平衡2-5天/周；可作为有氧和力量训练的补充。",
      "intensity": "拉伸为轻到中等牵拉感，RPE 8-11；平衡训练RPE 9-12。心率通常不是主要指标，不应以心率达标为目的。",
      "time": "每次10-30分钟；单个拉伸10-30秒，重复2-4次。",
      "type": [
        "动态热身",
        "静态拉伸",
        "胸椎/髋踝活动度",
        "重心转移",
        "串联站",
        "扶持单腿站",
        "呼吸放松",
        "瑜伽基础动作待确认"
      ],
      "volume": "每次5-10个动作；平衡动作在安全支撑下累计5-10分钟。",
      "progression": "先增加控制时间，再减少支撑或增加动态变化；老年或慢病用户不默认闭眼挑战。"
    },
    "precautions": [
      "R2或慢病人群必须专家审核后发布",
      "拉伸不得产生锐痛或麻木放射痛",
      "平衡训练需确保防滑和支撑"
    ],
    "contraindications": [
      "眩晕/晕厥",
      "锐痛或麻木",
      "跌倒风险明显增加",
      "胸痛/严重气短"
    ],
    "monitoring_indicators": [
      "坐位体前屈",
      "单腿站立",
      "疼痛评分",
      "眩晕",
      "RPE"
    ],
    "reassessment_cycle": "4周",
    "expert_review_required": false,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议",
      "由 TPL_R1R2_001 拆分而来：R1版本可自动发布，但仍建议抽查。"
    ]
  },
  {
    "template_code": "TPL_R2_008",
    "draft_label": "专家审核草案",
    "name": "R2 柔韧平衡不足模板",
    "risk_level": "R2",
    "cluster_tags": [
      "柔韧不足",
      "平衡不足",
      "活动度下降"
    ],
    "goal_tags": [
      "关节活动度",
      "姿势控制",
      "跌倒预防",
      "运动准备"
    ],
    "suitable_population": "坐位体前屈差、单腿站立下降、动作僵硬或活动度不足者；R1可自动生成，R2或合并慢病时必须专家审核后发布。",
    "exclusion_criteria": [
      "R3信号",
      "急性损伤",
      "关节红肿热痛",
      "严重骨质疏松或骨折风险未评估",
      "眩晕或晕厥"
    ],
    "fitt_vp": {
      "frequency": "柔韧/活动度3-7天/周；平衡2-5天/周；可作为有氧和力量训练的补充。",
      "intensity": "拉伸为轻到中等牵拉感，RPE 8-11；平衡训练RPE 9-12。心率通常不是主要指标，不应以心率达标为目的。",
      "time": "每次10-30分钟；单个拉伸10-30秒，重复2-4次。",
      "type": [
        "动态热身",
        "静态拉伸",
        "胸椎/髋踝活动度",
        "重心转移",
        "串联站",
        "扶持单腿站",
        "呼吸放松",
        "瑜伽基础动作待确认"
      ],
      "volume": "每次5-10个动作；平衡动作在安全支撑下累计5-10分钟。",
      "progression": "先增加控制时间，再减少支撑或增加动态变化；老年或慢病用户不默认闭眼挑战。"
    },
    "precautions": [
      "R2用户必须专家审核后发布",
      "R2或慢病人群必须专家审核后发布",
      "拉伸不得产生锐痛或麻木放射痛",
      "平衡训练需确保防滑和支撑"
    ],
    "contraindications": [
      "眩晕/晕厥",
      "锐痛或麻木",
      "跌倒风险明显增加",
      "胸痛/严重气短"
    ],
    "monitoring_indicators": [
      "坐位体前屈",
      "单腿站立",
      "疼痛评分",
      "眩晕",
      "RPE"
    ],
    "reassessment_cycle": "4周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议",
      "由 TPL_R1R2_001 拆分而来：R2版本必须专家审核后发布。"
    ]
  },
  {
    "template_code": "TPL_R1_005",
    "draft_label": "专家审核草案",
    "name": "R1 传统功法特色模板：太极拳/八段锦/健身气功",
    "risk_level": "R1",
    "cluster_tags": [
      "传统功法",
      "太极拳",
      "八段锦",
      "健身气功",
      "低冲击"
    ],
    "goal_tags": [
      "身心调节",
      "平衡协调",
      "柔韧",
      "低冲击心肺"
    ],
    "suitable_population": "适合希望采用低冲击、节律性、身心结合运动的用户；适用于未命中R2/R3审核或转介规则的低风险改善用户。",
    "exclusion_criteria": [
      "R3信号",
      "医生限制运动",
      "急性损伤",
      "严重膝髋踝疼痛",
      "明显眩晕或平衡失控",
      "低血糖/血压红色预警"
    ],
    "fitt_vp": {
      "frequency": "3-7天/周；初学者每周3天起，熟练后可每日短时练习。",
      "intensity": "RPE 9-12为主，动作缓慢、呼吸自然；心率仅作辅助记录，β受体阻滞剂、老年人和慢病用户不要单纯依赖心率。",
      "time": "每次10-40分钟；初期可10-15分钟，逐步延长。",
      "type": [
        "简化太极拳",
        "八段锦",
        "健身气功基础套路",
        "站姿重心转移",
        "呼吸放松",
        "柔和步法"
      ],
      "volume": "每次1-2套短套路或5-8个动作；每周累计60-180分钟，视风险等级调整。",
      "progression": "先学动作路线和呼吸，再延长练习时间；不追求低桩、长时间站桩或大幅度扭转；膝痛者降低屈膝角度。"
    },
    "precautions": [
      "传统功法不替代药物或康复治疗",
      "注意场地防滑，避免低头旋转过快",
      "动作幅度以无痛为原则"
    ],
    "contraindications": [
      "胸痛/晕厥/严重气短",
      "眩晕加重",
      "膝痛明显增加",
      "血糖/血压红色预警"
    ],
    "monitoring_indicators": [
      "RPE",
      "疼痛评分",
      "眩晕",
      "单腿站立",
      "练习完成率",
      "运动后恢复感"
    ],
    "reassessment_cycle": "4-6周",
    "expert_review_required": false,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "待专家确认：中国传统功法适应证、禁忌和动作库分级"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议",
      "由 TPL_R1R2_002 拆分而来：R1版本可自动发布，但仍建议抽查。"
    ]
  },
  {
    "template_code": "TPL_R2_009",
    "draft_label": "专家审核草案",
    "name": "R2 传统功法特色模板：太极拳/八段锦/健身气功",
    "risk_level": "R2",
    "cluster_tags": [
      "传统功法",
      "太极拳",
      "八段锦",
      "健身气功",
      "低冲击"
    ],
    "goal_tags": [
      "身心调节",
      "平衡协调",
      "柔韧",
      "低冲击心肺"
    ],
    "suitable_population": "适合希望采用低冲击、节律性、身心结合运动的用户；适用于命中R2审核规则的用户；必须专家审核后发布。",
    "exclusion_criteria": [
      "R3信号",
      "医生限制运动",
      "急性损伤",
      "严重膝髋踝疼痛",
      "明显眩晕或平衡失控",
      "低血糖/血压红色预警"
    ],
    "fitt_vp": {
      "frequency": "3-7天/周；初学者每周3天起，熟练后可每日短时练习。",
      "intensity": "RPE 9-12为主，动作缓慢、呼吸自然；心率仅作辅助记录，β受体阻滞剂、老年人和慢病用户不要单纯依赖心率。",
      "time": "每次10-40分钟；初期可10-15分钟，逐步延长。",
      "type": [
        "简化太极拳",
        "八段锦",
        "健身气功基础套路",
        "站姿重心转移",
        "呼吸放松",
        "柔和步法"
      ],
      "volume": "每次1-2套短套路或5-8个动作；每周累计60-180分钟，视风险等级调整。",
      "progression": "先学动作路线和呼吸，再延长练习时间；不追求低桩、长时间站桩或大幅度扭转；膝痛者降低屈膝角度。"
    },
    "precautions": [
      "R2用户必须专家审核后发布",
      "传统功法不替代药物或康复治疗",
      "注意场地防滑，避免低头旋转过快",
      "动作幅度以无痛为原则"
    ],
    "contraindications": [
      "胸痛/晕厥/严重气短",
      "眩晕加重",
      "膝痛明显增加",
      "血糖/血压红色预警"
    ],
    "monitoring_indicators": [
      "RPE",
      "疼痛评分",
      "眩晕",
      "单腿站立",
      "练习完成率",
      "运动后恢复感"
    ],
    "reassessment_cycle": "4-6周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "待专家确认：中国传统功法适应证、禁忌和动作库分级"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议",
      "由 TPL_R1R2_002 拆分而来：R2版本必须专家审核后发布。"
    ]
  },
  {
    "template_code": "TPL_R2_007",
    "draft_label": "专家审核草案",
    "name": "R2 呼吸疾病稳定型低强度活动模板",
    "risk_level": "R2",
    "cluster_tags": [
      "呼吸疾病",
      "低血氧风险",
      "慢病稳定型",
      "需专家审核"
    ],
    "goal_tags": [
      "活动耐量",
      "呼吸控制",
      "低强度心肺",
      "安全监测"
    ],
    "suitable_population": "已报告慢性呼吸系统疾病但稳定、无严重气短或静息血氧红色预警者；必须专家审核后发布。",
    "exclusion_criteria": [
      "严重或异常气短",
      "静息SpO2红色预警",
      "急性加重/发热感染",
      "胸痛或晕厥",
      "医生限制运动"
    ],
    "fitt_vp": {
      "frequency": "低到中等强度有氧3-5天/周；呼吸练习每日短时；轻抗阻2天/周。",
      "intensity": "RPE 9-12，呼吸困难评分需纳入监测待专家确认；不单纯依赖心率，尤其是慢病、老年或用药人群；以能说短句、无明显气促恶化为准。",
      "time": "每次10-30分钟，可采用间歇分段，如5-10分钟×2-3段。",
      "type": [
        "慢走",
        "固定车低阻力",
        "呼吸控制训练",
        "上肢/下肢轻抗阻",
        "柔韧放松"
      ],
      "volume": "每周60-150分钟起，视症状和血氧反应逐步调整；抗阻4-8个动作，1-2组。",
      "progression": "连续1-2周无异常气短、血氧稳定且专家确认后再增加5%-10%；优先增加时间，谨慎增加强度。"
    },
    "precautions": [
      "必须专家审核后发布",
      "如配置血氧监测，低于平台安全阈值立即停止并按预案处理",
      "避免寒冷、污染、高温高湿环境中运动",
      "平台不调整吸入药或氧疗"
    ],
    "contraindications": [
      "严重气短",
      "SpO2低于红色阈值",
      "胸痛/晕厥",
      "发绀、意识异常",
      "急性呼吸道感染加重"
    ],
    "monitoring_indicators": [
      "SpO2",
      "呼吸困难评分待扩展字段",
      "RPE",
      "咳嗽/喘息",
      "运动后恢复时间",
      "用药情况"
    ],
    "reassessment_cycle": "2-4周",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025",
      "待专家确认：呼吸疾病运动SpO2阈值和氧疗边界"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ]
  },
  {
    "template_code": "TPL_R3_001",
    "draft_label": "专家审核草案",
    "name": "R3 安全提醒与医学评估/转介模板",
    "risk_level": "R3",
    "cluster_tags": [
      "高风险转介",
      "红色信号",
      "不生成训练处方"
    ],
    "goal_tags": [
      "安全提醒",
      "医学评估",
      "转介建议"
    ],
    "suitable_population": "任一R3规则命中者：胸痛/胸闷、晕厥/黑蒙、严重气短、明显心悸、医生限制运动、近期急性损伤、静息血压/血糖/血氧红色预警、重度疼痛等。",
    "exclusion_criteria": [
      "不适用；本模板用于R3安全提醒，不是训练处方。"
    ],
    "fitt_vp": null,
    "precautions": [
      "R3不生成训练处方",
      "提示用户尽快进行医学评估；若症状急性、严重或进行性加重，应及时寻求急救/急诊帮助",
      "平台不得解释为诊断或治疗建议"
    ],
    "contraindications": [
      "任何结构化训练处方",
      "高强度活动",
      "正式体测",
      "自行增加运动量"
    ],
    "monitoring_indicators": [
      "红色信号是否缓解",
      "是否已就医/评估",
      "医生限制意见",
      "复评风险等级"
    ],
    "reassessment_cycle": "完成医学评估后复评",
    "expert_review_required": true,
    "stop_exercise_signals": [
      "胸痛、胸闷或胸部压迫感",
      "晕厥、黑蒙、明显头晕",
      "异常或严重气短",
      "明显心悸、心跳不规则或不适",
      "运动中疼痛快速加重或疼痛≥7/10",
      "步态不稳、跌倒、意识异常",
      "静息或运动中血压/血糖/血氧出现平台设定的红色预警"
    ],
    "evidence_refs": [
      "WHO Guidelines on physical activity and sedentary behaviour, 2020",
      "Exercise is Medicine / ACSM Exercise Preparticipation Health Screening Questionnaire, 2019",
      "PAR-Q+ / ePARmed-X+ official materials, 2025"
    ],
    "version": "v0.1",
    "expert_review_status": "DRAFT_PENDING_EXPERT_REVIEW",
    "status": "DRAFT",
    "pending_expert_confirmation": [
      "本模板适用人群、阈值、运动项目禁忌和进阶幅度需经运动医学/临床专家审核确认",
      "不得用于临床诊断、急救处置、药物调整或替代医生建议"
    ],
    "allow_training_prescription": false,
    "system_action": "仅输出安全提醒与医学评估/转介建议；锁定AI训练处方生成。"
  }
]
```
