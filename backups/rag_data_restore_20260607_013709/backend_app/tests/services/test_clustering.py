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


def _training_samples():
    samples = []
    templates = [
        {
            "profile": {"age": 31, "bmi": 22, "waist_cm": 76, "sedentary_hours": 3, "exercise_habit": "每周3-5次"},
            "fitness_test": {"resting_hr": 64, "sbp": 116, "dbp": 74, "pain_score": 0, "single_leg_stand": 58},
            "body_composition": {"body_fat_pct": 18, "skeletal_muscle_kg": 32, "visceral_fat_level": 6},
            "biochemical_index": {"fbg": 5.0, "tc": 4.2, "tg": 0.9, "hdl_c": 1.5, "ldl_c": 2.2},
        },
        {
            "profile": {"age": 55, "bmi": 30, "waist_cm": 101, "sedentary_hours": 9, "exercise_habit": "无规律运动"},
            "fitness_test": {"resting_hr": 84, "sbp": 136, "dbp": 86, "pain_score": 1, "single_leg_stand": 24},
            "body_composition": {"body_fat_pct": 35, "skeletal_muscle_kg": 25, "visceral_fat_level": 15},
            "biochemical_index": {"fbg": 6.7, "tc": 5.8, "tg": 2.1, "hdl_c": 0.9, "ldl_c": 3.7},
        },
        {
            "profile": {"age": 60, "bmi": 25, "waist_cm": 86, "sedentary_hours": 8, "exercise_habit": "无规律运动"},
            "fitness_test": {"resting_hr": 88, "sbp": 150, "dbp": 95, "pain_score": 2, "single_leg_stand": 16},
            "body_composition": {"body_fat_pct": 27, "skeletal_muscle_kg": 26, "visceral_fat_level": 10},
            "biochemical_index": {"fbg": 5.8, "tc": 5.0, "tg": 1.5, "hdl_c": 1.1, "ldl_c": 3.0},
        },
        {
            "profile": {"age": 68, "bmi": 24, "waist_cm": 82, "sedentary_hours": 7, "exercise_habit": "每周1-2次"},
            "fitness_test": {"resting_hr": 78, "sbp": 132, "dbp": 82, "pain_score": 6, "single_leg_stand": 8},
            "body_composition": {"body_fat_pct": 25, "skeletal_muscle_kg": 21, "visceral_fat_level": 9},
            "biochemical_index": {"fbg": 5.5, "tc": 4.8, "tg": 1.3, "hdl_c": 1.2, "ldl_c": 2.8},
        },
    ]
    for template in templates:
        for index in range(12):
            sample = {
                section: dict(values)
                for section, values in template.items()
            }
            sample["profile"]["age"] += index % 3
            sample["profile"]["bmi"] += (index % 4) * 0.2
            sample["fitness_test"]["sbp"] += index % 4
            sample["body_composition"]["body_fat_pct"] += (index % 3) * 0.3
            samples.append(sample)
    return samples


def test_training_supports_launch_algorithms_and_expert_cluster_profiles():
    service = ClusterTrainingService()

    for algorithm in ["KMeans", "DBSCAN", "GaussianMixture", "AgglomerativeClustering"]:
        model = service.train(
            samples=_training_samples(),
            n_clusters=4,
            name=f"{algorithm} 上线模型",
            algorithm=algorithm,
        )

        assert model.algorithm == algorithm
        assert model.model_origin == "bootstrap_rule_calibrated"
        assert "silhouette_score" in model.metrics
        assert "davies_bouldin_score" in model.metrics
        assert "cluster_stability" in model.metrics
        assert "evaluation_passed" in model.metrics
        if algorithm == "DBSCAN":
            assert "noise_rate" in model.metrics
            assert model.metrics["effective_clusters"] >= 2
        for profile in model.cluster_profiles:
            assert profile.core_risks
            assert profile.exercise_goals
            assert profile.fitt_range
            assert profile.contraindications
            assert profile.review_recommendation
            assert any(
                label in profile.suggested_labels
                for label in ["代谢风险", "血压关注", "低体能", "体重管理", "疼痛/功能受限", "运动基础良好", "进阶提升"]
            )


def test_cluster_stability_reports_real_imbalanced_cluster_ratio_without_floor():
    labels = __import__("numpy").array([0] * 9 + [1])

    stability = ClusterTrainingService()._cluster_stability(labels)

    assert stability < 0.70
    assert stability == 0.1111


def test_gmm_training_persists_likelihood_parameters_and_strategy():
    model = ClusterTrainingService().train(
        samples=_training_samples(),
        n_clusters=4,
        name="GMM 上线模型",
        algorithm="GaussianMixture",
    )

    assert model.model_params["predict_strategy"] == "gaussian_log_likelihood"
    assert model.model_params["means"]
    assert model.model_params["covariances"]
    assert model.model_params["precisions"]
    assert model.model_params["weights"]


def test_agglomerative_and_dbscan_predict_strategies_are_explicit():
    service = ClusterTrainingService()

    agglomerative = service.train(
        samples=_training_samples(),
        n_clusters=4,
        name="层次聚类上线模型",
        algorithm="AgglomerativeClustering",
    )
    dbscan = service.train(
        samples=_training_samples(),
        n_clusters=4,
        name="DBSCAN 上线模型",
        algorithm="DBSCAN",
    )

    assert agglomerative.model_params["predict_strategy"] == "centroid_projection"
    assert agglomerative.model_params["predict_strategy_label"] == "层次聚类投影分类"
    assert dbscan.model_params["predict_strategy"] == "density_approximation"
    assert dbscan.model_params["predict_strategy_label"] == "密度近似分类，不确定时需专家解释"
    assert dbscan.model_params["noise_label"] == "未归类/需专家解释"
    assert dbscan.model_params["representative_points"]
