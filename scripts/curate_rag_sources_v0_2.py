#!/usr/bin/env python3
"""Curate and download v0.2 RAG sources for the exercise prescription platform."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = ROOT / "rag_data"
ARCHIVE = OUT / "web_archives_v0_2"
CATALOG_JSON = DOCS / "knowledge_source_catalog_v0_2.json"
REPORT_MD = DOCS / "knowledge_source_research_report_v0_2.md"
DOWNLOAD_JSON = OUT / "_download_report_v0_2.json"
DOWNLOAD_MD = OUT / "_download_report_v0_2.md"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


@dataclass
class Source:
    source_id: str
    title: str
    organization: str
    official_url: str
    download_url: str
    document_type: str
    version: str
    published_date: str
    language: str
    scope: list[str]
    knowledge_tags: list[str]
    license_status: str
    ingestion_recommendation: str
    copyright_note: str
    why_useful: str
    risk_level: str
    priority: str
    suitability_note: str
    local_filename: str = ""
    action: str = "metadata"  # download, archive, metadata
    archive_url: str = ""
    referer: str = ""
    downloaded_files: list[str] = field(default_factory=list)
    download_status: str = "pending"
    download_note: str = ""

    def public_json(self) -> dict:
        return {
            "source_id": self.source_id,
            "title": self.title,
            "organization": self.organization,
            "official_url": self.official_url,
            "download_url": self.download_url,
            "document_type": self.document_type,
            "version": self.version,
            "published_date": self.published_date,
            "language": self.language,
            "scope": self.scope,
            "knowledge_tags": self.knowledge_tags,
            "license_status": self.license_status,
            "ingestion_recommendation": self.ingestion_recommendation,
            "copyright_note": self.copyright_note,
            "why_useful": self.why_useful,
            "risk_level": self.risk_level,
        }


def sources() -> list[Source]:
    s = Source
    return [
        s("SRC2-001", "ACSM Position Stands", "American College of Sports Medicine (ACSM)", "https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/", "网页索引；单篇 LWW 全文需逐篇确认访问权限", "立场声明", "current index", "accessed 2026-06-01", "en", ["运动专业人员", "慢病与一般人群"], ["处方生成", "FITT-VP", "专家审核依据"], "授权待确认", "摘要入库", "ACSM 官网公开索引；LWW 单篇全文授权按期刊页面判断。", "权威立场声明索引，可作为规则审核入口，但不应全文复制受限期刊内容。", "medium", "P1", "保留索引和摘要；单篇若遇 403 或订阅墙只记录元数据。", action="archive", archive_url="https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/"),
        s("SRC2-002", "ACSM Physical Activity Guidelines and Recommendations", "ACSM", "https://acsm.org/education-resources/trending-topics-resources/physical-activity-guidelines/", "网页资料；归档 HTML 摘要", "指南网页", "current webpage", "accessed 2026-06-01", "en", ["成年人", "儿童青少年", "老年人", "慢病患者"], ["运动处方原则库", "FITT-VP", "用户教育"], "授权待确认", "摘要入库", "ACSM 官网公开网页；建议仅保留摘要、链接和引用。", "集中链接 ACSM 对身体活动指南和 PAGAC 证据综述的解读。", "medium", "P1", "适合作为专家审核依据，不作为全文商业转载。", action="archive", archive_url="https://acsm.org/education-resources/trending-topics-resources/physical-activity-guidelines/"),
        s("SRC2-003", "ACSM’s Guidelines for Exercise Testing and Prescription, 12th Edition", "ACSM / Wolters Kluwer", "https://shop.acsm.org/acsm-guidelines-for-exercise-testing-and-prescription-12th-edition/p/9781975196694", "需购买；不下载非法 PDF", "教材", "12th Edition", "2025", "en", ["运动测试", "运动处方", "专业人员"], ["风险筛查", "处方生成", "禁忌动作"], "需购买", "只存元数据", "受版权保护教材，只能记录书目信息、购买链接和引用信息。", "核心教材，但第一版知识库不可使用盗版全文。", "high", "P3", "只做元数据，采购后再走授权流程。"),
        s("SRC2-004", "Exercise Preparticipation Screening Questionnaire for Exercise Professionals", "Exercise is Medicine / ACSM", "https://www.exerciseismedicine.org/wp-content/uploads/2021/04/EIM-exercise-preparticipation-screening.pdf", "https://www.exerciseismedicine.org/wp-content/uploads/2021/04/EIM-exercise-preparticipation-screening.pdf", "筛查工具 PDF", "2021 hosted copy", "2021-04", "en", ["成年人", "慢病患者", "运动前筛查"], ["风险筛查", "报告免责声明", "禁忌动作"], "授权待确认", "摘要入库", "EIM 官网公开 PDF；授权条款需人工确认。", "与平台风险分层和转诊提醒强相关。", "medium", "P0", "适合做筛查规则摘要和来源链接。", action="download", local_filename="SRC-004_EIM_exercise_preparticipation_screening.pdf"),
        s("SRC2-005", "Exercise is Medicine Rx for Health Series", "Exercise is Medicine / ACSM", "https://www.exerciseismedicine.org/eim-in-action/health-care/resources/rx-for-health-series/", "官网页面含多病种患者手册；当前访问可能触发机器人验证", "患者/医务人员手册", "current webpage", "accessed 2026-06-01", "en", ["高血压", "糖尿病", "血脂异常", "肥胖", "COPD", "CKD"], ["慢病干预", "用户教育", "FITT-VP"], "授权待确认", "需人工授权", "EIM 页面公开但自动下载受机器人验证限制；不可绕过。", "病种覆盖高度匹配，但需人工浏览器下载或授权确认。", "medium", "P2", "先记录元数据；可由人工浏览器确认后补入。"),
        s("SRC2-006", "PAR-Q+ and ePARmed-X+ Official Printable Forms", "PAR-Q+ Collaboration / ePARmed-X+", "https://eparmedx.com/print-versions-of-par-q/", "https://eparmedx.com/print-versions-of-par-q/", "筛查工具", "2025 / 2026 printable forms", "2025-01 / 2026-01", "en", ["成年人", "运动前筛查", "医疗转诊"], ["风险筛查", "报告免责声明", "禁忌动作"], "授权待确认", "摘要入库", "官网提示表单不得未经许可改编或并入电子调查；平台使用需人工授权确认。", "运动前安全筛查核心资料，适合做内部规则参考。", "high", "P0", "只抽取原则和引用；上线产品需确认授权。", action="archive", archive_url="https://eparmedx.com/print-versions-of-par-q/"),
        s("SRC2-007", "PAR-Q+ 2025 Fillable PDF", "PAR-Q+ Collaboration / ePARmed-X+", "https://eparmedx.com/print-versions-of-par-q/", "https://eparmedx.com/wp-content/uploads/2025/01/PARQPlus2025Fillable.pdf", "筛查工具 PDF", "2025 fillable", "2025-01", "en", ["成年人", "运动前筛查"], ["风险筛查", "报告免责声明"], "授权待确认", "摘要入库", "官网可下载，但表单改编/电子化需授权。", "用于对照平台筛查问卷的安全边界。", "high", "P0", "保留源文件和版权提醒。", action="download", local_filename="SRC2-007_PARQPlus_2025_fillable.pdf", referer="https://eparmedx.com/print-versions-of-par-q/"),
        s("SRC2-008", "WHO Guidelines on Physical Activity and Sedentary Behaviour", "World Health Organization", "https://www.who.int/publications/i/item/9789240015128", "https://iris.who.int/server/api/core/bitstreams/faa83413-d89e-4be9-bb01-b24671aef7ca/content", "指南 PDF", "2020; ISBN 9789240015128", "2020-11-25", "en", ["儿童青少年", "成年人", "老年人", "孕产期", "慢病患者", "残障人群"], ["运动处方原则库", "FITT-VP", "久坐行为"], "开放许可", "全文入库", "WHO 页面标注 CC BY-NC-SA 3.0 IGO；需署名并保留许可。", "第一版基础剂量和久坐行为规则的 P0 来源。", "low", "P0", "可全文入库并保留来源署名。", action="download", local_filename="SRC2-008_WHO_physical_activity_sedentary_behaviour_guidelines.pdf"),
        s("SRC2-009", "Physical Activity Guidelines for Americans, 2nd Edition", "U.S. Department of Health and Human Services / ODPHP", "https://odphp.health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines/current-guidelines", "https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf", "指南 PDF", "2nd Edition", "2018", "en", ["3 岁及以上人群", "成年人", "老年人", "慢病/残障人群"], ["运动处方原则库", "FITT-VP", "老年平衡"], "明确公开", "全文入库", "美国政府公开指南；需保留来源和免责声明。", "与 WHO 交叉校验运动剂量和老年多成分训练。", "low", "P0", "适合全文入库。", action="download", local_filename="SRC2-009_US_physical_activity_guidelines_2nd_edition.pdf"),
        s("SRC2-010", "CDC Physical Activity Basics: Older Adults", "U.S. Centers for Disease Control and Prevention", "https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html", "网页资料；归档 HTML 摘要", "政府网页", "current webpage", "accessed 2026-06-01", "en", ["老年人", "跌倒风险", "慢病患者"], ["老年功能下降", "用户教育", "FITT-VP"], "明确公开", "全文入库", "美国政府网页；建议记录访问日期。", "适合转写成用户端老年活动建议和免责声明。", "low", "P1", "网页全文/摘要入库。", action="archive", archive_url="https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html"),
        s("SRC2-011", "中国人群身体活动指南（2021）", "《中国人群身体活动指南》编写委员会 / 中华流行病学杂志 / 中国疾控中心域名", "http://chinaepi.icdc.cn/zhlxbx/ch/reader/view_abstract.aspx?file_no=20220102&flag=1", "期刊页面；PDF 自动下载需页面脚本，未绕过", "指南论文", "2021", "2022-01-26", "zh-CN", ["中国人群", "成年人", "儿童青少年", "老年人"], ["运动处方原则库", "FITT-VP", "用户教育"], "授权待确认", "摘要入库", "期刊页面公开摘要和 HTML 全文入口；人民卫生出版社书籍版本需购买。", "中国人群本土化身体活动建议的关键来源。", "medium", "P0", "先归档官方期刊页面和 HTML 全文，不使用转载 PDF。", action="archive", archive_url="http://chinaepi.icdc.cn/zhlxbx/article/html/20220102"),
        s("SRC2-012", "国民体质测定标准（2023 年修订）", "国家国民体质监测中心 / 国家体育总局体育科学研究所", "https://www.ciss.cn/tzgg/info/2023/32672.html", "https://www.ciss.cn/upload/b87314e6-ed00-44a1-adf3-d1c62df9d285/280c176d-f99e-4ee6-9987-ca5742b30c80.pdf", "国家标准/公开标准 PDF", "2023 年修订", "2023", "zh-CN", ["国民体质", "成年人", "老年人", "体测评价"], ["体质测试与评价库", "阶段评估"], "免费公开/授权待确认", "摘要入库", "官方附件公开下载；商业全文再发布授权需确认。", "体测指标、评价等级和测试流程的核心来源。", "medium", "P0", "适合作为体质评估规则来源。", action="download", local_filename="SRC2-012_national_physical_fitness_measurement_standard_2023.pdf", referer="https://www.ciss.cn/tzgg/info/2023/32672.html"),
        s("SRC2-013", "国家学生体质健康标准（2014 年修订）", "教育部等 / 中国学生体质健康网", "https://www.csh.moe.edu.cn/wtzx/zcwj/20141226/2c909e854a8490a4014a84fda9b4001d.html", "https://www.csh.moe.edu.cn/u/cms/attached/file/20141226/20141226131102_753.docx", "国家学生标准 DOCX", "2014 年修订", "2014-07-28", "zh-CN", ["学校体育", "学生体质健康", "未成年人"], ["体质测试与评价库", "学校体育"], "明确公开", "全文入库", "官方政策文件附件；需保留版本和来源。", "学校体育/未成年人评价模块核心来源。", "low", "P0", "适合全文入库。", action="download", local_filename="SRC2-013_national_student_physical_health_standard_2014.docx"),
        s("SRC2-014", "成人高血压食养指南（2024 年版）", "国家卫生健康委办公厅", "https://www.nhc.gov.cn/ylyjs/gzdt/202407/256b4eb8398440a8811344c7be50a333.shtml", "https://www.nhc.gov.cn/ylyjs/gzdt/202407/256b4eb8398440a8811344c7be50a333/files/1734003011589_33945.pdf", "政府指南 PDF", "2024 年版", "2024-07", "zh-CN", ["高血压", "成年人", "慢病患者"], ["慢病干预", "高血压", "用户教育"], "免费公开/授权待确认", "摘要入库", "国家卫健委公开附件；运动内容可摘要引用，全文商业使用需确认。", "含生活方式和运动建议，可补齐高血压干预话术。", "medium", "P0", "适合慢病规则摘要。", action="download", local_filename="SRC2-014_NHC_adult_hypertension_nutrition_exercise_2024.pdf"),
        s("SRC2-015", "成人高血糖食养指南（2024 年版）", "国家卫生健康委办公厅", "https://www.nhc.gov.cn/ylyjs/gzdt/202407/256b4eb8398440a8811344c7be50a333.shtml", "https://www.nhc.gov.cn/ylyjs/gzdt/202407/256b4eb8398440a8811344c7be50a333/files/1734003011997_53103.pdf", "政府指南 PDF", "2024 年版", "2024-07", "zh-CN", ["高血糖", "糖尿病前期", "成年人"], ["慢病干预", "糖代谢", "用户教育"], "免费公开/授权待确认", "摘要入库", "国家卫健委公开附件；全文商业使用需确认。", "含高血糖人群生活方式与活动建议。", "medium", "P0", "适合糖代谢干预摘要。", action="download", local_filename="SRC2-015_NHC_adult_hyperglycemia_nutrition_exercise_2024.pdf"),
        s("SRC2-016", "成人高脂血症食养指南（2024 年版）", "国家卫生健康委办公厅", "https://www.nhc.gov.cn/ylyjs/gzdt/202407/256b4eb8398440a8811344c7be50a333.shtml", "https://www.nhc.gov.cn/ylyjs/gzdt/202407/256b4eb8398440a8811344c7be50a333/files/1734003011142_13562.pdf", "政府指南 PDF", "2024 年版", "2024-07", "zh-CN", ["血脂异常", "成年人", "慢病患者"], ["慢病干预", "血脂异常", "用户教育"], "免费公开/授权待确认", "摘要入库", "国家卫健委公开附件；全文商业使用需确认。", "血脂异常生活方式和运动建议的官方中文来源。", "medium", "P0", "适合血脂异常干预摘要。", action="download", local_filename="SRC2-016_NHC_adult_hyperlipidemia_nutrition_exercise_2024.pdf"),
        s("SRC2-017", "成人高尿酸血症与痛风食养指南（2024 年版）", "国家卫生健康委办公厅", "https://www.nhc.gov.cn/ylyjs/gzdt/202407/256b4eb8398440a8811344c7be50a333.shtml", "https://www.nhc.gov.cn/ylyjs/gzdt/202407/256b4eb8398440a8811344c7be50a333/files/1734003012304_36543.pdf", "政府指南 PDF", "2024 年版", "2024-07", "zh-CN", ["高尿酸", "痛风", "成年人"], ["慢病干预", "禁忌动作", "用户教育"], "免费公开/授权待确认", "摘要入库", "国家卫健委公开附件；全文商业使用需确认。", "虽然非起始清单核心病种，但有助于肥胖/代谢综合征共病处方限制。", "medium", "P2", "可选摘要入库。", action="download", local_filename="SRC2-017_NHC_adult_hyperuricemia_gout_nutrition_exercise_2024.pdf"),
        s("SRC2-018", "中国 2 型糖尿病运动治疗指南（2024 版）", "国家老年医学中心、中华医学会糖尿病学分会、中国体育科学学会等 / 中国全科医学", "https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2024.A0019", "https://www.chinagp.net/CN/article/downloadArticleFile.do?attachType=PDF&id=8343", "临床运动指南 PDF", "2024 版", "2024", "zh-CN", ["2 型糖尿病", "老年人", "慢病患者"], ["慢病干预", "FITT-VP", "糖尿病", "风险筛查"], "授权待确认", "摘要入库", "期刊官网开放下载；版权授权需确认。", "直接面向运动治疗，极适配处方生成。", "medium", "P0", "第一版慢病运动干预核心来源。", action="download", local_filename="SRC2-018_china_type2_diabetes_exercise_treatment_guideline_2024.pdf", referer="https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2024.A0019"),
        s("SRC2-019", "中国高血压防治指南（2024 年修订版）", "中国高血压防治指南修订委员会等 / 中华高血压杂志", "https://cjournal.hep.com.cn/1673-7245/CN/1160171857581368285", "https://cjournal.hep.com.cn/1673-7245/CN/PDF/10.16439/j.issn.1673-7245.2024.07.002", "临床指南 PDF", "2024 年修订版", "2024-07-15", "zh-CN", ["高血压", "心血管风险", "成年人"], ["慢病干预", "风险筛查", "高血压"], "授权待确认", "摘要入库", "期刊平台开放下载；版权授权需确认。", "用于高血压分级、运动注意事项和转诊边界。", "medium", "P0", "摘要入库，避免替代临床诊疗。", action="download", local_filename="SRC2-019_china_hypertension_guideline_2024_revision.pdf", referer="https://cjournal.hep.com.cn/1673-7245/CN/1160171857581368285"),
        s("SRC2-020", "中国血脂管理指南（2023 年）", "中华医学会心血管病学分会等", "https://csc.cma.org.cn/art/2023/3/25/art_653_49291.html", "https://csc.cma.org.cn/attach/0/96b4e603cee74b7fb208b278aa92bd8b.pdf", "临床指南 PDF", "2023 年", "2023", "zh-CN", ["血脂异常", "ASCVD 风险", "成年人"], ["慢病干预", "风险筛查", "血脂异常"], "授权待确认", "摘要入库", "学会页面公开附件；版权授权需确认。", "用于血脂异常风险分层和运动建议边界。", "medium", "P1", "摘要入库。", action="download", local_filename="SRC2-020_china_blood_lipid_management_guideline_2023.pdf"),
        s("SRC2-021", "体重管理指导原则（2024 年版）", "国家卫生健康委等", "https://www.nhc.gov.cn/cms-search/xxgk/getManuscriptXxgk.htm?id=5e4f0829d7e34e639ae138b462edb3cf", "https://www.nhc.gov.cn/cms-search/downFiles/f932c5c0004f4959b92613dd1024483c.pdf", "政府指导原则 PDF", "2024 年版", "2024", "zh-CN", ["体重管理", "肥胖", "超重", "全人群"], ["慢病干预", "肥胖", "用户教育"], "免费公开/授权待确认", "摘要入库", "国家卫健委公开附件；全文商业使用需确认。", "平台体重管理处方和报告建议的官方来源。", "medium", "P0", "摘要入库。", action="download", local_filename="SRC2-021_weight_management_guiding_principles_2024.pdf"),
        s("SRC2-022", "成人肥胖食养指南（2024 年版）", "国家卫生健康委", "https://www.nhc.gov.cn/sps/c100088/202402/9ba512ba8e314a47a181db11d2fa188d.shtml", "https://www.nhc.gov.cn/sps/c100088/202402/9ba512ba8e314a47a181db11d2fa188d/files/1743476136267_20714.pdf", "政府指南 PDF", "2024 年版", "2024-02", "zh-CN", ["成人肥胖", "体重管理", "成年人"], ["慢病干预", "肥胖", "用户教育"], "免费公开/授权待确认", "摘要入库", "国家卫健委公开附件；全文商业使用需确认。", "肥胖和体重管理模块的重要补充。", "medium", "P1", "摘要入库。", action="download", local_filename="SRC2-022_adult_obesity_food_nutrition_guideline_2024.pdf"),
        s("SRC2-023", "慢性阻塞性肺疾病临床康复循证实践指南", "中国康复理论与实践", "https://www.cjrtponline.com/CN/10.3969/j.issn.1006-9771.2021.01.002", "https://www.cjrtponline.com/CN/article/downloadArticleFile.do?attachType=PDF&id=7958", "循证实践指南 PDF", "2021", "2021", "zh-CN", ["慢阻肺", "肺康复", "慢病患者"], ["慢病干预", "COPD", "风险筛查"], "授权待确认", "摘要入库", "期刊官网开放下载；版权授权需确认。", "COPD 运动康复规则、禁忌和监测的重要来源。", "medium", "P0", "摘要入库。", action="download", local_filename="SRC2-023_COPD_clinical_rehab_evidence_based_guideline.pdf", referer="https://www.cjrtponline.com/CN/10.3969/j.issn.1006-9771.2021.01.002"),
        s("SRC2-024", "冠心病心脏康复基层指南（2020 年）", "中华医学会 / 中华全科医师杂志", "https://rs.yiigle.com/cmaid/1309072", "网页可访问；PDF 下载/全文权限需确认", "基层临床指南", "2020 年", "2021-02", "zh-CN", ["冠心病", "心脏康复", "基层医疗"], ["慢病干预", "冠心病", "风险筛查"], "授权待确认", "摘要入库", "中华医学期刊页面可访问，但提示订阅/权限；不抓取受限 PDF。", "心血管运动康复和转诊边界的关键中国来源。", "medium", "P1", "归档页面和摘要，全文需授权。", action="archive", archive_url="https://rs.yiigle.com/cmaid/1309072"),
        s("SRC2-025", "中国脑卒中防治指导规范（2021 年版）", "国家卫生健康委脑卒中防治工程委员会", "https://www.nhc.gov.cn/yzygj/c100068/202108/682b5a958a7443b2b8269ab9303cfbeb.shtml", "https://www.nhc.gov.cn/yzygj/c100068/202108/682b5a958a7443b2b8269ab9303cfbeb/files/1732863879562_18762.pdf", "政府规范 PDF", "2021 年版", "2021-08", "zh-CN", ["脑卒中", "二级预防", "康复转诊"], ["慢病干预", "脑卒中", "风险筛查"], "免费公开/授权待确认", "摘要入库", "国家卫健委公开附件；全文商业使用需确认。", "用于卒中风险警示、转诊和康复阶段边界，不替代运动康复专科指南。", "medium", "P1", "摘要入库。", action="download", local_filename="SRC2-025_china_stroke_prevention_control_standard_2021.pdf"),
        s("SRC2-026", "AHA/ASA Guidelines for Adult Stroke Rehabilitation and Recovery Slide Set", "American Heart Association / American Stroke Association", "https://www.heart.org/en/professional/quality-improvement/stroke-rehabilitation-and-recovery", "https://www.heart.org/-/media/PHD-Files-2/Science-News/g/guidelines_for_adult_stroke_rehab_and_recovery_ucm_485182.pdf", "指南配套资料 PDF", "2016 guideline slide set", "2016", "en", ["脑卒中", "康复", "成年人"], ["慢病干预", "脑卒中", "风险筛查"], "免费公开/授权待确认", "摘要入库", "AHA 官方公开课件；指南论文版权另行确认。", "补齐卒中康复运动干预和安全监测的国际依据。", "medium", "P2", "摘要入库。", action="download", local_filename="SRC2-026_AHA_ASA_adult_stroke_rehab_recovery_slide_set.pdf"),
        s("SRC2-027", "老年人失能预防运动干预临床实践指南（2023 版）", "中国全科医学等", "https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2023.0058", "https://www.chinagp.net/CN/article/downloadArticleFile.do?attachType=PDF&id=7338", "临床实践指南 PDF", "2023 版", "2023", "zh-CN", ["老年人", "失能预防", "运动干预"], ["慢病干预", "老年功能下降", "FITT-VP"], "授权待确认", "摘要入库", "期刊官网开放下载；版权授权需确认。", "老年人多组分运动、平衡和肌力训练建议高度适配。", "medium", "P0", "摘要入库。", action="download", local_filename="SRC2-027_older_adult_disability_prevention_exercise_guideline_2023.pdf", referer="https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2023.0058"),
        s("SRC2-028", "原发性骨质疏松症诊疗指南（2022）", "中华医学会骨质疏松和骨矿盐疾病分会 / 中国全科医学", "https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2023.0121", "https://www.chinagp.net/CN/article/downloadArticleFile.do?attachType=PDF&id=7181", "临床指南 PDF", "2022", "2023", "zh-CN", ["骨质疏松", "老年人", "跌倒/骨折风险"], ["慢病干预", "骨质疏松", "禁忌动作"], "授权待确认", "摘要入库", "期刊官网开放下载；版权授权需确认。", "用于骨质疏松风险、禁忌动作和力量/平衡建议边界。", "medium", "P1", "摘要入库。", action="download", local_filename="SRC2-028_primary_osteoporosis_diagnosis_treatment_guideline_2022.pdf", referer="https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2023.0121"),
        s("SRC2-029", "社区老年人跌倒预防控制技术标准 WS/T 887—2026", "国家卫生健康委员会", "https://www.nhc.gov.cn/fzs/c100048/202603/bc137ea10a084a9e87ed57902be81cb5.shtml", "https://www.nhc.gov.cn/fzs/c100048/202603/bc137ea10a084a9e87ed57902be81cb5/files/WST%20887%E2%80%942026.pdf", "卫生行业标准 PDF", "WS/T 887—2026", "2026-03", "zh-CN", ["老年人", "跌倒风险", "社区干预"], ["慢病干预", "老年跌倒", "风险筛查"], "免费公开/授权待确认", "摘要入库", "国家卫健委公开标准附件；全文商业使用需确认。", "跌倒风险筛查和运动干预建议的最新官方标准。", "medium", "P0", "摘要入库。", action="download", local_filename="SRC2-029_WST_887_2026_older_adult_fall_prevention_standard.pdf"),
        s("SRC2-030", "Step safely: strategies for preventing and managing falls across the life-course", "World Health Organization", "https://iris.who.int/handle/10665/340962", "https://iris.who.int/server/api/core/bitstreams/e7aabc9b-6978-43eb-a6b7-5172d11ce379/content", "工具包 PDF", "2021", "2021", "en", ["跌倒预防", "老年人", "全生命周期"], ["老年跌倒", "风险筛查", "用户教育"], "开放许可", "全文入库", "WHO IRIS 公开资料；需保留许可和署名。", "补充跌倒风险多因素干预和安全教育。", "low", "P1", "适合全文入库。", action="download", local_filename="SRC2-030_WHO_step_safely_fall_prevention.pdf"),
        s("SRC2-031", "通过学校促进身体活动：工具包", "World Health Organization", "https://iris.who.int/handle/10665/380678", "https://iris.who.int/server/api/core/bitstreams/10041f4e-8e4c-4a5e-8fca-569eb1f59be5/content", "学校身体活动工具包 PDF", "2024 Chinese edition", "2024", "zh-CN", ["学校体育", "儿童青少年", "健康促进学校"], ["学校体育", "用户教育", "运动处方原则库"], "开放许可", "全文入库", "WHO IRIS 中文版公开资料；需保留许可和署名。", "学校体育和儿童青少年身体活动策略的权威中文资料。", "low", "P0", "适合全文入库。", action="download", local_filename="SRC2-031_WHO_promoting_physical_activity_through_schools_toolkit_zh.pdf"),
        s("SRC2-032", "Making every school a health-promoting school: global standards and indicators", "WHO / UNESCO", "https://iris.who.int/handle/10665/341907", "https://iris.who.int/server/api/core/bitstreams/936bedca-bd90-4bfb-846f-c0e97d8a158a/content", "学校健康标准 PDF", "2021", "2021", "en", ["学校体育", "健康促进学校", "儿童青少年"], ["学校体育", "专家审核依据"], "开放许可", "全文入库", "WHO/UNESCO 公开资料，CC BY-NC-SA 3.0 IGO；需署名。", "为学校场景提供政策和指标背景。", "low", "P1", "适合全文入库。", action="download", local_filename="SRC2-032_WHO_UNESCO_health_promoting_school_global_standards.pdf"),
        s("SRC2-033", "中国儿童青少年身体活动指南", "中国循证儿科杂志 / 专家组", "https://www.cjebp.net/CN/Y2017/V12/I6/401", "期刊页面为准；当前页面访问不稳定，第三方 PDF 不使用", "指南论文", "2017", "2017", "zh-CN", ["儿童青少年", "学校体育", "身体活动"], ["学校体育", "FITT-VP", "用户教育"], "授权待确认", "只存元数据", "官方期刊页面访问不稳定；第三方 PDF 授权不明。", "儿童青少年身体活动本土指南，需后续人工确认官方全文。", "medium", "P2", "先记录元数据。"),
        s("SRC2-034", "团体标准《八段锦》（征求意见稿）", "中国健身气功协会 / 中华中医药学会 / 国家体育总局健身气功管理中心", "https://www.sport.gov.cn/qgzx/n5402/c29596700/content.html", "https://www.sport.gov.cn/qgzx/n5402/c29596700/part/29596710.pdf", "团体标准征求意见稿 PDF", "征求意见稿", "2026-04-30", "zh-CN", ["八段锦", "传统功法", "健身气功"], ["传统功法", "禁忌动作", "专家审核依据"], "授权待确认", "摘要入库", "公开征求意见附件，非正式最终标准；需标注版本状态。", "传统功法动作规范和术语的权威起点。", "medium", "P1", "摘要入库，注明征求意见稿。", action="download", local_filename="SRC2-034_baduanjin_group_standard_draft.pdf", referer="https://www.sport.gov.cn/qgzx/n5402/c29596700/content.html"),
        s("SRC2-035", "团体标准《八段锦》（征求意见稿）编制说明", "中国健身气功协会 / 中华中医药学会", "https://www.sport.gov.cn/qgzx/n5402/c29596700/content.html", "https://www.sport.gov.cn/qgzx/n5402/c29596700/part/29596711.pdf", "团体标准编制说明 PDF", "征求意见稿", "2026-04-30", "zh-CN", ["八段锦", "传统功法", "标准制定"], ["传统功法", "专家审核依据"], "授权待确认", "摘要入库", "公开征求意见附件，非正式最终标准；需标注版本状态。", "说明标准适用范围和制定依据，适合专家审核。", "medium", "P2", "摘要入库。", action="download", local_filename="SRC2-035_baduanjin_group_standard_explanation.pdf", referer="https://www.sport.gov.cn/qgzx/n5402/c29596700/content.html"),
        s("SRC2-036", "健身气功运动处方研制指南", "国家体育总局健身气功管理中心", "https://www.sport.gov.cn/qgzx/n5405/c952164/content.html", "https://www.sport.gov.cn/qgzx/n5405/c952164/part/597079.doc", "传统功法运动处方指南 DOC", "公开附件", "2017-06-19", "zh-CN", ["健身气功", "传统功法", "运动处方"], ["传统功法", "处方生成", "禁忌动作"], "免费公开/授权待确认", "摘要入库", "国家体育总局健身气功管理中心公开附件；全文商业使用需确认。", "直接对应传统功法运动处方建模，是本平台非常适配的来源。", "medium", "P0", "摘要入库，保留原始 DOC。", action="download", local_filename="SRC2-036_fitness_qigong_exercise_prescription_development_guide.doc"),
        s("SRC2-037", "打造具有中国特色的全民健身运动处方库", "国家体育总局健身气功管理中心", "https://www.sport.gov.cn/qgzx/n5405/c952164/content.html", "网页资料；归档 HTML 摘要", "官方动态/说明", "2017", "2017-06-19", "zh-CN", ["健身气功", "运动处方库", "传统功法"], ["传统功法", "专家审核依据"], "免费公开/授权待确认", "摘要入库", "官方网页公开，适合摘要引用。", "解释健身气功运动处方库建设思路和适用人群。", "medium", "P2", "归档页面摘要。", action="archive", archive_url="https://www.sport.gov.cn/qgzx/n5405/c952164/content.html"),
        s("SRC2-038", "ACSM Resistance Training Position Stand Slide Deck", "ACSM", "https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/", "https://acsm.org/wp-content/uploads/2026/03/Pronouncement-ppt-deck_resistance-training-ps.pdf", "立场声明配套课件 PDF", "2026", "2026-03", "en", ["健康成年人", "抗阻训练", "肌力训练"], ["FITT-VP", "处方生成", "专家审核依据"], "授权待确认", "摘要入库", "ACSM 官网公开下载课件；授权条款需确认。", "抗阻训练处方参数的专业补充。", "medium", "P2", "摘要入库。", action="download", local_filename="SRC2-038_ACSM_resistance_training_position_stand_slide_deck_2026.pdf", referer="https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/"),
        s("SRC2-039", "成人慢性肾脏病患者运动康复专家共识", "中华肾脏病杂志", "http://www.cjn.org.cn/CN/10.3760/cma.j.issn.1001-7097.2019.07.001", "期刊页面/权限需人工确认", "专家共识", "2019", "2019", "zh-CN", ["慢性肾病", "运动康复", "成年人"], ["慢病干预", "CKD", "风险筛查"], "授权待确认", "只存元数据", "当前 DOI 页面未稳定解析到目标全文；不使用第三方转载 PDF。", "CKD 是平台缺口病种，需后续人工确认授权全文。", "medium", "P3", "只存元数据。"),
        s("SRC2-040", "健康中国行动（2019—2030 年）", "健康中国行动推进委员会 / 国家卫生健康委", "https://www.nhc.gov.cn/guihuaxxs/c100133/201907/2a6ed52f1c264203b5351bdbbadd2da8.shtml", "网页资料；国家卫健委页面当前自动访问返回 412，建议人工浏览器归档", "政策文件", "2019—2030 年", "2019-07-15", "zh-CN", ["健康中国行动", "全民健身", "健康促进"], ["用户报告免责声明", "专家审核依据"], "明确公开", "只存元数据", "政府公开政策页面；自动访问触发 412，建议人工浏览器归档。", "为用户报告免责声明和健康促进表述提供政策依据。", "low", "P2", "只存元数据，后续人工归档。"),
    ]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def file_ok(path: Path) -> bool:
    head = path.read_bytes()[:12]
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return head.startswith(b"%PDF")
    if suffix == ".docx" or suffix == ".zip":
        return head.startswith(b"PK")
    if suffix == ".doc":
        return head.startswith(b"\xd0\xcf\x11\xe0")
    if suffix == ".xml":
        return head.lstrip().startswith(b"<?xml")
    if suffix == ".json":
        try:
            json.loads(path.read_text("utf-8"))
            return True
        except Exception:
            return False
    if suffix in {".html", ".md"}:
        return True
    return bool(head)


def existing_hashes() -> dict[str, Path]:
    hashes: dict[str, Path] = {}
    for p in OUT.rglob("*"):
        if p.is_file() and not p.name.startswith(".") and not p.name.endswith(".tmp"):
            try:
                hashes.setdefault(sha256(p), p)
            except Exception:
                pass
    return hashes


def clean_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def archive_page(src: Source) -> None:
    url = src.archive_url or src.official_url
    base = src.source_id + "_" + re.sub(r"[^A-Za-z0-9]+", "_", src.title)[:80].strip("_")
    html_path = ARCHIVE / f"{base}.html"
    md_path = ARCHIVE / f"{base}_summary.md"
    if html_path.exists() and md_path.exists():
        src.download_status = "skipped_existing"
        src.downloaded_files = [str(html_path), str(md_path)]
        return
    try:
        r = requests.get(url, headers=HEADERS, timeout=45)
        if r.status_code >= 400:
            src.download_status = "failed"
            src.download_note = f"HTTP {r.status_code}"
            return
        r.encoding = r.apparent_encoding or r.encoding
        soup = BeautifulSoup(r.text, "lxml")
        text = clean_text(soup)
        headings = [h.get_text(" ", strip=True) for h in soup.find_all(re.compile("^h[1-3]$"))]
        lines = [
            f"# {src.source_id} {src.title}",
            "",
            f"- URL: {url}",
            f"- Archived at: {datetime.now(timezone.utc).isoformat()}",
            f"- License status: {src.license_status}",
            f"- Ingestion: {src.ingestion_recommendation}",
            "",
            "## Headings",
            *[f"- {h}" for h in headings[:20] if h],
            "",
            "## Extracted Text Preview",
            text[:2200],
        ]
        html_path.write_text(r.text, "utf-8")
        md_path.write_text("\n".join(lines) + "\n", "utf-8")
        src.download_status = "archived_page"
        src.downloaded_files = [str(html_path), str(md_path)]
    except Exception as exc:
        src.download_status = "failed"
        src.download_note = repr(exc)


def download_file(src: Source, hashes: dict[str, Path]) -> None:
    target = OUT / src.local_filename
    if target.exists() and file_ok(target):
        src.download_status = "skipped_existing"
        src.downloaded_files = [str(target)]
        return
    if target.exists() and not file_ok(target):
        target.unlink()
    headers = dict(HEADERS)
    if src.referer:
        headers["Referer"] = src.referer
    try:
        r = requests.get(src.download_url, headers=headers, timeout=60, stream=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        with tmp.open("wb") as f:
            for chunk in r.iter_content(1024 * 128):
                if chunk:
                    f.write(chunk)
        if r.status_code >= 400:
            tmp.unlink(missing_ok=True)
            src.download_status = "failed"
            src.download_note = f"HTTP {r.status_code}"
            return
        if not file_ok(tmp):
            snippet = tmp.read_bytes()[:160].decode("utf-8", "ignore").replace("\n", " ")
            tmp.unlink(missing_ok=True)
            src.download_status = "failed"
            src.download_note = f"unexpected content: {snippet[:120]}"
            return
        digest = sha256(tmp)
        if digest in hashes:
            tmp.unlink(missing_ok=True)
            src.download_status = "deduped_existing"
            src.downloaded_files = [str(hashes[digest])]
            src.download_note = f"same sha256 as {hashes[digest].name}"
            return
        tmp.replace(target)
        hashes[digest] = target
        src.download_status = "downloaded"
        src.downloaded_files = [str(target)]
    except Exception as exc:
        src.download_status = "failed"
        src.download_note = repr(exc)


def run_downloads(items: list[Source]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    hashes = existing_hashes()
    for src in items:
        if src.action == "download":
            download_file(src, hashes)
        elif src.action == "archive":
            archive_page(src)
        else:
            src.download_status = "metadata_only"


def md_link(url: str) -> str:
    return f"[链接]({url})" if url.startswith(("http://", "https://")) else url


def table(items: list[Source]) -> str:
    rows = [
        "| 编号 | 资料名称 | 来源机构 | 官方链接 | 下载链接 | 资料类型 | 版本或发布日期 | 适用范围 | 适合知识库模块 | 授权状态 | 推荐处理方式 | 风险备注 |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for x in items:
        rows.append(
            "| "
            + " | ".join(
                [
                    x.source_id,
                    x.title.replace("|", "/"),
                    x.organization.replace("|", "/"),
                    md_link(x.official_url),
                    md_link(x.download_url),
                    x.document_type,
                    x.version if x.version else x.published_date,
                    "、".join(x.scope),
                    "、".join(x.knowledge_tags),
                    x.license_status,
                    x.ingestion_recommendation,
                    x.suitability_note.replace("|", "/"),
                ]
            )
            + " |"
        )
    return "\n".join(rows)


def priority_section(items: list[Source]) -> str:
    lines = ["## 第二部分：优先纳入清单", ""]
    for p in ["P0", "P1", "P2", "P3"]:
        lines += [f"### {p}", ""]
        for x in [i for i in items if i.priority == p]:
            lines.append(f"- {x.source_id}：[{x.title}]({x.official_url})。{x.why_useful}")
        lines.append("")
    return "\n".join(lines)


def copyright_section(items: list[Source]) -> str:
    direct = [x for x in items if x.ingestion_recommendation == "全文入库" and x.license_status in {"明确公开", "开放许可"}]
    unclear = [x for x in items if "授权待确认" in x.license_status or x.ingestion_recommendation in {"摘要入库", "需人工授权"}]
    paid = [x for x in items if x.license_status == "需购买"]
    lines = ["## 第四部分：授权与版权审查", ""]
    lines.append("### 1. 可直接公开下载且适合全文入库")
    lines += [f"- {x.source_id}：[{x.title}]({x.download_url})（{x.license_status}）。" for x in direct]
    lines += ["", "### 2. 可公开访问但授权不明确，建议摘要入库或人工确认"]
    lines += [f"- {x.source_id}：[{x.title}]({x.official_url})。{x.copyright_note}" for x in unclear]
    lines += ["", "### 3. 付费或版权保护资料，只能做元数据引用"]
    lines += [f"- {x.source_id}：[{x.title}]({x.official_url})。{x.copyright_note}" for x in paid]
    lines += [
        "",
        "### 4. 明确不建议使用的来源类型",
        "- 盗版教材、破解 PDF、论坛求书帖、网盘资源、Scribd/文库/商业转载站的非授权扫描件。",
        "- 无法确认出处、版本、作者和授权状态的二次整理资料。",
        "- 将付费教材或受限期刊全文绕过访问控制后导入知识库。",
    ]
    return "\n".join(lines)


def bucket_section(items: list[Source]) -> str:
    buckets = {
        "运动处方原则库": ["运动处方原则库", "FITT-VP"],
        "风险筛查与禁忌库": ["风险筛查", "禁忌动作"],
        "慢病运动干预库": ["慢病干预"],
        "体质测试与评价库": ["体质测试与评价库", "阶段评估"],
        "传统功法库": ["传统功法"],
        "专家审核依据库": ["专家审核依据"],
        "用户报告免责声明库": ["用户报告免责声明", "报告免责声明"],
    }
    lines = ["## 第五部分：知识库分桶建议", ""]
    for bucket, keys in buckets.items():
        lines += [f"### {bucket}", ""]
        selected = [x for x in items if any(k in x.knowledge_tags for k in keys)]
        lines += [f"- {x.source_id}：[{x.title}]({x.official_url})" for x in selected]
        lines.append("")
    return "\n".join(lines)


def gap_section() -> str:
    return """## 第六部分：缺口清单

- ACSM / LWW 单篇 Position Stand 的全文自动抓取受 403/Cloudflare 限制，建议由人工浏览器逐篇确认开放状态和授权。
- Exercise is Medicine Rx for Health 系列自动访问触发机器人验证，建议人工下载后补录，或联系 EIM 确认电子化使用授权。
- 中国慢性肾病运动康复专家共识仍缺稳定官方全文下载链接，目前只做元数据。
- 中国儿童青少年身体活动指南官方页面访问不稳定，第三方 PDF 授权不明，暂不纳入全文。
- 冠心病心脏康复基层指南可访问页面提示权限/订阅信息，建议只摘要入库并等待授权确认。
- 脑卒中运动康复缺少可公开下载的中国专门运动处方指南，当前用国家卫健委防治规范和 AHA/ASA 官方课件补充。
- 传统功法资料有处方研制指南和八段锦征求意见稿，但缺少太极拳、五禽戏、易筋经的正式公开团体标准、动作禁忌和慢病适配证据。
- 多数中文期刊指南版权状态为授权待确认，不建议直接全文用于商业 RAG 服务。

检索日期：2026-06-01。

检索关键词摘要：ACSM position stand exercise prescription PDF；Exercise is Medicine preparticipation screening PDF；WHO physical activity sedentary behaviour guidelines PDF；国民体质测定标准 PDF 国家体育总局；中国人群身体活动指南 2021 PDF；高血压/糖尿病/血脂异常/肥胖/慢阻肺/冠心病/脑卒中/骨质疏松/老年跌倒 运动干预 指南 专家共识 PDF；八段锦 团体标准 PDF；健身气功 运动处方 国家体育总局。
"""


def write_reports(items: list[Source]) -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    catalog = [x.public_json() for x in items]
    CATALOG_JSON.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), "utf-8")
    download_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "catalog": str(CATALOG_JSON),
        "output_dir": str(OUT),
        "results": [
            {
                **x.public_json(),
                "priority": x.priority,
                "suitability_note": x.suitability_note,
                "download_status": x.download_status,
                "downloaded_files": x.downloaded_files,
                "download_note": x.download_note,
            }
            for x in items
        ],
    }
    DOWNLOAD_JSON.write_text(json.dumps(download_payload, ensure_ascii=False, indent=2), "utf-8")
    DOWNLOAD_MD.write_text(
        "# v0.2 下载报告\n\n"
        + f"- 生成时间：{download_payload['generated_at']}\n"
        + f"- Catalog：{CATALOG_JSON}\n\n"
        + "\n".join(
            f"- {x.source_id} [{x.download_status}] {x.title} {'; '.join(x.downloaded_files)} {x.download_note}".rstrip()
            for x in items
        )
        + "\n",
        "utf-8",
    )
    md = [
        "# AI 运动处方平台 RAG 知识库权威资料调研报告 v0.2",
        "",
        "## 第一部分：资料总览表",
        "",
        table(items),
        "",
        priority_section(items),
        "## 第三部分：下载任务清单",
        "",
        "```json",
        json.dumps(catalog, ensure_ascii=False, indent=2),
        "```",
        "",
        copyright_section(items),
        "",
        bucket_section(items),
        gap_section(),
    ]
    REPORT_MD.write_text("\n".join(md), "utf-8")


def main() -> int:
    items = sources()
    run_downloads(items)
    write_reports(items)
    print(json.dumps({
        "sources": len(items),
        "catalog": str(CATALOG_JSON),
        "report": str(REPORT_MD),
        "download_report": str(DOWNLOAD_JSON),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
