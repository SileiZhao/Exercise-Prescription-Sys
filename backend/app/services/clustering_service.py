from dataclasses import dataclass
from typing import Any

from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
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

    def train(self, samples: list[dict[str, Any]], n_clusters: int, name: str = "KMeans 人群分型模型") -> TrainedClusterModel:
        feature_names: list[str] = []
        matrix: list[list[float]] = []
        for sample in samples:
            feature_names, values = self.feature_builder.build(sample)
            matrix.append(values)

        scaler = StandardScaler()
        scaled = scaler.fit_transform(matrix)
        model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = model.fit_predict(scaled)

        profiles: list[ClusterProfile] = []
        for cluster_id in range(n_clusters):
            indexes = [index for index, label in enumerate(labels) if label == cluster_id]
            raw_center = [
                sum(matrix[index][feature_index] for index in indexes) / len(indexes)
                for feature_index in range(len(feature_names))
            ]
            center = {name: round(raw_center[index], 2) for index, name in enumerate(feature_names)}
            suggested = self._suggest_labels(center)
            profiles.append(
                ClusterProfile(
                    cluster_id=cluster_id,
                    size=len(indexes),
                    center=center,
                    suggested_labels=suggested,
                    explanation=f"该类样本主要表现为{'、'.join(suggested)}。",
                )
            )

        metrics: dict[str, float] = {}
        if len(samples) > n_clusters:
            metrics["silhouette_score"] = round(float(silhouette_score(scaled, labels)), 4)

        return TrainedClusterModel(
            name=name,
            n_clusters=n_clusters,
            feature_names=feature_names,
            cluster_profiles=profiles,
            metrics=metrics,
        )

    def _suggest_labels(self, center: dict[str, float]) -> list[str]:
        labels: list[str] = []
        if center["bmi"] >= 28 or center["waist_cm"] >= 90 or center["visceral_fat_level"] >= 13:
            labels.append("肥胖代谢风险型")
        if center["sbp"] >= 140 or center["resting_hr"] >= 85:
            labels.append("心肺功能不足型")
        if center["skeletal_muscle_kg"] < 24:
            labels.append("肌力不足型")
        if center["single_leg_stand"] < 10 or center["age"] >= 60:
            labels.append("老年功能下降型")
        if center["pain_score"] >= 4:
            labels.append("损伤风险限制型")
        return labels or ["普通健康维持型"]


class ClusterPersistenceService:
    def __init__(self, db: Session):
        self.db = db
        self.health_service = HealthProfileService(db)
        self.rule_service = RuleBasedPhenotypeService()
        self.training_service = ClusterTrainingService()

    def train_from_database(self, name: str, n_clusters: int, created_by: int | None) -> ClusterModel:
        samples = self._collect_training_samples()
        if len(samples) < n_clusters:
            raise ValueError("可用于聚类训练的样本数不足")
        trained = self.training_service.train(samples=samples, n_clusters=n_clusters, name=name)
        record = ClusterModel(
            name=trained.name,
            algorithm=trained.algorithm,
            n_clusters=trained.n_clusters,
            feature_names=trained.feature_names,
            cluster_profiles=[profile.model_dump() for profile in trained.cluster_profiles],
            metrics=trained.metrics,
            scaler_params={},
            model_params={},
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
            matched_profile = self._match_profile(active_model.cluster_profiles or [], rule_result.labels)
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

    def _latest(self, model, user_id: int, order_column):
        return self.db.scalar(select(model).where(model.user_id == user_id).order_by(order_column.desc()).limit(1))
