#!/usr/bin/env python3
"""Download and archive RAG knowledge sources listed in the project catalog."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs" / "knowledge_source_catalog_v0_1.json"
OUT = ROOT / "rag_data"
ARCHIVE_DIR = OUT / "web_archives"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


@dataclass
class Result:
    source_id: str
    title: str
    status: str
    files: list[str] = field(default_factory=list)
    url: str | None = None
    note: str = ""


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def valid_magic(path: Path, ext: str) -> bool:
    data = path.read_bytes()[:16]
    ext = ext.lower()
    if ext == ".pdf":
        return data.startswith(b"%PDF")
    if ext in {".docx", ".zip"}:
        return data.startswith(b"PK")
    if ext in {".html", ".htm", ".md", ".json"}:
        return True
    return bool(data)


def unique_target(target: Path) -> Path:
    if not target.exists():
        return target
    stem, suffix = target.stem, target.suffix
    for i in range(2, 100):
        candidate = target.with_name(f"{stem}_{i}{suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"cannot find unique target for {target}")


def rename_existing(existing_name: str, target_name: str, results: list[Result], source_id: str, title: str) -> None:
    old = OUT / existing_name
    new = OUT / target_name
    if not old.exists():
        return
    if new.exists():
        if old.resolve() != new.resolve() and sha256(old) == sha256(new):
            old.unlink()
            results.append(Result(source_id, title, "deduped_existing", [str(new)], note=f"removed duplicate {old.name}"))
        return
    old.rename(new)
    results.append(Result(source_id, title, "renamed_existing", [str(new)], note=f"{existing_name} -> {target_name}"))


def request_get(url: str, *, timeout: int = 45, referer: str | None = None) -> requests.Response:
    headers = dict(HEADERS)
    if referer:
        headers["Referer"] = referer
    return requests.get(url, headers=headers, timeout=timeout, stream=True)


def write_download(url: str, target_name: str, source_id: str, title: str, results: list[Result], referer: str | None = None) -> None:
    target = OUT / target_name
    if target.exists() and valid_magic(target, target.suffix):
        results.append(Result(source_id, title, "skipped_existing", [str(target)], url=url))
        return

    try:
        response = request_get(url, referer=referer)
        tmp = target.with_suffix(target.suffix + ".tmp")
        with tmp.open("wb") as f:
            for chunk in response.iter_content(1024 * 128):
                if chunk:
                    f.write(chunk)
        if response.status_code >= 400:
            tmp.unlink(missing_ok=True)
            results.append(Result(source_id, title, "failed", url=url, note=f"HTTP {response.status_code}"))
            return
        if not valid_magic(tmp, target.suffix):
            snippet = tmp.read_bytes()[:120].decode("utf-8", "ignore").replace("\n", " ")
            tmp.unlink(missing_ok=True)
            results.append(Result(source_id, title, "failed", url=url, note=f"unexpected content: {snippet[:100]}"))
            return
        tmp.replace(target)
        results.append(Result(source_id, title, "downloaded", [str(target)], url=url))
    except Exception as exc:
        results.append(Result(source_id, title, "failed", url=url, note=repr(exc)))


def clean_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def archive_page(url: str, base_name: str, source_id: str, title: str, results: list[Result], note: str = "") -> str | None:
    html_path = ARCHIVE_DIR / f"{base_name}.html"
    md_path = ARCHIVE_DIR / f"{base_name}_summary.md"
    if html_path.exists() and md_path.exists():
        results.append(Result(source_id, title, "skipped_existing", [str(html_path), str(md_path)], url=url, note=note))
        return html_path.read_text("utf-8", "ignore")

    try:
        response = requests.get(url, headers=HEADERS, timeout=45)
        if response.status_code >= 400:
            results.append(Result(source_id, title, "failed", url=url, note=f"HTTP {response.status_code}; {note}".strip()))
            return None
        response.encoding = response.apparent_encoding or response.encoding
        html = response.text
        soup = BeautifulSoup(html, "lxml")
        page_title = soup.title.get_text(" ", strip=True) if soup.title else title
        text = clean_text(soup)
        headings = [h.get_text(" ", strip=True) for h in soup.find_all(re.compile("^h[1-3]$"))]
        headings = [h for h in headings if h][:20]
        summary = [
            f"# {source_id} {title}",
            "",
            f"- URL: {url}",
            f"- Archived at: {datetime.now(timezone.utc).isoformat()}",
            f"- Page title: {page_title}",
        ]
        if note:
            summary.append(f"- Note: {note}")
        if headings:
            summary.extend(["", "## Headings", *[f"- {h}" for h in headings]])
        summary.extend(["", "## Extracted Summary Text", text[:1800]])
        html_path.write_text(html, "utf-8")
        md_path.write_text("\n".join(summary) + "\n", "utf-8")
        results.append(Result(source_id, title, "archived_page", [str(html_path), str(md_path)], url=url, note=note))
        return html
    except Exception as exc:
        results.append(Result(source_id, title, "failed", url=url, note=f"{repr(exc)}; {note}".strip()))
        return None


def acsm_position_stands(results: list[Result]) -> None:
    source_id = "SRC-001"
    title = "ACSM Position Stands"
    url = "https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/"
    html = archive_page(url, "SRC-001_ACSM_position_stands_index", source_id, title, results, "Index page plus accessible linked full-text pages.")
    if not html:
        return
    soup = BeautifulSoup(html, "lxml")
    links: list[tuple[str, str]] = []
    seen: set[str] = set()
    for a in soup.find_all("a"):
        href = a.get("href")
        text = a.get_text(" ", strip=True)
        if not href:
            continue
        abs_url = urljoin(url, href)
        low = abs_url.lower()
        if "journals.lww.com" in low and "/fulltext/" in low and abs_url not in seen:
            links.append((text or "ACSM Position Stand", abs_url))
            seen.add(abs_url)
        if "pronouncement-ppt-deck_resistance-training-ps.pdf" in low:
            write_download(abs_url, "SRC-001_ACSM_position_stands_resistance_training_slide_deck.pdf", source_id, title, results, referer=url)
    for idx, (link_title, link_url) in enumerate(links, 1):
        base = f"SRC-001_ACSM_position_stand_{idx:02d}"
        archive_page(link_url, base, source_id, title, results, note=f"Linked title: {link_title[:160]}")


def archive_web_resources(results: list[Result]) -> None:
    pages = [
        ("SRC-002", "ACSM Physical Activity Guidelines and Recommendations", "https://acsm.org/education-resources/trending-topics-resources/physical-activity-guidelines/", "SRC-002_ACSM_physical_activity_guidelines"),
        ("SRC-014", "CDC Physical Activity Basics / Older Adults Recommendations", "https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html", "SRC-014_CDC_older_adults_physical_activity"),
        ("SRC-011", "PAR-Q+ Official Download Page", "https://eparmedx.com/print-versions-of-par-q/", "SRC-011_PARQ_print_versions"),
        ("SRC-023", "Coronary heart disease primary care guideline page", "https://rs.yiigle.com/cmaid/1311893", "SRC-023_yiigle_coronary_guideline_page"),
        ("SRC-030", "Baduanjin group standard consultation notice", "https://www.sport.gov.cn/qgzx/n5402/c29596700/content.html", "SRC-030_baduanjin_standard_notice"),
    ]
    for source_id, title, url, base in pages:
        archive_page(url, base, source_id, title, results)


def download_direct_resources(results: list[Result]) -> None:
    direct = [
        ("SRC-004", "Exercise Preparticipation Screening Questionnaire", "https://www.exerciseismedicine.org/wp-content/uploads/2021/04/EIM-exercise-preparticipation-screening.pdf", "SRC-004_EIM_exercise_preparticipation_screening.pdf", None),
        ("SRC-011", "PAR-Q+ Image PDF 2025", "https://eparmedx.com/wp-content/uploads/2025/01/PARQPlus2025ImageFile.pdf", "SRC-011_PARQPlus_2025_image.pdf", "https://eparmedx.com/print-versions-of-par-q/"),
        ("SRC-011", "PAR-Q+ Fillable PDF 2025", "https://eparmedx.com/wp-content/uploads/2025/01/PARQPlus2025Fillable.pdf", "SRC-011_PARQPlus_2025_fillable.pdf", "https://eparmedx.com/print-versions-of-par-q/"),
        ("SRC-011", "Q-AAP+ PDF 2024", "https://eparmedx.com/wp-content/uploads/2024/01/QAAP-Plus-Jan-2024-1.pdf", "SRC-011_QAAPPlus_2024.pdf", "https://eparmedx.com/print-versions-of-par-q/"),
        ("SRC-011", "ePARmedX Physician Clearance Form 2026", "https://eparmedx.com/wp-content/uploads/2026/01/ePARmedX-Physician-Clearance-Form-2026.pdf", "SRC-011_ePARmedX_physician_clearance_form_2026.pdf", "https://eparmedx.com/print-versions-of-par-q/"),
        ("SRC-012", "WHO Guidelines on Physical Activity and Sedentary Behaviour", "https://iris.who.int/server/api/core/bitstreams/faa83413-d89e-4be9-bb01-b24671aef7ca/content", "SRC-012_WHO_physical_activity_sedentary_behaviour.pdf", None),
        ("SRC-013", "Physical Activity Guidelines for Americans, 2nd Edition", "https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf", "SRC-013_US_physical_activity_guidelines_2nd_edition.pdf", None),
        ("SRC-016", "国民体质测定标准（2023年修订）", "https://www.ciss.cn/upload/b87314e6-ed00-44a1-adf3-d1c62df9d285/280c176d-f99e-4ee6-9987-ca5742b30c80.pdf", "SRC-016_national_physical_fitness_measurement_standard_2023.pdf", "https://www.ciss.cn/tzgg/info/2023/32672.html"),
        ("SRC-017", "国家学生体质健康标准（2014年修订）", "https://www.csh.moe.edu.cn/u/cms/attached/file/20141226/20141226131102_753.docx", "SRC-017_national_student_physical_health_standard_2014.docx", "https://www.csh.moe.edu.cn/wtzx/zcwj/20141226/2c909e854a8490a4014a84fda9b4001d.html"),
        ("SRC-019", "中国高血压防治指南（2024年修订版）", "https://cjournal.hep.com.cn/1673-7245/CN/PDF/10.16439/j.issn.1673-7245.2024.07.002", "SRC-019_china_hypertension_guideline_2024_revision.pdf", "https://cjournal.hep.com.cn/1673-7245/CN/1160171857581368285"),
        ("SRC-020", "中国2型糖尿病运动治疗指南（2024版）", "https://www.chinagp.net/CN/article/downloadArticleFile.do?attachType=PDF&id=8343", "SRC-020_china_type2_diabetes_exercise_treatment_guideline_2024.pdf", "https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2024.A0019"),
        ("SRC-021", "中国血脂管理指南（2023年）", "https://csc.cma.org.cn/attach/0/96b4e603cee74b7fb208b278aa92bd8b.pdf", "SRC-021_china_blood_lipid_management_guideline_2023.pdf", None),
        ("SRC-022", "体重管理指导原则（2024年版）", "https://www.nhc.gov.cn/cms-search/downFiles/f932c5c0004f4959b92613dd1024483c.pdf", "SRC-022_weight_management_guiding_principles_2024.pdf", "https://www.nhc.gov.cn/"),
        ("SRC-026", "慢性阻塞性肺疾病临床康复循证实践指南", "https://www.cjrtponline.com/CN/article/downloadArticleFile.do?attachType=PDF&id=7958", "SRC-026_COPD_clinical_rehab_evidence_based_guideline.pdf", "https://www.cjrtponline.com/CN/10.3969/j.issn.1006-9771.2021.01.002"),
        ("SRC-027", "社区老年人跌倒预防控制技术标准 WS/T 887-2026", "https://www.nhc.gov.cn/fzs/c100048/202603/bc137ea10a084a9e87ed57902be81cb5/files/WST%20887%E2%80%942026.pdf", "SRC-027_WST_887_2026_older_adult_fall_prevention_standard.pdf", None),
        ("SRC-028", "老年人失能预防运动干预临床实践指南（2023版）", "https://www.chinagp.net/CN/article/downloadArticleFile.do?attachType=PDF&id=7338", "SRC-028_older_adult_disability_prevention_exercise_guideline_2023.pdf", "https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2023.0058"),
        ("SRC-029", "原发性骨质疏松症诊疗指南（2022）", "https://www.chinagp.net/CN/article/downloadArticleFile.do?attachType=PDF&id=7181", "SRC-029_primary_osteoporosis_diagnosis_treatment_guideline_2022.pdf", "https://www.chinagp.net/CN/10.12114/j.issn.1007-9572.2023.0121"),
        ("SRC-030", "团体标准《八段锦》（征求意见稿）", "https://www.sport.gov.cn/qgzx/n5402/c29596700/part/29596710.pdf", "SRC-030_baduanjin_group_standard_draft.pdf", "https://www.sport.gov.cn/qgzx/n5402/c29596700/content.html"),
        ("SRC-030", "团体标准《八段锦》编制说明", "https://www.sport.gov.cn/qgzx/n5402/c29596700/part/29596711.pdf", "SRC-030_baduanjin_group_standard_explanation.pdf", "https://www.sport.gov.cn/qgzx/n5402/c29596700/content.html"),
        ("SRC-030", "团体标准《八段锦》公开征求意见反馈表", "https://www.sport.gov.cn/qgzx/n5402/c29596700/part/29596712.docx", "SRC-030_baduanjin_group_standard_feedback_form.docx", "https://www.sport.gov.cn/qgzx/n5402/c29596700/content.html"),
        ("SRC-024", "Stable angina exercise rehabilitation PubMed metadata XML", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=38423726&retmode=xml", "SRC-024_pubmed_stable_angina_exercise_rehab.xml", None),
        ("SRC-024", "Stable angina exercise rehabilitation PubMed metadata JSON", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=38423726&retmode=json", "SRC-024_pubmed_stable_angina_exercise_rehab.json", None),
        ("SRC-033", "WHO Promoting physical activity through schools", "https://iris.who.int/server/api/core/bitstreams/228fb58c-c720-4043-8c94-57ea3f969363/content", "SRC-033_WHO_promoting_physical_activity_through_schools.pdf", "https://iris.who.int/handle/10665/354605"),
        ("SRC-033", "WHO UNESCO Making every school a health-promoting school", "https://iris.who.int/server/api/core/bitstreams/936bedca-bd90-4bfb-846f-c0e97d8a158a/content", "SRC-033_WHO_UNESCO_health_promoting_school_global_standards.pdf", "https://iris.who.int/handle/10665/341907"),
        ("SRC-035", "成人肥胖食养指南（2024年版）", "https://www.nhc.gov.cn/sps/c100088/202402/9ba512ba8e314a47a181db11d2fa188d/files/1743476136267_20714.pdf", "SRC-035_adult_obesity_food_nutrition_guideline_2024.pdf", "https://www.nhc.gov.cn/sps/c100088/202402/9ba512ba8e314a47a181db11d2fa188d.shtml"),
    ]
    for source_id, title, url, target_name, referer in direct:
        write_download(url, target_name, source_id, title, results, referer=referer)


def note_skipped(results: list[Result], catalog: Iterable[dict]) -> None:
    reasons = {
        "SRC-003": "requires purchase; no legal free PDF in catalog",
        "SRC-005": "official EIM PDF currently returns a robot-challenge page",
        "SRC-006": "EIM Rx index currently returns a robot-challenge page; direct listed PDFs handled separately when available",
        "SRC-008": "official EIM PDF currently returns a robot-challenge page",
        "SRC-009": "official EIM PDF currently returns a robot-challenge page",
        "SRC-010": "official EIM PDF currently returns a robot-challenge page",
        "SRC-015": "catalog marks book/article route as purchase or metadata-only",
        "SRC-018": "official journal host was not reachable over HTTP/TLS during this run; kept as metadata-only for now",
        "SRC-025": "catalog DOI URL did not resolve to the target article during this run",
        "SRC-031": "requires purchase",
        "SRC-032": "online video; catalog recommends link/metadata only unless separately authorized",
        "SRC-034": "official journal page returned 404/502/TLS errors during this run",
    }
    by_id = {item["source_id"]: item for item in catalog}
    for source_id, note in reasons.items():
        item = by_id.get(source_id, {})
        results.append(Result(source_id, item.get("title", ""), "skipped", url=item.get("official_url"), note=note))


def write_reports(results: list[Result]) -> None:
    report_json = OUT / "_download_report.json"
    report_md = OUT / "_download_report.md"
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "catalog": str(CATALOG),
        "output_dir": str(OUT),
        "results": [r.__dict__ for r in results],
    }
    report_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    counts: dict[str, int] = {}
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1
    lines = [
        "# RAG source download report",
        "",
        f"- Generated at: {payload['generated_at']}",
        f"- Catalog: {CATALOG}",
        f"- Output dir: {OUT}",
        "",
        "## Status counts",
        *[f"- {k}: {v}" for k, v in sorted(counts.items())],
        "",
        "## Items",
    ]
    for r in results:
        files = "; ".join(r.files)
        lines.append(f"- {r.source_id} [{r.status}] {r.title} {files} {r.note}".rstrip())
    report_md.write_text("\n".join(lines) + "\n", "utf-8")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    catalog = json.loads(CATALOG.read_text("utf-8"))
    results: list[Result] = []

    rename_existing("EIM-exercise-preparticipation-screening.pdf", "SRC-004_EIM_exercise_preparticipation_screening.pdf", results, "SRC-004", "Exercise Preparticipation Screening Questionnaire")
    rename_existing("EIM Rx series_Exercising with High Blood Pressure.pdf", "SRC-007_EIM_Rx_exercising_with_high_blood_pressure.pdf", results, "SRC-007", "Rx for Health: Exercising with High Blood Pressure")
    rename_existing("WHO GUIDELINES ON PHYSICAL ACTIVITY AND SEDENTARY BEHAVIOUR.pdf", "SRC-012_WHO_physical_activity_sedentary_behaviour.pdf", results, "SRC-012", "WHO Guidelines on Physical Activity and Sedentary Behaviour")
    rename_existing("Physical_Activity_Guidelines_2nd_edition.pdf", "SRC-013_US_physical_activity_guidelines_2nd_edition.pdf", results, "SRC-013", "Physical Activity Guidelines for Americans, 2nd Edition")
    rename_existing("国家学生体质健康标准（2014年修订）.docx", "SRC-017_national_student_physical_health_standard_2014.docx", results, "SRC-017", "国家学生体质健康标准（2014年修订）")

    acsm_position_stands(results)
    archive_web_resources(results)
    download_direct_resources(results)
    note_skipped(results, catalog)
    write_reports(results)

    print(json.dumps({"count": len(results), "out": str(OUT)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
