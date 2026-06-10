import json
from pathlib import Path

import pytest

from scripts.generate_reference_data_with_ai import (
    GenerationTargets,
    build_arg_parser,
    generate_reference_libraries,
    validate_reference_bundle,
)


class FakeReferenceLLMClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def complete_json(self, *, library: str, schema: dict, target_count: int, context: dict) -> dict:
        self.calls.append(
            {
                "library": library,
                "schema_title": schema.get("title"),
                "target_count": target_count,
                "context": context,
            }
        )
        payloads = {
            "contraindications": {"contraindications": [_contra("C_HTN"), _contra("C_DM", disease="糖尿病")]},
            "actions": {"actions": [_action("ACT_WALK", "快走", "有氧"), _action("ACT_BAND", "弹力带划船", "抗阻")]},
            "templates": {
                "templates": [
                    _template("TPL_R1_WEIGHT", "R1", ["减脂"], ["快走", "弹力带划船"]),
                    _template("TPL_R3_REFERRAL", "R3", ["医学转介"], None),
                ]
            },
            "risk_rules": {
                "risk_rules": [
                    _rule("RULE_R2_HTN", "R2", "YELLOW", "fitness_test.sbp", "gte", 140),
                    _rule("RULE_R3_CHEST", "R3", "RED", "risk_screening.chest_pain", "eq", True),
                ]
            },
        }
        return payloads[library]


def _contra(code: str, *, disease: str = "高血压") -> dict:
    return {
        "contraindication_code": code,
        "disease": disease,
        "risk_level": "R2",
        "contraindication_type": "relative",
        "forbidden_action_categories": ["高冲击", "大重量抗阻"],
        "stop_signals": ["胸痛", "晕厥"],
        "referral_criteria": ["静息血压达到红色阈值"],
        "rationale": "慢病风险需避免不可控强度。",
        "evidence_refs": ["ACSM screening"],
    }


def _action(code: str, name: str, category: str) -> dict:
    return {
        "action_code": code,
        "name": name,
        "category": category,
        "risk_level": "R1",
        "suitable_tags": ["减脂", "初级运动水平", "低冲击", "居家", "老年友好"],
        "contraindication_tags": ["胸痛", "晕厥"],
        "body_parts": ["全身"],
        "intensity": "低",
        "impact_level": "低",
        "joint_stress_level": "低",
        "requires_equipment": category == "抗阻",
        "instructions": "保持自然呼吸，按RPE监测。",
        "stop_signals": ["胸痛立即停止"],
        "evidence_refs": ["WHO 2020"],
    }


def _template(code: str, risk_level: str, goals: list[str], actions: list[str] | None) -> dict:
    return {
        "template_code": code,
        "name": f"{risk_level}模板",
        "risk_level": risk_level,
        "cluster_tags": ["普通健康维持型"],
        "goal_tags": goals,
        "fitt_vp": None
        if risk_level == "R3"
        else {
            "frequency": "每周3次",
            "intensity": "低—中等强度",
            "time": "每次30分钟",
            "type": actions,
            "volume": "每周90分钟",
            "progression": "每2-4周调整",
        },
        "precautions": ["监测RPE"],
        "contraindications": ["胸痛"],
        "evidence_refs": ["WHO 2020"],
        "status": "DRAFT",
    }


def _rule(code: str, risk_level: str, severity: str, path: str, op: str, value) -> dict:
    return {
        "rule_code": code,
        "rule_name": code,
        "risk_level": risk_level,
        "severity": severity,
        "priority": 10,
        "field_path": path,
        "operator": op,
        "value": value,
        "user_message": "命中规则后进入对应风险流程。",
        "contraindications": ["高强度冲刺"],
        "intensity_cap": "低强度",
        "evidence_source": "专家规则表",
    }


def _valid_bundle() -> dict:
    actions = [
        _action("ACT_AER", "快走", "有氧"),
        _action("ACT_RES", "弹力带划船", "抗阻"),
        _action("ACT_FLEX", "髋屈肌拉伸", "柔韧"),
        _action("ACT_BAL", "扶椅单脚站", "平衡"),
        _action("ACT_BREATH", "腹式呼吸", "呼吸训练"),
        _action("ACT_LOW", "固定自行车低阻力", "低冲击"),
        _action("ACT_HOME", "坐站训练", "居家"),
        _action("ACT_EQ", "椭圆机", "器械"),
        _action("ACT_OLD", "八段锦", "老年友好"),
    ]
    templates = [
        _template("TPL_R0", "R0", ["久坐人群"], ["快走"]),
        _template("TPL_R1_WEIGHT", "R1", ["减脂"], ["快走", "弹力带划船"]),
        _template("TPL_R1_SUGAR", "R1", ["控糖"], ["固定自行车低阻力"]),
        _template("TPL_R2_BP", "R2", ["控压"], ["八段锦"]),
        _template("TPL_R1_CARDIO", "R1", ["心肺耐力"], ["椭圆机"]),
        _template("TPL_R1_STRENGTH", "R1", ["肌力提升"], ["弹力带划船"]),
        _template("TPL_R1_FALL", "R1", ["老年防跌倒"], ["扶椅单脚站"]),
        _template("TPL_R3", "R3", ["医学转介"], None),
    ]
    return {
        "contraindications": [_contra("C_HTN"), _contra("C_DM", disease="糖尿病")],
        "actions": actions,
        "templates": templates,
        "risk_rules": [
            _rule("RULE_R2_HTN", "R2", "YELLOW", "fitness_test.sbp", "gte", 140),
            _rule("RULE_R3_CHEST", "R3", "RED", "risk_screening.chest_pain", "eq", True),
        ],
    }


def test_validate_reference_bundle_passes_schema_coverage_and_conflict_checks() -> None:
    report = validate_reference_bundle(
        _valid_bundle(),
        targets=GenerationTargets(
            contraindications=2,
            actions=9,
            templates=8,
            risk_rules=2,
        ),
    )

    assert report["blocking_errors"] == []
    assert report["counts"] == {
        "contraindications": 2,
        "actions": 9,
        "templates": 8,
        "risk_rules": 2,
    }
    assert "有氧" in report["coverage"]["action_facets"]
    assert "R3" in report["coverage"]["risk_levels"]


def test_validate_reference_bundle_rejects_duplicates_and_contraindication_conflicts() -> None:
    bundle = _valid_bundle()
    bundle["actions"][1]["action_code"] = "ACT_AER"
    bundle["actions"][2]["suitable_tags"].append("胸痛")

    report = validate_reference_bundle(
        bundle,
        targets=GenerationTargets(contraindications=2, actions=1, templates=1, risk_rules=1),
    )

    assert any("duplicate action_code" in item for item in report["blocking_errors"])
    assert any("suitable/contraindication conflict" in item for item in report["blocking_errors"])


def test_generate_reference_libraries_calls_ai_and_writes_split_files(tmp_path: Path) -> None:
    client = FakeReferenceLLMClient()

    report = generate_reference_libraries(
        output_dir=tmp_path,
        client=client,
        targets=GenerationTargets(contraindications=2, actions=2, templates=2, risk_rules=2),
    )

    assert report["blocking_errors"] == []
    assert [call["library"] for call in client.calls] == [
        "contraindications",
        "actions",
        "templates",
        "risk_rules",
    ]
    assert json.loads((tmp_path / "ai_generated_exercise_actions.json").read_text(encoding="utf-8"))["items"][0]["name"] == "快走"
    template_items = json.loads((tmp_path / "ai_generated_prescription_templates.json").read_text(encoding="utf-8"))["items"]
    assert template_items[1]["risk_level"] == "R3"
    assert template_items[1]["fitt_vp"] is None
    manifest = json.loads((tmp_path / "ai_generated_reference_manifest.json").read_text(encoding="utf-8"))
    assert manifest["counts"]["actions"] == 2
    assert manifest["schema_versions"]["actions"].startswith("pydantic-json-schema:")


class BatchReferenceLLMClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def complete_json(self, *, library: str, schema: dict, target_count: int, context: dict) -> dict:
        self.calls.append({"library": library, "target_count": target_count, "context": context})
        batch_index = context["batch_index"]
        payloads = {
            "contraindications": {"contraindications": [_contra(f"C_BATCH_{batch_index}")]},
            "actions": {
                "actions": [
                    _action(f"ACT_BATCH_{batch_index}", "快走" if batch_index == 1 else "弹力带划船", "有氧" if batch_index == 1 else "抗阻")
                ]
            },
            "templates": {"templates": [_template("TPL_BATCH_R1", "R1", ["减脂"], ["快走"])]},
            "risk_rules": {"risk_rules": [_rule("RULE_BATCH_R2", "R2", "YELLOW", "fitness_test.sbp", "gte", 140)]},
        }
        return payloads[library]


class FlakyReferenceLLMClient(BatchReferenceLLMClient):
    def __init__(self) -> None:
        super().__init__()
        self.failed_once = False

    def complete_json(self, *, library: str, schema: dict, target_count: int, context: dict) -> dict:
        if library == "actions" and not self.failed_once:
            self.failed_once = True
            raise TimeoutError("read operation timed out")
        return super().complete_json(
            library=library,
            schema=schema,
            target_count=target_count,
            context=context,
        )


class FailsOnSecondActionBatchClient(BatchReferenceLLMClient):
    def complete_json(self, *, library: str, schema: dict, target_count: int, context: dict) -> dict:
        if library == "actions" and context["batch_index"] == 2:
            raise TimeoutError("second action batch timed out")
        return super().complete_json(
            library=library,
            schema=schema,
            target_count=target_count,
            context=context,
        )


def test_generate_reference_libraries_batches_until_targets_are_met(tmp_path: Path) -> None:
    client = BatchReferenceLLMClient()

    report = generate_reference_libraries(
        output_dir=tmp_path,
        client=client,
        targets=GenerationTargets(contraindications=1, actions=2, templates=1, risk_rules=1),
        batch_size=1,
    )

    assert report["blocking_errors"] == []
    action_calls = [call for call in client.calls if call["library"] == "actions"]
    assert [call["target_count"] for call in action_calls] == [1, 1]
    assert action_calls[1]["context"]["existing_codes"] == ["ACT_BATCH_1"]
    actions = json.loads((tmp_path / "ai_generated_exercise_actions.json").read_text(encoding="utf-8"))["items"]
    assert [item["action_code"] for item in actions] == ["ACT_BATCH_1", "ACT_BATCH_2"]


def test_generate_reference_libraries_retries_transient_llm_batch_failures(tmp_path: Path) -> None:
    client = FlakyReferenceLLMClient()

    report = generate_reference_libraries(
        output_dir=tmp_path,
        client=client,
        targets=GenerationTargets(contraindications=1, actions=1, templates=1, risk_rules=1),
        batch_size=1,
        max_retries=1,
    )

    assert report["blocking_errors"] == []
    assert client.failed_once is True
    action_calls = [call for call in client.calls if call["library"] == "actions"]
    assert len(action_calls) == 1


def test_generate_reference_libraries_checkpoints_and_resumes_partial_batches(tmp_path: Path) -> None:
    with pytest.raises(TimeoutError):
        generate_reference_libraries(
            output_dir=tmp_path,
            client=FailsOnSecondActionBatchClient(),
            targets=GenerationTargets(contraindications=1, actions=2, templates=1, risk_rules=1),
            batch_size=1,
            max_retries=0,
        )

    partial = json.loads((tmp_path / "ai_generated_actions.partial.json").read_text(encoding="utf-8"))
    assert [item["action_code"] for item in partial["items"]] == ["ACT_BATCH_1"]

    report = generate_reference_libraries(
        output_dir=tmp_path,
        client=BatchReferenceLLMClient(),
        targets=GenerationTargets(contraindications=1, actions=2, templates=1, risk_rules=1),
        batch_size=1,
        max_retries=0,
        resume=True,
    )

    assert report["blocking_errors"] == []
    actions = json.loads((tmp_path / "ai_generated_exercise_actions.json").read_text(encoding="utf-8"))["items"]
    assert [item["action_code"] for item in actions] == ["ACT_BATCH_1", "ACT_BATCH_2"]


def test_generate_reference_data_cli_accepts_batch_size() -> None:
    args = build_arg_parser().parse_args(["--batch-size", "12", "--timeout", "240", "--resume"])

    assert args.batch_size == 12
    assert args.timeout == 240
    assert args.resume is True
