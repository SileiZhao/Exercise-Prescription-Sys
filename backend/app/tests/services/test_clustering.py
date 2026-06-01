from app.services.clustering_service import (
    ClusterTrainingService,
    FeatureBuilder,
    RuleBasedPhenotypeService,
)


def test_rule_based_phenotype_labels_obesity_and_cardiopulmonary():
    snapshot = {
        "profile": {
            "bmi": 29.2,
            "waist_cm": 98,
            "sex": "男",
            "exercise_habit": "无规律运动",
            "exercise_goal": ["减脂", "增强心肺"],
        },
        "fitness_test": {"resting_hr": 86, "sbp": 142, "dbp": 92, "single_leg_stand": 9, "pain_score": 1},
        "body_composition": {"body_fat_pct": 33, "skeletal_muscle_kg": 23, "visceral_fat_level": 14},
        "biochemical_index": {"fbg": 6.4, "tc": 5.8, "tg": 2.1, "hdl_c": 0.9, "ldl_c": 3.8},
        "risk_screening": {"has_joint_pain": False},
    }

    result = RuleBasedPhenotypeService().classify(snapshot)

    assert "肥胖代谢风险型" in result.labels
    assert "心肺功能不足型" in result.labels
    assert "初级运动水平" in result.labels
    assert result.risk_override is False


def test_feature_builder_outputs_stable_vector():
    snapshot = {
        "profile": {"age": 52, "bmi": 27.7, "waist_cm": 96, "sedentary_hours": 8},
        "fitness_test": {"resting_hr": 82, "sbp": 145, "dbp": 92, "pain_score": 2, "single_leg_stand": 8},
        "body_composition": {"body_fat_pct": 31.5, "skeletal_muscle_kg": 26.8, "visceral_fat_level": 13},
        "biochemical_index": {"fbg": 6.1, "tc": 5.4, "tg": 1.8, "hdl_c": 0.9, "ldl_c": 3.5},
    }

    names, values = FeatureBuilder().build(snapshot)

    assert names == [
        "age",
        "bmi",
        "waist_cm",
        "sedentary_hours",
        "resting_hr",
        "sbp",
        "dbp",
        "pain_score",
        "single_leg_stand",
        "body_fat_pct",
        "skeletal_muscle_kg",
        "visceral_fat_level",
        "fbg",
        "tc",
        "tg",
        "hdl_c",
        "ldl_c",
    ]
    assert values[1] == 27.7
    assert len(values) == len(names)


def test_kmeans_training_creates_interpretable_segments():
    samples = [
        {
            "profile": {"age": 30, "bmi": 22, "waist_cm": 78, "sedentary_hours": 4},
            "fitness_test": {"resting_hr": 68, "sbp": 118, "dbp": 76, "pain_score": 0, "single_leg_stand": 50},
            "body_composition": {"body_fat_pct": 18, "skeletal_muscle_kg": 31, "visceral_fat_level": 6},
            "biochemical_index": {"fbg": 5.0, "tc": 4.3, "tg": 1.0, "hdl_c": 1.4, "ldl_c": 2.3},
        },
        {
            "profile": {"age": 35, "bmi": 23, "waist_cm": 80, "sedentary_hours": 5},
            "fitness_test": {"resting_hr": 70, "sbp": 122, "dbp": 78, "pain_score": 1, "single_leg_stand": 42},
            "body_composition": {"body_fat_pct": 20, "skeletal_muscle_kg": 30, "visceral_fat_level": 7},
            "biochemical_index": {"fbg": 5.2, "tc": 4.5, "tg": 1.1, "hdl_c": 1.3, "ldl_c": 2.4},
        },
        {
            "profile": {"age": 58, "bmi": 30, "waist_cm": 101, "sedentary_hours": 9},
            "fitness_test": {"resting_hr": 86, "sbp": 148, "dbp": 94, "pain_score": 3, "single_leg_stand": 8},
            "body_composition": {"body_fat_pct": 34, "skeletal_muscle_kg": 23, "visceral_fat_level": 15},
            "biochemical_index": {"fbg": 6.8, "tc": 5.8, "tg": 2.0, "hdl_c": 0.9, "ldl_c": 3.8},
        },
        {
            "profile": {"age": 62, "bmi": 31, "waist_cm": 104, "sedentary_hours": 10},
            "fitness_test": {"resting_hr": 88, "sbp": 150, "dbp": 96, "pain_score": 4, "single_leg_stand": 6},
            "body_composition": {"body_fat_pct": 36, "skeletal_muscle_kg": 22, "visceral_fat_level": 16},
            "biochemical_index": {"fbg": 7.1, "tc": 6.0, "tg": 2.3, "hdl_c": 0.8, "ldl_c": 4.0},
        },
    ]

    model = ClusterTrainingService().train(samples=samples, n_clusters=2)

    assert model.n_clusters == 2
    assert len(model.cluster_profiles) == 2
    assert any("肥胖代谢风险型" in profile.suggested_labels for profile in model.cluster_profiles)
