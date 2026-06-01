#!/usr/bin/env python3
"""Organize rag_data into RAG-ready folders and quarantine low-value files."""

from __future__ import annotations

import csv
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAG = ROOT / "rag_data"
EXCLUDED = ROOT / "rag_data_excluded_not_for_rag"
MANIFEST = RAG / "_manifests" / "rag_data_organization_manifest.json"
CSV_MANIFEST = RAG / "_manifests" / "rag_data_organization_manifest.csv"


KEEP_MAP = {
    "SRC-012_WHO_physical_activity_sedentary_behaviour.pdf": "00_core_guidelines/WHO_2020_physical_activity_sedentary_behaviour_guidelines.pdf",
    "SRC-013_US_physical_activity_guidelines_2nd_edition.pdf": "00_core_guidelines/US_HHS_2018_physical_activity_guidelines_2nd_edition.pdf",
    "SRC2-030_WHO_step_safely_fall_prevention.pdf": "00_core_guidelines/WHO_2021_step_safely_fall_prevention.pdf",
    "SRC2-031_WHO_promoting_physical_activity_through_schools_toolkit_zh.pdf": "00_core_guidelines/WHO_2024_promoting_physical_activity_through_schools_toolkit_zh.pdf",
    "SRC-033_WHO_UNESCO_health_promoting_school_global_standards.pdf": "00_core_guidelines/WHO_UNESCO_2021_health_promoting_school_global_standards.pdf",
    "SRC-033_WHO_promoting_physical_activity_through_schools.pdf": "00_core_guidelines/WHO_2022_promoting_physical_activity_through_schools.pdf",
    "SRC2-026_AHA_ASA_adult_stroke_rehab_recovery_slide_set.pdf": "00_core_guidelines/AHA_ASA_2016_adult_stroke_rehab_recovery_slide_set.pdf",

    "SRC-004_EIM_exercise_preparticipation_screening.pdf": "01_screening_risk/EIM_ACSM_2021_preparticipation_screening_questionnaire.pdf",
    "SRC-011_PARQPlus_2025_fillable.pdf": "01_screening_risk/PARQPlus_2025_fillable.pdf",
    "SRC-011_QAAPPlus_2024.pdf": "01_screening_risk/QAAPPlus_2024.pdf",
    "SRC-011_ePARmedX_physician_clearance_form_2026.pdf": "01_screening_risk/ePARmedX_2026_physician_clearance_form.pdf",
    "SRC-027_WST_887_2026_older_adult_fall_prevention_standard.pdf": "01_screening_risk/NHC_WST_887_2026_older_adult_fall_prevention_standard.pdf",

    "SRC2-014_NHC_adult_hypertension_nutrition_exercise_2024.pdf": "02_chronic_disease/NHC_2024_adult_hypertension_nutrition_and_exercise_guideline.pdf",
    "SRC2-015_NHC_adult_hyperglycemia_nutrition_exercise_2024.pdf": "02_chronic_disease/NHC_2024_adult_hyperglycemia_nutrition_and_exercise_guideline.pdf",
    "SRC2-016_NHC_adult_hyperlipidemia_nutrition_exercise_2024.pdf": "02_chronic_disease/NHC_2024_adult_hyperlipidemia_nutrition_and_exercise_guideline.pdf",
    "SRC2-017_NHC_adult_hyperuricemia_gout_nutrition_exercise_2024.pdf": "02_chronic_disease/NHC_2024_adult_hyperuricemia_gout_nutrition_and_exercise_guideline.pdf",
    "SRC2-025_china_stroke_prevention_control_standard_2021.pdf": "02_chronic_disease/NHC_2021_china_stroke_prevention_control_standard.pdf",
    "SRC-019_china_hypertension_guideline_2024_revision.pdf": "02_chronic_disease/China_2024_hypertension_prevention_treatment_guideline_revision.pdf",
    "SRC-020_china_type2_diabetes_exercise_treatment_guideline_2024.pdf": "02_chronic_disease/China_2024_type2_diabetes_exercise_treatment_guideline.pdf",
    "SRC-021_china_blood_lipid_management_guideline_2023.pdf": "02_chronic_disease/China_2023_blood_lipid_management_guideline.pdf",
    "SRC-022_weight_management_guiding_principles_2024.pdf": "02_chronic_disease/NHC_2024_weight_management_guiding_principles.pdf",
    "SRC-026_COPD_clinical_rehab_evidence_based_guideline.pdf": "02_chronic_disease/China_2021_COPD_clinical_rehab_evidence_based_guideline.pdf",
    "SRC-028_older_adult_disability_prevention_exercise_guideline_2023.pdf": "02_chronic_disease/China_2023_older_adult_disability_prevention_exercise_guideline.pdf",
    "SRC-029_primary_osteoporosis_diagnosis_treatment_guideline_2022.pdf": "02_chronic_disease/China_2022_primary_osteoporosis_diagnosis_treatment_guideline.pdf",
    "SRC-035_adult_obesity_food_nutrition_guideline_2024.pdf": "02_chronic_disease/NHC_2024_adult_obesity_food_nutrition_guideline.pdf",
    "SRC-007_EIM_Rx_exercising_with_high_blood_pressure.pdf": "02_chronic_disease/EIM_Rx_exercising_with_high_blood_pressure.pdf",

    "SRC-016_national_physical_fitness_measurement_standard_2023.pdf": "03_fitness_assessment/China_2023_national_physical_fitness_measurement_standard.pdf",
    "SRC-017_national_student_physical_health_standard_2014.docx": "03_fitness_assessment/China_2014_national_student_physical_health_standard.docx",

    "SRC-030_baduanjin_group_standard_draft.pdf": "04_traditional_qigong/Baduanjin_2026_group_standard_draft.pdf",
    "SRC-030_baduanjin_group_standard_explanation.pdf": "04_traditional_qigong/Baduanjin_2026_group_standard_draft_explanation.pdf",
    "SRC2-036_fitness_qigong_exercise_prescription_development_guide.doc": "04_traditional_qigong/Fitness_Qigong_exercise_prescription_development_guide.doc",

    "SRC-001_ACSM_position_stands_resistance_training_slide_deck.pdf": "05_supporting_evidence/ACSM_2026_resistance_training_position_stand_slide_deck.pdf",
    "SRC-011_PARQPlus_2025_image.pdf": "05_supporting_evidence/PARQPlus_2025_image_version.pdf",

    "ACSMs Guidelines for Exercise Testing and Prescription Twelfth Edition.pdf": "80_reference_books_limited/ACSM_2025_guidelines_for_exercise_testing_and_prescription_12th_edition_reference_only.pdf",
    "ACSM运动测试与运动处方指南.pdf": "80_reference_books_limited/ACSM_exercise_testing_and_prescription_guidelines_chinese_reference_only.pdf",
    "ACSM运动医学检测与处方指南 第8版 (王正珍著, 美国运动医学学会(ACSM)著] , 王正珍主译, 王正珍 etc.).pdf": "80_reference_books_limited/ACSM_8th_exercise_testing_prescription_chinese_reference_only.pdf",
    "ACSM体能训练概论=ACSM`S FOUNDATIONS OF STRENGTH TRAINING AND CONDITIONING.pdf": "80_reference_books_limited/ACSM_foundations_of_strength_training_conditioning_reference_only.pdf",
    "ACSM老年人科学运动健身 (Wojtek J.Chodzko-Zajko 王志强).pdf": "80_reference_books_limited/ACSM_exercise_for_older_adults_chinese_reference_only.pdf",
    "ACSMs Resources for the Personal Trainer, Fifth Edition (ACSM).pdf": "80_reference_books_limited/ACSM_resources_for_personal_trainer_5th_reference_only.pdf",
    "ACSMs HealthFitness Facility Standards and Guidelines (American College of Sports Medicine etc.).pdf": "80_reference_books_limited/ACSM_health_fitness_facility_standards_guidelines_reference_only.pdf",
    "ACSMs Certification Review, Fifth Edition (ACSM).pdf": "80_reference_books_limited/ACSM_certification_review_5th_reference_only.pdf",
    "370-acsms-complete-guide-to-fitness-health-2nd-edition.pdf": "80_reference_books_limited/ACSM_complete_guide_to_fitness_health_2nd_reference_only.pdf",
    "Physical Activity and Health The Evidence Explained (Adrianne E. Hardman, David J. Stensel).pdf": "80_reference_books_limited/Physical_activity_and_health_the_evidence_explained_reference_only.pdf",
}


EXCLUDE_MAP = {
    "ACSM Certified Personal Trainer Exam Study Guide ACSM 010-111 Version 5.0 FULLY UPDATED (PRECIOUS DUMPS [DUMPS, PRECIOUS]).pdf": "exam_dump_low_value_not_authoritative",
    "Molecular Exercise Physiology An Introduction (Henning Wackerhage, (ed.)).pdf": "too_basic_science_not_prescription_knowledge",
    "SRC-030_baduanjin_group_standard_feedback_form.docx": "feedback_form_no_rag_value",
    "SRC-024_pubmed_stable_angina_exercise_rehab.json": "metadata_only_too_little_content",
    "SRC-024_pubmed_stable_angina_exercise_rehab.xml": "metadata_only_too_little_content",
    "_download_report.json": "old_download_report_not_rag_content",
    "_download_report.md": "old_download_report_not_rag_content",
}


DIR_MOVES = {
    "web_archives_v0_2": "90_web_archives",
    "web_archives": "../rag_data_excluded_not_for_rag/duplicate_old_web_archives_v0_1",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_move(src: Path, dst: Path) -> Path:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.resolve() == dst.resolve():
        return dst
    if dst.exists():
        if src.is_file() and dst.is_file() and sha256(src) == sha256(dst):
            src.unlink()
            return dst
        stem, suffix = dst.stem, dst.suffix
        for i in range(2, 100):
            candidate = dst.with_name(f"{stem}_{i}{suffix}")
            if not candidate.exists():
                dst = candidate
                break
    shutil.move(str(src), str(dst))
    return dst


def classify_unmapped(path: Path) -> tuple[str, Path, str]:
    rel = path.relative_to(RAG)
    if path.name == ".DS_Store":
        return "ignore", path, "system_file"
    if path.name in {"_download_report_v0_2.json", "_download_report_v0_2.md"}:
        return "keep", RAG / "_manifests" / path.name, "current_manifest"
    if rel.parts and rel.parts[0] in {"00_core_guidelines", "01_screening_risk", "02_chronic_disease", "03_fitness_assessment", "04_traditional_qigong", "05_supporting_evidence", "80_reference_books_limited", "90_web_archives", "_manifests"}:
        return "already_organized", path, "already_organized"
    return "review", RAG / "99_review_pending" / path.name, "unmapped_needs_manual_review"


def main() -> int:
    EXCLUDED.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []

    # Move directory-level archives first.
    for src_name, dst_rel in DIR_MOVES.items():
        src = RAG / src_name
        if not src.exists():
            continue
        dst = (RAG / dst_rel).resolve() if not dst_rel.startswith("../") else (RAG / dst_rel).resolve()
        final = safe_move(src, dst)
        rows.append({"action": "move_dir", "source": str(src), "target": str(final), "reason": src_name})

    for name, reason in EXCLUDE_MAP.items():
        src = RAG / name
        if src.exists():
            final = safe_move(src, EXCLUDED / reason / name)
            rows.append({"action": "exclude", "source": str(src), "target": str(final), "reason": reason})

    for name, dst_rel in KEEP_MAP.items():
        src = RAG / name
        if src.exists():
            final = safe_move(src, RAG / dst_rel)
            rows.append({"action": "keep", "source": str(src), "target": str(final), "reason": "mapped_useful"})

    for path in list(RAG.iterdir()):
        if path.is_dir():
            if path.name in {"00_core_guidelines", "01_screening_risk", "02_chronic_disease", "03_fitness_assessment", "04_traditional_qigong", "05_supporting_evidence", "80_reference_books_limited", "90_web_archives", "_manifests", "99_review_pending"}:
                continue
            action, target, reason = classify_unmapped(path)
            if action == "review":
                final = safe_move(path, target)
                rows.append({"action": "review", "source": str(path), "target": str(final), "reason": reason})
        elif path.is_file():
            action, target, reason = classify_unmapped(path)
            if action == "ignore":
                continue
            if action in {"keep", "review"}:
                final = safe_move(path, target)
                rows.append({"action": action, "source": str(path), "target": str(final), "reason": reason})

    kept_files = [p for p in RAG.rglob("*") if p.is_file() and p.name != ".DS_Store"]
    excluded_files = [p for p in EXCLUDED.rglob("*") if p.is_file() and p.name != ".DS_Store"]
    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "rag_dir": str(RAG),
        "excluded_dir": str(EXCLUDED),
        "kept_file_count": len(kept_files),
        "excluded_file_count": len(excluded_files),
        "kept_total_bytes": sum(p.stat().st_size for p in kept_files),
        "excluded_total_bytes": sum(p.stat().st_size for p in excluded_files),
        "moves": rows,
        "notes": [
            "Core RAG content is in 00-05 and 90_web_archives.",
            "80_reference_books_limited contains useful but copyright/authorization-sensitive books; do not ingest automatically unless licensed.",
            "rag_data_excluded_not_for_rag contains low-value, duplicate, or metadata-only files removed from the main RAG directory.",
        ],
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(summary, ensure_ascii=False, indent=2), "utf-8")
    with CSV_MANIFEST.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["action", "source", "target", "reason"])
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({k: summary[k] for k in ["kept_file_count", "excluded_file_count", "kept_total_bytes", "excluded_total_bytes"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
