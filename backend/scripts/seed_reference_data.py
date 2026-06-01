from pathlib import Path

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from app.core.database import SessionLocal
from scripts.import_compliance_materials import import_compliance_materials
from scripts.import_exercise_actions import import_exercise_actions
from scripts.import_prescription_templates import import_prescription_templates
from scripts.import_rag_data import import_rag_data
from scripts.import_risk_rules import import_risk_rules

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOCS_DIR = PROJECT_ROOT / "docs"
RAG_ROOT = PROJECT_ROOT / "rag_data"


def seed_reference_data(build_rag_index: bool = True) -> dict[str, dict[str, int]]:
    db = SessionLocal()
    try:
        results = {
            "risk_rules": import_risk_rules(
                db, DOCS_DIR / "ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json"
            ),
            "templates": import_prescription_templates(
                db,
                DOCS_DIR / "ai_exercise_prescription_template_library_v0_1_expert_review_draft.json",
                approve_drafts=True,
            ),
            "actions": import_exercise_actions(
                db, DOCS_DIR / "ai_exercise_action_library_v0_1_expert_review_draft.json"
            ),
            "compliance": import_compliance_materials(
                db, DOCS_DIR / "ai_exercise_compliance_copy_pack_v0_1_expert_review_draft.json"
            ),
            "rag_data": import_rag_data(
                db,
                rag_root=RAG_ROOT,
                allowlist_path=RAG_ROOT / "_manifests" / "rag_ingest_allowlist.txt",
                catalog_path=DOCS_DIR / "knowledge_source_catalog_v0_2.json",
                build_index=build_rag_index,
            ),
        }
        return results
    finally:
        db.close()


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="导入 docs 和 rag_data 的第一版参考资料。")
    parser.add_argument("--no-rag-index", action="store_true", help="只导入 RAG 文档切片，不重建向量索引。")
    args = parser.parse_args()
    results = seed_reference_data(build_rag_index=not args.no_rag_index)
    for name, result in results.items():
        metrics = ", ".join(f"{key}={value}" for key, value in result.items())
        print(f"{name}: {metrics}")


if __name__ == "__main__":
    main()
