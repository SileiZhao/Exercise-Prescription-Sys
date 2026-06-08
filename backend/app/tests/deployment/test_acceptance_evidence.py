from pathlib import Path
import os


def resolve_project_root() -> Path:
    configured = os.environ.get("PROJECT_ROOT")
    if configured:
        return Path(configured)
    for parent in Path(__file__).resolve().parents:
        if (parent / "docker-compose.yml").exists():
            return parent
    return Path(__file__).resolve().parents[4]


PROJECT_ROOT = resolve_project_root()
EVIDENCE_DOC = PROJECT_ROOT / "docs" / "12_acceptance_evidence.md"


def test_acceptance_evidence_covers_all_delivery_stages_and_safety_rules() -> None:
    assert EVIDENCE_DOC.exists()
    content = EVIDENCE_DOC.read_text(encoding="utf-8")

    for stage in [
        "1. 工程初始化",
        "2. 认证权限",
        "3. 六类数据",
        "4. 风险引擎",
        "5. 动作库、模板库、知识库",
        "6. 分型聚类",
        "7. 处方生成",
        "8. 专家审核",
        "9. 反馈调整",
        "10. 管理科研",
        "11. 报告导出",
        "12. 测试部署",
    ]:
        assert stage in content

    for rule in [
        "R3 禁止生成具体训练处方",
        "R2 可生成 AI 初稿，但必须专家审核后发布",
        "R0/R1 可自动发布，但必须经过规则校验",
        "大模型输出必须是结构化 JSON，并通过 JSON Schema 校验",
        "大模型输出后必须经过规则引擎二次安全校验",
        "处方必须采用 FITT-VP 结构",
        "专家修改、批准、驳回、转介必须留痕",
        "处方必须保留版本历史",
        "科研导出必须脱敏",
        "聚类结果只能辅助模板匹配，不能覆盖风险规则",
    ]:
        assert rule in content


def test_acceptance_evidence_covers_required_tests_and_commands() -> None:
    content = EVIDENCE_DOC.read_text(encoding="utf-8")

    for test_name in [
        "test_risk_r0",
        "test_risk_r1",
        "test_risk_r2_requires_review",
        "test_risk_r3_chest_pain",
        "test_risk_r3_high_bp",
        "test_risk_r3_pain_score",
        "test_r3_no_training_plan",
        "test_llm_output_schema",
        "test_template_matching",
        "test_expert_approve_prescription",
        "test_feedback_adjustment",
        "test_research_export_desensitized",
    ]:
        assert test_name in content

    for command in [
        "docker compose up -d --build",
        "docker compose exec backend alembic upgrade head",
        "docker compose exec backend python scripts/seed_initial_data.py",
        "docker compose exec backend pytest",
        "npm run lint",
        "npm run test -- --run",
        "npm run build",
    ]:
        assert command in content


def test_acceptance_evidence_uses_current_formal_reference_counts() -> None:
    content = EVIDENCE_DOC.read_text(encoding="utf-8")

    assert "python scripts/validate_reference_data.py --strict" in content
    assert "python scripts/seed_reference_data.py --strict" in content
    assert "动作 154" in content or "actions 154" in content or "actions_count\": 154" in content
    assert "动作 98" not in content
    assert "actions approved=98" not in content
