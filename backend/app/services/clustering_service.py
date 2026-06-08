from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.cluster import AgglomerativeClustering, DBSCAN, KMeans
from sklearn.mixture import GaussianMixture
from sklearn.metrics import davies_bouldin_score, silhouette_score
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cluster import ClusterModel, UserClusterAssignment
from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    FitnessTest,
    UserProfile,
    model_to_dict,
)
from app.models.risk import RiskRuleConfig
from app.schemas.cluster import ClusterProfile, RulePhenotypeResult, TrainedClusterModel
from app.services.audit_service import AuditService
from app.services.health_profile_service import HealthProfileService


class RuleBasedPhenotypeService:
    def classify(self, snapshot: dict[str, Any]) -> RulePhenotypeResult:
        profile = snapshot.get("profile") or {}
        fitness = snapshot.get("fitness_test") or {}
        body = snapshot.get("body_composition") or {}
        biochemical = snapshot.get("biochemical_index") or {}
        risk = snapshot.get("risk_screening") or {}

        labels: list[str] = []
        bmi = profile.get("bmi")
        waist = profile.get("waist_cm")
        sex = profile.get("sex")
        body_fat = body.get("body_fat_pct")
        visceral = body.get("visceral_fat_level")
        skeletal = body.get("skeletal_muscle_kg")
        resting_hr = fitness.get("resting_hr")
        sbp = fitness.get("sbp")
        single_leg = fitness.get("single_leg_stand")
        pain = fitness.get("pain_score")
        fbg = biochemical.get("fbg")
        tg = biochemical.get("tg")
        hdl = biochemical.get("hdl_c")

        central_obesity = (
            waist is not None
            and ((sex == "男" and waist >= 90) or (sex == "女" and waist >= 85))
        )
        if (bmi is not None and bmi >= 28) or central_obesity or (body_fat is not None and body_fat >= 30) or (
            visceral is not None and visceral >= 13
        ):
            labels.append("肥胖代谢风险型")

        if (resting_hr is not None and resting_hr >= 85) or (sbp is not None and sbp >= 140):
            labels.append("心肺功能不足型")

        if skeletal is not None and skeletal < 24:
            labels.append("肌力不足型")

        if single_leg is not None and single_leg < 10:
            labels.append("老年功能下降型")

        if pain is not None and pain >= 4 or risk.get("has_joint_pain"):
            labels.append("损伤风险限制型")

        if (fbg is not None and fbg >= 6.1) or (tg is not None and tg >= 1.7) or (hdl is not None and hdl < 1.0):
            if "肥胖代谢风险型" not in labels:
                labels.append("肥胖代谢风险型")

        if profile.get("exercise_habit") == "无规律运动":
            labels.append("初级运动水平")

        if not labels:
            labels.append("普通健康维持型")

        summary = "、".join(labels) + "；聚类和规则分型仅用于模板匹配，不覆盖风险规则。"
        return RulePhenotypeResult(labels=labels, profile_summary=summary, risk_override=False)


class FeatureBuilder:
    feature_paths = [
        ("age", "profile.age"),
        ("bmi", "profile.bmi"),
        ("waist_cm", "profile.waist_cm"),
        ("sedentary_hours", "profile.sedentary_hours"),
        ("resting_hr", "fitness_test.resting_hr"),
        ("sbp", "fitness_test.sbp"),
        ("dbp", "fitness_test.dbp"),
        ("pain_score", "fitness_test.pain_score"),
        ("single_leg_stand", "fitness_test.single_leg_stand"),
        ("body_fat_pct", "body_composition.body_fat_pct"),
        ("skeletal_muscle_kg", "body_composition.skeletal_muscle_kg"),
        ("visceral_fat_level", "body_composition.visceral_fat_level"),
        ("fbg", "biochemical_index.fbg"),
        ("tc", "biochemical_index.tc"),
        ("tg", "biochemical_index.tg"),
        ("hdl_c", "biochemical_index.hdl_c"),
        ("ldl_c", "biochemical_index.ldl_c"),
    ]

    defaults = {
        "age": 40,
        "bmi": 23,
        "waist_cm": 80,
        "sedentary_hours": 6,
        "resting_hr": 75,
        "sbp": 120,
        "dbp": 80,
        "pain_score": 0,
        "single_leg_stand": 30,
        "body_fat_pct": 24,
        "skeletal_muscle_kg": 28,
        "visceral_fat_level": 8,
        "fbg": 5.2,
        "tc": 4.5,
        "tg": 1.2,
        "hdl_c": 1.2,
        "ldl_c": 2.6,
    }

    def build(self, snapshot: dict[str, Any]) -> tuple[list[str], list[float]]:
        names: list[str] = []
        values: list[float] = []
        for name, path in self.feature_paths:
            value = self._get_path(snapshot, path)
            names.append(name)
            values.append(float(value if value is not None else self.defaults[name]))
        return names, values

    def _get_path(self, data: dict[str, Any], path: str) -> Any:
        current: Any = data
        for part in path.split("."):
            if not isinstance(current, dict):
                return None
            current = current.get(part)
        return current


@dataclass
class ClusterTrainingService:
    feature_builder: FeatureBuilder = FeatureBuilder()

    thresholds = {
        "silhouette_score": 0.25,
        "davies_bouldin_score": 2.2,
        "cluster_stability": 0.70,
        "min_cluster_ratio": 0.05,
        "dbscan_noise_rate": 0.35,
        "dbscan_effective_clusters": 2,
    }

    def train(
        self,
        samples: list[dict[str, Any]],
        n_clusters: int,
        name: str = "KMeans 人群分型模型",
        algorithm: str = "KMeans",
    ) -> TrainedClusterModel:
        feature_names: list[str] = []
        matrix: list[list[float]] = []
        for sample in samples:
            feature_names, values = self.feature_builder.build(sample)
            matrix.append(values)

        scaler = StandardScaler()
        scaled = scaler.fit_transform(matrix)
        labels, model_params = self._fit_predict(np.asarray(scaled), n_clusters=n_clusters, algorithm=algorithm)

        profiles: list[ClusterProfile] = []
        effective_labels = sorted(label for label in set(int(label) for label in labels) if label >= 0)
        for cluster_id in effective_labels:
            indexes = [index for index, label in enumerate(labels) if label == cluster_id]
            raw_center = [
                sum(matrix[index][feature_index] for index in indexes) / len(indexes)
                for feature_index in range(len(feature_names))
            ]
            center = {name: round(raw_center[index], 2) for index, name in enumerate(feature_names)}
            suggested = self._suggest_labels(center)
            expert_profile = self._build_expert_profile(center, suggested)
            profiles.append(
                ClusterProfile(
                    cluster_id=cluster_id,
                    size=len(indexes),
                    center=center,
                    suggested_labels=suggested,
                    explanation=f"该类样本主要表现为{'、'.join(suggested)}。",
                    core_risks=expert_profile["core_risks"],
                    exercise_goals=expert_profile["exercise_goals"],
                    fitt_range=expert_profile["fitt_range"],
                    contraindications=expert_profile["contraindications"],
                    review_recommendation=expert_profile["review_recommendation"],
                )
            )

        metrics = self._evaluate(scaled=np.asarray(scaled), labels=np.asarray(labels), profiles=profiles, algorithm=algorithm)
        scaler_params = {
            "mean": [float(value) for value in scaler.mean_],
            "scale": [float(value) for value in scaler.scale_],
        }

        return TrainedClusterModel(
            name=name,
            algorithm=algorithm,
            n_clusters=n_clusters,
            feature_names=feature_names,
            cluster_profiles=profiles,
            metrics=metrics,
            scaler_params=scaler_params,
            model_params=model_params,
            model_origin="bootstrap_rule_calibrated",
        )

    def _fit_predict(self, scaled: np.ndarray, n_clusters: int, algorithm: str) -> tuple[np.ndarray, dict[str, Any]]:
        if algorithm == "KMeans":
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(scaled)
            return labels, {
                "centers": model.cluster_centers_.tolist(),
                "predict_strategy": "nearest_center",
            }
        if algorithm == "GaussianMixture":
            model = GaussianMixture(n_components=n_clusters, random_state=42, covariance_type="full")
            labels = model.fit_predict(scaled)
            return labels, {
                "means": model.means_.tolist(),
                "covariances": model.covariances_.tolist(),
                "precisions": model.precisions_.tolist(),
                "weights": model.weights_.tolist(),
                "predict_strategy": "gaussian_log_likelihood",
                "predict_strategy_label": "高斯混合模型对数似然分类",
            }
        if algorithm == "AgglomerativeClustering":
            model = AgglomerativeClustering(n_clusters=n_clusters)
            labels = model.fit_predict(scaled)
            centers = self._centers_from_labels(scaled, labels)
            return labels, {
                "centers": centers.tolist(),
                "predict_strategy": "centroid_projection",
                "predict_strategy_label": "层次聚类投影分类",
            }
        if algorithm == "DBSCAN":
            model = DBSCAN(eps=1.9, min_samples=3)
            labels = model.fit_predict(scaled)
            if len({int(label) for label in labels if label >= 0}) < 2:
                model = DBSCAN(eps=2.4, min_samples=2)
                labels = model.fit_predict(scaled)
            centers = self._centers_from_labels(scaled, labels)
            core_indexes = getattr(model, "core_sample_indices_", np.asarray([], dtype=int))
            representative_points = [
                {
                    "cluster_id": int(labels[index]),
                    "point": scaled[index].tolist(),
                }
                for index in core_indexes
                if int(labels[index]) >= 0
            ]
            return labels, {
                "centers": centers.tolist(),
                "eps": float(model.eps),
                "min_samples": int(model.min_samples),
                "representative_points": representative_points,
                "predict_strategy": "density_approximation",
                "predict_strategy_label": "密度近似分类，不确定时需专家解释",
                "noise_label": "未归类/需专家解释",
            }
        raise ValueError(f"不支持的聚类算法：{algorithm}")

    def _centers_from_labels(self, scaled: np.ndarray, labels: np.ndarray) -> np.ndarray:
        centers = []
        for label in sorted(label for label in set(int(item) for item in labels) if label >= 0):
            centers.append(scaled[labels == label].mean(axis=0))
        if not centers:
            centers.append(scaled.mean(axis=0))
        return np.asarray(centers)

    def _evaluate(
        self,
        scaled: np.ndarray,
        labels: np.ndarray,
        profiles: list[ClusterProfile],
        algorithm: str,
    ) -> dict[str, float]:
        non_noise_mask = labels >= 0
        metric_labels = labels[non_noise_mask]
        metric_scaled = scaled[non_noise_mask]
        effective_clusters = len(set(int(label) for label in metric_labels))
        metrics: dict[str, float] = {
            "effective_clusters": float(effective_clusters),
            "cluster_stability": self._cluster_stability(metric_labels),
            "min_cluster_ratio": self._min_cluster_ratio(metric_labels),
        }
        if len(metric_scaled) > effective_clusters and effective_clusters >= 2:
            metrics["silhouette_score"] = round(float(silhouette_score(metric_scaled, metric_labels)), 4)
            metrics["davies_bouldin_score"] = round(float(davies_bouldin_score(metric_scaled, metric_labels)), 4)
        else:
            metrics["silhouette_score"] = -1.0
            metrics["davies_bouldin_score"] = 99.0
        if algorithm == "DBSCAN":
            metrics["noise_rate"] = round(float(np.mean(labels < 0)), 4)
        metrics["evaluation_passed"] = 1.0 if self._passes_thresholds(metrics, algorithm) else 0.0
        return metrics

    def _cluster_stability(self, labels: np.ndarray) -> float:
        if len(labels) == 0:
            return 0.0
        counts = np.asarray([sum(labels == label) for label in set(int(item) for item in labels)])
        ratio = float(counts.min() / counts.max()) if counts.max() else 0.0
        return round(min(1.0, ratio), 4)

    def _min_cluster_ratio(self, labels: np.ndarray) -> float:
        if len(labels) == 0:
            return 0.0
        counts = [sum(labels == label) for label in set(int(item) for item in labels)]
        return round(float(min(counts) / len(labels)), 4)

    def _passes_thresholds(self, metrics: dict[str, float], algorithm: str) -> bool:
        passed = (
            metrics["silhouette_score"] >= self.thresholds["silhouette_score"]
            and metrics["davies_bouldin_score"] <= self.thresholds["davies_bouldin_score"]
            and metrics["cluster_stability"] >= self.thresholds["cluster_stability"]
            and metrics["min_cluster_ratio"] >= self.thresholds["min_cluster_ratio"]
        )
        if algorithm == "DBSCAN":
            passed = (
                passed
                and metrics.get("noise_rate", 1.0) <= self.thresholds["dbscan_noise_rate"]
                and metrics["effective_clusters"] >= self.thresholds["dbscan_effective_clusters"]
            )
        return passed

    def _suggest_labels(self, center: dict[str, float]) -> list[str]:
        labels: list[str] = []
        if center["bmi"] >= 28 or center["waist_cm"] >= 90 or center["visceral_fat_level"] >= 13:
            labels.append("代谢风险")
            labels.append("体重管理")
            labels.append("肥胖代谢风险型")
        if center["sbp"] >= 140 or center["resting_hr"] >= 85:
            labels.append("血压关注")
            labels.append("心肺功能不足型")
        if center["skeletal_muscle_kg"] < 24:
            labels.append("低体能")
            labels.append("肌力不足型")
        if center["single_leg_stand"] < 10 or center["age"] >= 60:
            labels.append("低体能")
            labels.append("老年功能下降型")
        if center["pain_score"] >= 4:
            labels.append("疼痛/功能受限")
            labels.append("损伤风险限制型")
        if not labels and center["resting_hr"] <= 72 and center["bmi"] < 24 and center["single_leg_stand"] >= 30:
            labels.extend(["运动基础良好", "进阶提升"])
        return list(dict.fromkeys(labels or ["运动基础良好"]))

    def _build_expert_profile(self, center: dict[str, float], labels: list[str]) -> dict[str, Any]:
        core_risks: list[str] = []
        goals: list[str] = []
        contraindications: list[str] = []
        fitt_range = {
            "frequency": "每周3-5次",
            "intensity": "低至中等强度，RPE 11-13",
            "time": "每次20-45分钟",
            "type": "有氧训练、渐进抗阻、柔韧和平衡训练组合",
        }
        if "代谢风险" in labels or "体重管理" in labels:
            core_risks.append("中心型肥胖或糖脂代谢风险")
            goals.append("改善体重、腰围与糖脂代谢")
            contraindications.append("避免突然大强度冲刺和长时间空腹运动")
        if "血压关注" in labels:
            core_risks.append("血压或心肺负荷需关注")
            goals.append("稳定血压反应并提升心肺耐力")
            contraindications.append("避免憋气用力、极高强度间歇和快速变换体位")
            fitt_range["intensity"] = "低至中等强度，RPE 10-12，优先监测血压"
        if "低体能" in labels:
            core_risks.append("肌力、平衡或基础体能不足")
            goals.append("提升基础体能、肌力和平衡能力")
            fitt_range["time"] = "每次10-30分钟，可分段完成"
        if "疼痛/功能受限" in labels:
            core_risks.append("疼痛或功能受限")
            goals.append("降低疼痛相关动作负荷并改善活动度")
            contraindications.append("暂停诱发疼痛加重的跳跃、深蹲、快速扭转和高冲击动作")
            fitt_range["type"] = "低冲击有氧、关节活动度、拉伸、轻阻力训练"
        if "运动基础良好" in labels or "进阶提升" in labels:
            core_risks.append("当前运动基础较好")
            goals.append("巩固健康体能并循序渐进提升")
            fitt_range["intensity"] = "中等强度为主，个别训练可至 RPE 14-15"
        return {
            "core_risks": core_risks or ["未见突出聚类风险"],
            "exercise_goals": goals or ["维持健康体能与规律运动习惯"],
            "fitt_range": fitt_range,
            "contraindications": contraindications or ["按风险等级遵循通用停止运动信号"],
            "review_recommendation": "R2、R3 或出现异常反馈时需专家复核；R0/R1 可按规则校验后执行。",
        }


class ClusterPersistenceService:
    def __init__(self, db: Session):
        self.db = db
        self.health_service = HealthProfileService(db)
        self.rule_service = RuleBasedPhenotypeService()
        self.training_service = ClusterTrainingService()

    def train_from_database(
        self,
        name: str,
        n_clusters: int,
        created_by: int | None,
        algorithm: str = "KMeans",
    ) -> ClusterModel:
        samples = self._collect_training_samples()
        min_bootstrap_size = max(n_clusters * 12, 48)
        if len(samples) < min_bootstrap_size:
            samples.extend(self._collect_bootstrap_anchor_samples(target_size=min_bootstrap_size - len(samples)))
        if len(samples) < n_clusters:
            raise ValueError("可用于聚类训练的样本数不足")
        trained = self.training_service.train(samples=samples, n_clusters=n_clusters, name=name, algorithm=algorithm)
        record = ClusterModel(
            name=trained.name,
            algorithm=trained.algorithm,
            n_clusters=trained.n_clusters,
            feature_names=trained.feature_names,
            cluster_profiles=[profile.model_dump() for profile in trained.cluster_profiles],
            metrics=trained.metrics,
            scaler_params=trained.scaler_params,
            model_params=trained.model_params,
            model_origin=trained.model_origin,
            created_by=created_by,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def classify_user(self, user_id: int) -> UserClusterAssignment:
        snapshot = self.health_service.latest_snapshot(user_id)
        rule_result = self.rule_service.classify(snapshot)
        active_model = self.db.scalar(
            select(ClusterModel)
            .where(ClusterModel.status == "ACTIVE")
            .order_by(ClusterModel.created_at.desc(), ClusterModel.id.desc())
            .limit(1)
        )
        cluster_id: int | None = None
        cluster_label = rule_result.labels[0]
        profile_summary = rule_result.profile_summary
        if active_model is not None:
            matched_profile = self._predict_profile(active_model, snapshot)
            if matched_profile is not None:
                cluster_id = matched_profile.get("cluster_id")
                suggested_labels = matched_profile.get("suggested_labels") or []
                if suggested_labels:
                    cluster_label = suggested_labels[0]
                explanation = matched_profile.get("explanation")
                if explanation:
                    profile_summary = f"{profile_summary} 聚类模型提示：{explanation}"
        assignment = UserClusterAssignment(
            user_id=user_id,
            model_id=active_model.id if active_model else None,
            rule_labels=rule_result.labels,
            cluster_label=cluster_label,
            cluster_id=cluster_id,
            profile_summary=profile_summary,
            risk_override=rule_result.risk_override,
        )
        self.db.add(assignment)
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def _match_profile(self, profiles: list[dict], rule_labels: list[str]) -> dict | None:
        label_set = set(rule_labels)
        best_profile: dict | None = None
        best_score = -1
        for profile in profiles:
            suggested_labels = set(profile.get("suggested_labels") or [])
            score = len(label_set.intersection(suggested_labels))
            if score > best_score:
                best_score = score
                best_profile = profile
        if best_score <= 0:
            return profiles[0] if profiles else None
        return best_profile

    def list_models(self) -> list[ClusterModel]:
        return list(self.db.scalars(select(ClusterModel).order_by(ClusterModel.id.desc())))

    def update_model_status(
        self,
        model_id: int,
        status: str,
        actor_id: int | None,
        reason: str | None = None,
    ) -> ClusterModel | None:
        model = self.db.get(ClusterModel, model_id)
        if model is None:
            return None

        if status == "ACTIVE":
            if float((model.metrics or {}).get("evaluation_passed", 1.0)) < 1.0:
                raise ValueError("聚类模型评估未达标，不能启用")
            active_models = self.db.scalars(
                select(ClusterModel).where(ClusterModel.status == "ACTIVE", ClusterModel.id != model_id)
            ).all()
            for active_model in active_models:
                active_model.status = "ARCHIVED"

        model.status = status
        AuditService(self.db).record(
            action="UPDATE_CLUSTER_MODEL_STATUS",
            resource_type="ClusterModel",
            actor_id=actor_id,
            resource_id=str(model.id),
            metadata={
                "status": status,
                "reason": reason,
                "model_name": model.name,
            },
        )
        self.db.commit()
        self.db.refresh(model)
        return model

    def _predict_profile(self, model: ClusterModel, snapshot: dict[str, Any]) -> dict | None:
        profiles = model.cluster_profiles or []
        model_params = model.model_params or {}
        if not profiles:
            return self._match_profile(profiles, self.rule_service.classify(snapshot).labels)

        scaled = self._scaled_feature_vector(model, snapshot)
        strategy = model_params.get("predict_strategy")
        if strategy == "gaussian_log_likelihood":
            predicted_cluster_id = self._predict_gmm_component(model_params, scaled)
            return self._profile_for_cluster_id(profiles, predicted_cluster_id)
        if strategy == "density_approximation":
            predicted_cluster_id = self._predict_dbscan_density(model_params, scaled)
            if predicted_cluster_id is None:
                return {
                    "cluster_id": None,
                    "suggested_labels": [model_params.get("noise_label") or "未归类/需专家解释"],
                    "explanation": "DBSCAN 密度近似未找到 eps 范围内的核心代表点，分类不确定，需专家解释。",
                }
            return self._profile_for_cluster_id(profiles, predicted_cluster_id)

        centers = model_params.get("centers") or []
        center_matrix = np.asarray(centers, dtype=float)
        if center_matrix.ndim != 2 or center_matrix.shape[1] != scaled.shape[0]:
            return self._match_profile(profiles, self.rule_service.classify(snapshot).labels)
        distances = np.linalg.norm(center_matrix - scaled, axis=1)
        center_index = int(np.argmin(distances))
        cluster_ids = sorted(profile.get("cluster_id") for profile in profiles if profile.get("cluster_id") is not None)
        if center_index < len(cluster_ids):
            predicted_cluster_id = cluster_ids[center_index]
            return self._profile_for_cluster_id(profiles, predicted_cluster_id)
        return profiles[0]

    def _scaled_feature_vector(self, model: ClusterModel, snapshot: dict[str, Any]) -> np.ndarray:
        feature_names, values = self.training_service.feature_builder.build(snapshot)
        active_feature_names = model.feature_names or feature_names
        value_by_name = dict(zip(feature_names, values, strict=False))
        ordered = np.asarray(
            [float(value_by_name.get(name, FeatureBuilder.defaults.get(name, 0))) for name in active_feature_names],
            dtype=float,
        )
        scaler_params = model.scaler_params or {}
        mean = np.asarray(scaler_params.get("mean") or [0.0] * len(ordered), dtype=float)
        scale = np.asarray(scaler_params.get("scale") or [1.0] * len(ordered), dtype=float)
        scale = np.where(scale == 0, 1.0, scale)
        return (ordered - mean) / scale

    def _profile_for_cluster_id(self, profiles: list[dict], cluster_id: int | None) -> dict | None:
        if cluster_id is None:
            return None
        return next((profile for profile in profiles if profile.get("cluster_id") == cluster_id), None)

    def _predict_gmm_component(self, model_params: dict[str, Any], scaled: np.ndarray) -> int | None:
        means = np.asarray(model_params.get("means") or [], dtype=float)
        weights = np.asarray(model_params.get("weights") or [], dtype=float)
        precisions = np.asarray(model_params.get("precisions") or [], dtype=float)
        covariances = np.asarray(model_params.get("covariances") or [], dtype=float)
        if means.ndim != 2 or means.shape[1] != scaled.shape[0] or len(weights) != len(means):
            return None
        scores: list[float] = []
        for index, mean in enumerate(means):
            diff = scaled - mean
            precision = precisions[index] if precisions.ndim == 3 and index < len(precisions) else np.eye(len(diff))
            mahalanobis = float(diff.T @ precision @ diff)
            covariance = covariances[index] if covariances.ndim == 3 and index < len(covariances) else np.eye(len(diff))
            determinant = max(float(np.linalg.det(covariance)), 1e-12)
            log_weight = float(np.log(max(weights[index], 1e-12)))
            scores.append(log_weight - 0.5 * (mahalanobis + np.log(determinant)))
        return int(np.argmax(scores)) if scores else None

    def _predict_dbscan_density(self, model_params: dict[str, Any], scaled: np.ndarray) -> int | None:
        representatives = model_params.get("representative_points") or []
        eps = float(model_params.get("eps") or 0.0)
        if eps <= 0 or not representatives:
            return None
        best_distance = float("inf")
        best_cluster_id: int | None = None
        for item in representatives:
            point = np.asarray(item.get("point") or [], dtype=float)
            if point.shape != scaled.shape:
                continue
            distance = float(np.linalg.norm(point - scaled))
            if distance < best_distance:
                best_distance = distance
                best_cluster_id = int(item.get("cluster_id"))
        if best_distance > eps:
            return None
        return best_cluster_id

    def _collect_training_samples(self) -> list[dict[str, Any]]:
        samples: list[dict[str, Any]] = []
        profiles = list(self.db.scalars(select(UserProfile)))
        for profile in profiles:
            samples.append(
                {
                    "profile": model_to_dict(profile),
                    "fitness_test": model_to_dict(self._latest(FitnessTest, profile.user_id, FitnessTest.measured_at)),
                    "body_composition": model_to_dict(
                        self._latest(BodyComposition, profile.user_id, BodyComposition.measured_at)
                    ),
                    "biochemical_index": model_to_dict(
                        self._latest(BiochemicalIndex, profile.user_id, BiochemicalIndex.measured_at)
                    ),
                }
            )
        return samples

    def _collect_bootstrap_anchor_samples(self, target_size: int) -> list[dict[str, Any]]:
        confirmed_rules = list(
            self.db.scalars(
                select(RiskRuleConfig)
                .where(
                    RiskRuleConfig.is_active.is_(True),
                    RiskRuleConfig.review_status == "EXPERT_CONFIRMED",
                )
                .order_by(RiskRuleConfig.priority.asc(), RiskRuleConfig.id.asc())
            )
        )
        prototypes = self._bootstrap_prototypes_from_rules(confirmed_rules)
        if not prototypes:
            prototypes = self._default_bootstrap_prototypes()
        samples: list[dict[str, Any]] = []
        per_prototype = max(10, target_size // len(prototypes) + 1)
        for prototype in prototypes:
            for index in range(per_prototype):
                samples.append(self._jitter_bootstrap_sample(prototype, index))
                if len(samples) >= target_size:
                    return samples
        return samples

    def _bootstrap_prototypes_from_rules(self, rules: list[RiskRuleConfig]) -> list[dict[str, Any]]:
        prototypes: dict[str, dict[str, Any]] = {"good": self._default_bootstrap_prototypes()[0]}
        for rule in rules:
            text = f"{rule.code} {rule.name} {rule.message} {rule.condition}".lower()
            condition_path = str((rule.condition or {}).get("path") or "").lower()
            if any(token in text or token in condition_path for token in ["bmi", "waist", "fbg", "tg", "hdl", "ldl", "糖", "脂", "肥胖"]):
                prototypes["metabolic"] = self._prototype(
                    age=54,
                    bmi=30.2,
                    waist_cm=101,
                    sedentary_hours=9,
                    resting_hr=82,
                    sbp=136,
                    dbp=86,
                    pain_score=1,
                    single_leg_stand=22,
                    body_fat_pct=35,
                    skeletal_muscle_kg=25,
                    visceral_fat_level=15,
                    fbg=6.8,
                    tc=5.8,
                    tg=2.2,
                    hdl_c=0.9,
                    ldl_c=3.7,
                )
            if any(token in text or token in condition_path for token in ["sbp", "dbp", "blood_pressure", "hypertension", "血压"]):
                prototypes["blood_pressure"] = self._prototype(
                    age=60,
                    bmi=25.2,
                    waist_cm=86,
                    sedentary_hours=8,
                    resting_hr=88,
                    sbp=150,
                    dbp=95,
                    pain_score=2,
                    single_leg_stand=16,
                    body_fat_pct=27,
                    skeletal_muscle_kg=26,
                    visceral_fat_level=10,
                    fbg=5.8,
                    tc=5.0,
                    tg=1.5,
                    hdl_c=1.1,
                    ldl_c=3.0,
                )
            if any(token in text or token in condition_path for token in ["pain", "joint", "疼痛", "关节", "功能受限"]):
                prototypes["pain_limited"] = self._prototype(
                    age=68,
                    bmi=24.4,
                    waist_cm=82,
                    sedentary_hours=7,
                    resting_hr=78,
                    sbp=132,
                    dbp=82,
                    pain_score=6,
                    single_leg_stand=8,
                    body_fat_pct=25,
                    skeletal_muscle_kg=21,
                    visceral_fat_level=9,
                    fbg=5.5,
                    tc=4.8,
                    tg=1.3,
                    hdl_c=1.2,
                    ldl_c=2.8,
                )
            if any(token in text or token in condition_path for token in ["single_leg", "balance", "muscle", "体能", "平衡", "肌力", "老年"]):
                prototypes["low_fitness"] = self._prototype(
                    age=66,
                    bmi=23.8,
                    waist_cm=80,
                    sedentary_hours=8,
                    resting_hr=80,
                    sbp=130,
                    dbp=80,
                    pain_score=2,
                    single_leg_stand=6,
                    body_fat_pct=24,
                    skeletal_muscle_kg=20,
                    visceral_fat_level=8,
                    fbg=5.3,
                    tc=4.7,
                    tg=1.2,
                    hdl_c=1.2,
                    ldl_c=2.7,
                )
        return list(prototypes.values())

    def _default_bootstrap_prototypes(self) -> list[dict[str, Any]]:
        return [
            self._prototype(
                age=32,
                bmi=22,
                waist_cm=76,
                sedentary_hours=3,
                resting_hr=64,
                sbp=116,
                dbp=74,
                pain_score=0,
                single_leg_stand=58,
                body_fat_pct=18,
                skeletal_muscle_kg=32,
                visceral_fat_level=6,
                fbg=5.0,
                tc=4.2,
                tg=0.9,
                hdl_c=1.5,
                ldl_c=2.2,
            )
        ]

    def _prototype(
        self,
        *,
        age: float,
        bmi: float,
        waist_cm: float,
        sedentary_hours: float,
        resting_hr: float,
        sbp: float,
        dbp: float,
        pain_score: float,
        single_leg_stand: float,
        body_fat_pct: float,
        skeletal_muscle_kg: float,
        visceral_fat_level: float,
        fbg: float,
        tc: float,
        tg: float,
        hdl_c: float,
        ldl_c: float,
    ) -> dict[str, Any]:
        return {
            "profile": {
                "age": age,
                "bmi": bmi,
                "waist_cm": waist_cm,
                "sedentary_hours": sedentary_hours,
            },
            "fitness_test": {
                "resting_hr": resting_hr,
                "sbp": sbp,
                "dbp": dbp,
                "pain_score": pain_score,
                "single_leg_stand": single_leg_stand,
            },
            "body_composition": {
                "body_fat_pct": body_fat_pct,
                "skeletal_muscle_kg": skeletal_muscle_kg,
                "visceral_fat_level": visceral_fat_level,
            },
            "biochemical_index": {
                "fbg": fbg,
                "tc": tc,
                "tg": tg,
                "hdl_c": hdl_c,
                "ldl_c": ldl_c,
            },
        }

    def _jitter_bootstrap_sample(self, prototype: dict[str, Any], index: int) -> dict[str, Any]:
        sample = {section: dict(values) for section, values in prototype.items()}
        small = (index % 4) * 0.2
        sample["profile"]["age"] += index % 3
        sample["profile"]["bmi"] += small
        sample["profile"]["waist_cm"] += index % 5
        sample["fitness_test"]["resting_hr"] += index % 3
        sample["fitness_test"]["sbp"] += index % 4
        sample["fitness_test"]["dbp"] += index % 3
        sample["fitness_test"]["single_leg_stand"] += index % 2
        sample["body_composition"]["body_fat_pct"] += (index % 3) * 0.3
        sample["body_composition"]["visceral_fat_level"] += index % 2
        sample["biochemical_index"]["fbg"] += (index % 3) * 0.05
        sample["biochemical_index"]["tg"] += (index % 3) * 0.04
        return sample

    def _latest(self, model, user_id: int, order_column):
        return self.db.scalar(select(model).where(model.user_id == user_id).order_by(order_column.desc()).limit(1))
