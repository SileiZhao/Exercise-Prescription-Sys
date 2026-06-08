import argparse
import os
from pathlib import Path

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from app.core.database import SessionLocal
from app.models.template import ActionReviewStatus
from scripts.import_compliance_materials import import_compliance_materials
from scripts.import_exercise_actions import import_exercise_actions
from scripts.import_prescription_templates import import_prescription_templates
from scripts.import_rag_data import import_rag_data
from scripts.import_risk_rules import import_risk_rules
from scripts.validate_reference_data import _validate_ai_generated_reference

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STAGES = ("risk", "actions", "templates", "compliance", "rag")
AI_GENERATED_FILES = {
    "risk": "ai_generated_risk_rules.json",
    "actions": "ai_generated_exercise_actions.json",
    "templates": "ai_generated_prescription_templates.json",
}


def default_project_root() -> Path:
    configured = os.environ.get("PROJECT_ROOT")
    if configured:
        return Path(configured).resolve()
    return PROJECT_ROOT


def default_docs_dir() -> Path:
    return default_project_root() / "docs"


def default_rag_root() -> Path:
    return default_project_root() / "rag_data"


def _normalise_metrics(result: dict) -> dict:
    normalised = dict(result)
    normalised.setdefault("created", 0)
    normalised.setdefault("updated", 0)
    normalised.setdefault("skipped", 0)
    normalised.setdefault("errors", 0)
    return normalised


def seed_reference_data(
    *,
    db=None,
    docs_dir: str | Path | None = None,
    rag_root: str | Path | None = None,
    ai_bundle_dir: str | Path | None = None,
    build_rag_index: bool = True,
    strict: bool = False,
    skip_rag: bool = False,
    only: str | None = None,
    rag_profile: str = "full",
    rag_max_chunks_per_document: int | None = None,
) -> dict[str, dict]:
    if only is not None and only not in STAGES:
        raise ValueError(f"only 必须是以下之一：{', '.join(STAGES)}")
    owns_session = db is None
    db = db or SessionLocal()
    docs_path = Path(docs_dir) if docs_dir is not None else default_docs_dir()
    rag_path = Path(rag_root) if rag_root is not None else default_rag_root()
    ai_path = Path(ai_bundle_dir) if ai_bundle_dir is not None else None
    try:
        results: dict[str, dict] = {}
        selected = {only} if only else (set(AI_GENERATED_FILES) if ai_path is not None else set(STAGES))
        if ai_path is not None:
            missing_files: list[str] = []
            blocking_errors: list[str] = []
            ai_report = _validate_ai_generated_reference(ai_path, missing_files, blocking_errors)
            results["ai_generated_reference"] = ai_report
            if strict and blocking_errors:
                raise RuntimeError("AI 生成参考资料存在阻断项：" + ", ".join(blocking_errors))

        if "risk" in selected:
            results["risk_rules"] = _normalise_metrics(
                import_risk_rules(
                    db,
                    _reference_file(
                        stage="risk",
                        docs_path=docs_path,
                        ai_path=ai_path,
                        docs_file="ai_exercise_prescription_risk_rules_v0_1_expert_review_draft.json",
                    ),
                    confirm=True,
                )
            )
        if "actions" in selected:
            results["actions"] = _normalise_metrics(
                import_exercise_actions(
                    db,
                    _reference_file(
                        stage="actions",
                        docs_path=docs_path,
                        ai_path=ai_path,
                        docs_file="ai_exercise_action_library_v0_1_expert_review_draft.json",
                    ),
                    review_status=ActionReviewStatus.APPROVED,
                )
            )
        if "templates" in selected:
            results["templates"] = _normalise_metrics(
                import_prescription_templates(
                    db,
                    _reference_file(
                        stage="templates",
                        docs_path=docs_path,
                        ai_path=ai_path,
                        docs_file="ai_exercise_prescription_template_library_v0_1_expert_review_draft.json",
                    ),
                    approve_drafts=True,
                )
            )
        if "compliance" in selected:
            results["compliance"] = _normalise_metrics(
                import_compliance_materials(
                    db,
                    docs_path / "ai_exercise_compliance_copy_pack_v0_1_expert_review_draft.json",
                    confirmed=True,
                )
            )
        if "rag" in selected and not skip_rag:
            results["rag_data"] = _normalise_metrics(
                import_rag_data(
                    db,
                    rag_root=rag_path,
                    allowlist_path=rag_path / "_manifests" / "rag_ingest_allowlist.txt",
                    catalog_path=docs_path / "knowledge_source_catalog_v0_2.json",
                    build_index=build_rag_index,
                    strict=strict,
                    profile=rag_profile,
                    max_chunks_per_document=rag_max_chunks_per_document,
                )
            )
        if strict:
            blocking = []
            for name, result in results.items():
                if name == "ai_generated_reference" and result.get("blocking_errors"):
                    blocking.append(f"{name}.blocking_errors={len(result['blocking_errors'])}")
                if int(result.get("errors") or 0) > 0:
                    blocking.append(f"{name}.errors={result.get('errors')}")
                if name == "rag_data" and int(result.get("skipped") or 0) > 0:
                    blocking.append(f"{name}.skipped={result.get('skipped')}")
            if blocking:
                raise RuntimeError("参考资料导入存在阻断项：" + ", ".join(blocking))
        return results
    finally:
        if owns_session:
            db.close()


def _reference_file(*, stage: str, docs_path: Path, ai_path: Path | None, docs_file: str) -> Path:
    if ai_path is not None:
        return ai_path / AI_GENERATED_FILES[stage]
    return docs_path / docs_file


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="导入 docs 和 rag_data 的第一版参考资料。")
    parser.add_argument("--ai-bundle-dir", type=Path, default=None, help="从 AI 生成 split 文件目录导入规则、动作和模板。")
    parser.add_argument("--no-rag-index", action="store_true", help="只导入 RAG 文档切片，不重建向量索引。")
    parser.add_argument("--strict", action="store_true", help="任一阶段出现 errors 时以非 0 状态退出。")
    parser.add_argument("--skip-rag", action="store_true", help="跳过 RAG 文档导入。")
    parser.add_argument("--only", choices=STAGES, help="只执行指定导入阶段。")
    parser.add_argument(
        "--rag-profile",
        choices=("full", "lightweight"),
        default=os.environ.get("RAG_IMPORT_PROFILE", "full"),
        help="RAG 导入策略：full 处理完整 allowlist；lightweight 仅导入轻量文本资料，延后 PDF/图片/OCR。",
    )
    parser.add_argument(
        "--rag-max-chunks-per-document",
        type=int,
        default=None,
        help="限制单个 RAG 文档导入切片数量；lightweight 默认已有保护限制。",
    )
    return parser


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()
    try:
        results = seed_reference_data(
            ai_bundle_dir=args.ai_bundle_dir,
            build_rag_index=not args.no_rag_index,
            strict=args.strict,
            skip_rag=args.skip_rag,
            only=args.only,
            rag_profile=args.rag_profile,
            rag_max_chunks_per_document=args.rag_max_chunks_per_document,
        )
    except RuntimeError as exc:
        parser.exit(status=1, message=f"{exc}\n")
    for name, result in results.items():
        metrics = ", ".join(f"{key}={value}" for key, value in result.items())
        print(f"{name}: {metrics}")


if __name__ == "__main__":
    main()
