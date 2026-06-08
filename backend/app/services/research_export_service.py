import csv
import hashlib
import json
from datetime import timedelta
from io import BytesIO, StringIO
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.cluster import UserClusterAssignment
from app.models.health_data import (
    BiochemicalIndex,
    BodyComposition,
    ExerciseFeedback,
    FitnessTest,
    RiskScreening,
    UserProfile,
    UserProfileMeasurement,
)
from app.models.prescription import PrescriptionRecord
from app.models.research import ResearchExportRequest
from app.models.template import PrescriptionTemplate
from app.models.user import User, utcnow
from app.services.audit_service import AuditService

CSV_MEDIA_TYPE = "text/csv; charset=utf-8"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
JSON_MEDIA_TYPE = "application/json; charset=utf-8"

EXPORT_COLUMNS = [
    "participant_code",
    "age_band",
    "sex",
    "height_cm",
    "weight_kg",
    "bmi",
    "waist_cm",
    "hip_cm",
    "whr",
    "resting_hr",
    "blood_pressure",
    "spo2",
    "blood_glucose",
    "blood_lipids",
    "uric_acid",
    "liver_kidney_summary",
    "chronic_risks",
    "medication",
    "cardiorespiratory_capacity",
    "muscle_strength",
    "flexibility",
    "balance",
    "pain_score",
    "risk_level",
    "prescription_goals",
    "frequency",
    "intensity",
    "time",
    "type",
    "progression",
    "completion_rate",
    "rpe",
    "pain_change",
    "adverse_events",
    "adjustment_count",
    "stage_weight_bmi_waist_bp_change",
    "adherence_trend",
]


class ResearchExportService:
    def __init__(self, db: Session):
        self.db = db

    def export_users(self, requester: User) -> dict[str, Any]:
        organization_id = self._organization_scope_for(requester)
        profiles = self._profiles_for_scope(organization_id)
        items = [self._row(profile) for profile in profiles]
        AuditService(self.db).record(
            action="RESEARCH_EXPORT_PREVIEWED",
            resource_type="ResearchExportPreview",
            actor_id=requester.id,
            metadata={
                "row_count": len(items),
                "role": requester.role.value,
                "organization_id": organization_id,
                "scope": "organization" if organization_id is not None else "global",
                "desensitized": True,
                "fields": [
                    "research_subject_id",
                    "age_band",
                    "profile",
                    "fitness_test",
                    "risk_screening",
                    "latest_prescription",
                ],
            },
        )
        self.db.commit()
        return {"items": items, "total": len(items)}

    def create_request(self, requester: User, export_format: str, purpose: str) -> ResearchExportRequest:
        organization_id = self._organization_scope_for(requester)
        rows = self.export_rows(organization_id=organization_id)
        request = ResearchExportRequest(
            requested_by=requester.id,
            organization_id=organization_id,
            format=export_format,
            purpose=purpose,
            status="PENDING",
            row_count=len(rows),
        )
        self.db.add(request)
        self.db.flush()
        AuditService(self.db).record(
            action="RESEARCH_EXPORT_REQUESTED",
            resource_type="ResearchExportRequest",
            actor_id=requester.id,
            resource_id=str(request.id),
            metadata={"format": export_format, "row_count": len(rows)},
        )
        self.db.commit()
        self.db.refresh(request)
        return request

    def approve_request(self, request_id: int, approver: User, approval_comment: str) -> ResearchExportRequest:
        request = self._request(request_id)
        if request.status != "PENDING":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Export request is not pending")
        if approver.role.value == "ORG_ADMIN" and (
            approver.organization_id is None or request.organization_id != approver.organization_id
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot approve another organization export")
        rows = self.export_rows(organization_id=request.organization_id)
        request.status = "APPROVED"
        request.approved_by = approver.id
        request.approval_comment = approval_comment
        request.expires_at = utcnow() + timedelta(hours=24)
        request.snapshot_json = rows
        request.row_count = len(rows)
        AuditService(self.db).record(
            action="RESEARCH_EXPORT_APPROVED",
            resource_type="ResearchExportRequest",
            actor_id=approver.id,
            resource_id=str(request.id),
            metadata={"format": request.format, "row_count": request.row_count},
        )
        self.db.commit()
        self.db.refresh(request)
        return request

    def reject_request(self, request_id: int, reviewer: User, approval_comment: str) -> ResearchExportRequest:
        request = self._request(request_id)
        if request.status != "PENDING":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Export request is not pending")
        if reviewer.role.value == "ORG_ADMIN" and (
            reviewer.organization_id is None or request.organization_id != reviewer.organization_id
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot reject another organization export")
        request.status = "REJECTED"
        request.approved_by = reviewer.id
        request.approval_comment = approval_comment
        request.expires_at = None
        request.snapshot_json = None
        AuditService(self.db).record(
            action="RESEARCH_EXPORT_REJECTED",
            resource_type="ResearchExportRequest",
            actor_id=reviewer.id,
            resource_id=str(request.id),
            metadata={"format": request.format, "row_count": request.row_count},
        )
        self.db.commit()
        self.db.refresh(request)
        return request

    def list_requests(self, requester: User) -> list[ResearchExportRequest]:
        statement = select(ResearchExportRequest).order_by(
            ResearchExportRequest.created_at.desc(), ResearchExportRequest.id.desc()
        )
        role = requester.role.value
        if role == "RESEARCHER":
            organization_id = self._organization_scope_for(requester)
            statement = statement.where(
                ResearchExportRequest.requested_by == requester.id,
                ResearchExportRequest.organization_id == organization_id,
            )
        elif role == "ORG_ADMIN":
            organization_id = self._organization_scope_for(requester)
            statement = statement.where(ResearchExportRequest.organization_id == organization_id)
        return list(self.db.scalars(statement))

    def build_download(self, request_id: int, requester: User) -> tuple[str, str, bytes]:
        request = self._request(request_id)
        self._ensure_download_allowed(request, requester)
        rows = request.snapshot_json or []
        if request.format == "xlsx":
            media_type = XLSX_MEDIA_TYPE
            filename = f"research-export-{request.id}.xlsx"
            content = self._xlsx_bytes(rows)
        elif request.format == "json":
            media_type = JSON_MEDIA_TYPE
            filename = f"research-export-{request.id}.json"
            content = json.dumps({"rows": rows, "total": len(rows)}, ensure_ascii=False).encode("utf-8")
        else:
            media_type = CSV_MEDIA_TYPE
            filename = f"research-export-{request.id}.csv"
            content = self._csv_bytes(rows)
        request.downloaded_at = utcnow()
        request.row_count = len(rows)
        AuditService(self.db).record(
            action="RESEARCH_EXPORT_DOWNLOADED",
            resource_type="ResearchExportRequest",
            actor_id=requester.id,
            resource_id=str(request.id),
            metadata={"format": request.format, "row_count": len(rows)},
        )
        self.db.commit()
        return filename, media_type, content

    def export_rows(self, organization_id: int | None = None) -> list[dict[str, Any]]:
        profiles = self._profiles_for_scope(organization_id)
        return [self._flat_row(profile) for profile in profiles]

    def _profiles_for_scope(self, organization_id: int | None = None) -> list[UserProfile]:
        statement = select(UserProfile).join(User, User.id == UserProfile.user_id).order_by(UserProfile.user_id.asc())
        if organization_id is not None:
            statement = statement.where(User.organization_id == organization_id)
        return list(self.db.scalars(statement))

    def summary(self, requester: User) -> dict[str, Any]:
        organization_id = self._organization_scope_for(requester)
        feedback_count = self.db.scalar(
            self._scoped_user_model_select(
                select(func.count(ExerciseFeedback.id)),
                ExerciseFeedback,
                organization_id,
            )
        ) or 0
        avg_completion = self.db.scalar(
            self._scoped_user_model_select(
                select(func.avg(ExerciseFeedback.completion_rate)),
                ExerciseFeedback,
                organization_id,
            )
        ) or 0
        avg_rpe = self.db.scalar(
            self._scoped_user_model_select(select(func.avg(ExerciseFeedback.rpe)), ExerciseFeedback, organization_id)
        ) or 0
        discomfort_event_count = (
            len(
                [
                    item
                    for item in self.db.scalars(
                        self._scoped_user_model_select(
                            select(ExerciseFeedback.discomfort),
                            ExerciseFeedback,
                            organization_id,
                        )
                    ).all()
                    if item
                ]
            )
            if feedback_count
            else 0
        )
        pain_worsened_count = (
            self.db.scalar(
                self._scoped_user_model_select(
                    select(func.count(ExerciseFeedback.id)),
                    ExerciseFeedback,
                    organization_id,
                ).where(ExerciseFeedback.pain_score_after >= 4)
            )
            or 0
        )
        profiles = self._profiles_for_scope(organization_id)
        return {
            "total_participants": len(profiles),
            "risk_distribution": self._distribution(RiskScreening, RiskScreening.risk_level, organization_id),
            "cluster_distribution": self._latest_cluster_distribution(organization_id),
            "cluster_risk_overlay": self._cluster_risk_overlay(profiles, organization_id),
            "prescription_status": self._distribution(PrescriptionRecord, PrescriptionRecord.status, organization_id),
            "template_effects": self._template_effects(profiles),
            "export_job_status": self._export_job_status(organization_id),
            "intervention_effects": {
                "feedback_count": feedback_count,
                "average_completion_rate": round(float(avg_completion), 2),
                "average_rpe": round(float(avg_rpe), 2),
                "discomfort_event_count": discomfort_event_count,
                "pain_worsened_count": pain_worsened_count,
                "completion_rate_trend": self._feedback_value_trend(ExerciseFeedback.completion_rate, organization_id),
                "rpe_trend": self._feedback_value_trend(ExerciseFeedback.rpe, organization_id),
                "pain_trend": self._feedback_value_trend(ExerciseFeedback.pain_score_after, organization_id),
                "blood_pressure_trend": self._blood_pressure_trend(organization_id),
                "blood_glucose_trend": self._blood_glucose_trend(organization_id),
            },
        }

    def _distribution(self, model, column, organization_id: int | None) -> dict[str, int]:
        rows = self.db.execute(
            self._scoped_user_model_select(
                select(column, func.count()).where(column.is_not(None)).group_by(column),
                model,
                organization_id,
            )
        ).all()
        return {str(key): int(count) for key, count in rows if key}

    def _latest_cluster_distribution(self, organization_id: int | None) -> dict[str, int]:
        assignments = self.db.scalars(
            self._scoped_user_model_select(
                select(UserClusterAssignment).order_by(
                    UserClusterAssignment.user_id.asc(),
                    UserClusterAssignment.created_at.desc(),
                    UserClusterAssignment.id.desc(),
                ),
                UserClusterAssignment,
                organization_id,
            )
        ).all()
        latest_by_user: dict[int, UserClusterAssignment] = {}
        for assignment in assignments:
            latest_by_user.setdefault(assignment.user_id, assignment)
        distribution: dict[str, int] = {}
        for assignment in latest_by_user.values():
            label = assignment.cluster_label or "未分型"
            distribution[label] = distribution.get(label, 0) + 1
        return distribution

    def _latest_cluster_by_user(self, organization_id: int | None) -> dict[int, UserClusterAssignment]:
        assignments = self.db.scalars(
            self._scoped_user_model_select(
                select(UserClusterAssignment).order_by(
                    UserClusterAssignment.user_id.asc(),
                    UserClusterAssignment.created_at.desc(),
                    UserClusterAssignment.id.desc(),
                ),
                UserClusterAssignment,
                organization_id,
            )
        ).all()
        latest_by_user: dict[int, UserClusterAssignment] = {}
        for assignment in assignments:
            latest_by_user.setdefault(assignment.user_id, assignment)
        return latest_by_user

    def _cluster_risk_overlay(self, profiles: list[UserProfile], organization_id: int | None) -> dict[str, dict[str, int]]:
        latest_clusters = self._latest_cluster_by_user(organization_id)
        overlay: dict[str, dict[str, int]] = {}
        for profile in profiles:
            prescription = self._prescription_record(profile.user_id)
            risk = self._risk_record(profile.user_id)
            cluster = (
                (latest_clusters.get(profile.user_id).cluster_label if latest_clusters.get(profile.user_id) else None)
                or (prescription.cluster_label if prescription else None)
                or "未分型"
            )
            risk_level = (risk.risk_level if risk else None) or (prescription.risk_level if prescription else None) or "未判定"
            overlay.setdefault(cluster, {})[risk_level] = overlay.setdefault(cluster, {}).get(risk_level, 0) + 1
        return overlay

    def _template_effects(self, profiles: list[UserProfile]) -> dict[str, float]:
        grouped: dict[str, list[float]] = {}
        template_cache: dict[int, str] = {}
        for profile in profiles:
            prescription = self._prescription_record(profile.user_id)
            if prescription is None:
                continue
            feedback_items = self._feedback(profile.user_id)
            if not feedback_items:
                continue
            label = self._prescription_template_label(prescription, template_cache)
            if not label:
                continue
            grouped.setdefault(label, []).append(
                sum(float(item.completion_rate) for item in feedback_items) / len(feedback_items)
            )
        return {label: round(sum(values) / len(values), 2) for label, values in grouped.items() if values}

    def _prescription_template_label(self, prescription: PrescriptionRecord, template_cache: dict[int, str]) -> str:
        if prescription.template_id is not None:
            if prescription.template_id not in template_cache:
                template = self.db.get(PrescriptionTemplate, prescription.template_id)
                template_cache[prescription.template_id] = template.name if template else f"模板 #{prescription.template_id}"
            return template_cache[prescription.template_id]
        fitt = prescription.fitt_vp or {}
        action_types = fitt.get("type")
        if isinstance(action_types, list) and action_types:
            return str(action_types[0])
        if isinstance(action_types, str) and action_types.strip():
            return action_types.strip()
        if prescription.goals:
            return str(prescription.goals[0])
        return prescription.cluster_label or "未命名模板"

    def _export_job_status(self, organization_id: int | None) -> dict[str, int]:
        statement = select(ResearchExportRequest.status, func.count()).where(ResearchExportRequest.status.is_not(None))
        if organization_id is not None:
            statement = statement.where(ResearchExportRequest.organization_id == organization_id)
        rows = self.db.execute(statement.group_by(ResearchExportRequest.status)).all()
        return {str(status): int(count) for status, count in rows if status}

    def _feedback_value_trend(self, column, organization_id: int | None) -> list[dict[str, float | str]]:
        rows = self.db.execute(
            self._scoped_user_model_select(
                select(ExerciseFeedback.exercise_date, func.avg(column))
                .where(column.is_not(None))
                .group_by(ExerciseFeedback.exercise_date)
                .order_by(ExerciseFeedback.exercise_date.asc()),
                ExerciseFeedback,
                organization_id,
            )
        ).all()
        return [{"date": str(day), "value": round(float(value), 2)} for day, value in rows if day is not None and value is not None]

    def _blood_pressure_trend(self, organization_id: int | None) -> list[dict[str, float | str]]:
        rows = self.db.execute(
            self._scoped_user_model_select(
                select(func.date(FitnessTest.measured_at), func.avg(FitnessTest.sbp), func.avg(FitnessTest.dbp))
                .where(FitnessTest.sbp.is_not(None), FitnessTest.dbp.is_not(None))
                .group_by(func.date(FitnessTest.measured_at))
                .order_by(func.date(FitnessTest.measured_at).asc()),
                FitnessTest,
                organization_id,
            )
        ).all()
        return [
            {"date": str(day), "sbp": round(float(sbp), 2), "dbp": round(float(dbp), 2)}
            for day, sbp, dbp in rows
            if day is not None and sbp is not None and dbp is not None
        ]

    def _blood_glucose_trend(self, organization_id: int | None) -> list[dict[str, float | str]]:
        rows = self.db.execute(
            self._scoped_user_model_select(
                select(func.date(BiochemicalIndex.measured_at), func.avg(BiochemicalIndex.fbg))
                .where(BiochemicalIndex.fbg.is_not(None))
                .group_by(func.date(BiochemicalIndex.measured_at))
                .order_by(func.date(BiochemicalIndex.measured_at).asc()),
                BiochemicalIndex,
                organization_id,
            )
        ).all()
        return [{"date": str(day), "value": round(float(value), 2)} for day, value in rows if day is not None and value is not None]

    def _row(self, profile: UserProfile) -> dict[str, Any]:
        return {
            "research_subject_id": self._research_subject_id(profile.user_id),
            "age_band": self._age_band(profile.age),
            "participant_code": self._participant_code(profile.user_id),
            "profile": {
                "sex": profile.sex,
                "height_cm": profile.height_cm,
                "weight_kg": profile.weight_kg,
                "bmi": profile.bmi,
                "waist_cm": profile.waist_cm,
                "whr": profile.whr,
                "exercise_goal": profile.exercise_goal,
                "exercise_habit": profile.exercise_habit,
                "exercise_experience": profile.exercise_experience,
            },
            "fitness_test": self._fitness(profile.user_id),
            "risk_screening": self._risk(profile.user_id),
            "latest_prescription": self._prescription(profile.user_id),
        }

    def _flat_row(self, profile: UserProfile) -> dict[str, Any]:
        fitness = self._fitness_record(profile.user_id)
        risk = self._risk_record(profile.user_id)
        biochemical = self._biochemical(profile.user_id)
        prescription = self._prescription_record(profile.user_id)
        feedback_items = self._feedback(profile.user_id)
        body = self._body(profile.user_id)
        fitt = prescription.fitt_vp if prescription and prescription.fitt_vp else {}
        latest_feedback = feedback_items[0] if feedback_items else None
        avg_completion = (
            round(sum(item.completion_rate for item in feedback_items) / len(feedback_items), 2)
            if feedback_items
            else None
        )
        avg_rpe = round(sum(item.rpe for item in feedback_items) / len(feedback_items), 2) if feedback_items else None
        adverse_events = sum(1 for item in feedback_items if item.discomfort)
        return {
            "participant_code": self._participant_code(profile.user_id),
            "age_band": self._age_band(profile.age),
            "sex": profile.sex,
            "height_cm": profile.height_cm,
            "weight_kg": profile.weight_kg,
            "bmi": profile.bmi,
            "waist_cm": profile.waist_cm,
            "hip_cm": profile.hip_cm,
            "whr": profile.whr,
            "resting_hr": fitness.resting_hr if fitness else None,
            "blood_pressure": f"{fitness.sbp}/{fitness.dbp}" if fitness else None,
            "spo2": biochemical.spo2 if biochemical else None,
            "blood_glucose": self._glucose_text(biochemical),
            "blood_lipids": self._lipid_text(biochemical),
            "uric_acid": biochemical.uric_acid if biochemical else None,
            "liver_kidney_summary": self._liver_kidney_text(biochemical),
            "chronic_risks": self._chronic_risk_text(risk),
            "medication": "、".join(risk.medication or []) if risk else "",
            "cardiorespiratory_capacity": fitness.six_mwt or fitness.step_test_index if fitness else None,
            "muscle_strength": self._muscle_text(fitness, body),
            "flexibility": fitness.sit_reach if fitness else None,
            "balance": fitness.single_leg_stand if fitness else None,
            "pain_score": fitness.pain_score if fitness else None,
            "risk_level": prescription.risk_level if prescription else (risk.risk_level if risk else None),
            "prescription_goals": "、".join(prescription.goals or []) if prescription else "",
            "frequency": fitt.get("frequency"),
            "intensity": fitt.get("intensity"),
            "time": fitt.get("time"),
            "type": "、".join(fitt.get("type", [])) if isinstance(fitt.get("type"), list) else fitt.get("type"),
            "progression": fitt.get("progression"),
            "completion_rate": avg_completion,
            "rpe": avg_rpe,
            "pain_change": latest_feedback.pain_score_after if latest_feedback else None,
            "adverse_events": adverse_events,
            "adjustment_count": self._adjustment_count(profile.user_id),
            "stage_weight_bmi_waist_bp_change": json.dumps(
                self._stage_change(profile.user_id),
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            "adherence_trend": self._adherence_trend(feedback_items),
        }

    def _fitness(self, user_id: int) -> dict[str, Any] | None:
        record = self._fitness_record(user_id)
        if record is None:
            return None
        return {
            "resting_hr": record.resting_hr,
            "sbp": record.sbp,
            "dbp": record.dbp,
            "vital_capacity": record.vital_capacity,
            "grip_left": record.grip_left,
            "grip_right": record.grip_right,
            "sit_reach": record.sit_reach,
            "single_leg_stand": record.single_leg_stand,
            "pain_score": record.pain_score,
            "measured_at": record.measured_at.isoformat(),
        }

    def _risk(self, user_id: int) -> dict[str, Any] | None:
        record = self._risk_record(user_id)
        if record is None:
            return None
        return {
            "has_hypertension": record.has_hypertension,
            "has_diabetes": record.has_diabetes,
            "has_chd": record.has_chd,
            "has_joint_pain": record.has_joint_pain,
            "risk_level": record.risk_level,
            "risk_reasons": record.risk_reasons,
        }

    def _prescription(self, user_id: int) -> dict[str, Any] | None:
        record = self._prescription_record(user_id)
        if record is None:
            return None
        return {
            "risk_level": record.risk_level,
            "cluster_label": record.cluster_label,
            "goals": record.goals,
            "status": record.status,
            "version": record.version,
            "expert_review_required": record.expert_review_required,
        }

    def _participant_code(self, user_id: int) -> str:
        digest = hashlib.sha256(f"{user_id}{settings.RESEARCH_EXPORT_SALT}".encode("utf-8")).hexdigest()
        return f"R{digest[:16].upper()}"

    def _research_subject_id(self, user_id: int) -> str:
        digest = hashlib.sha256(f"subject:{user_id}{settings.RESEARCH_EXPORT_SALT}".encode("utf-8")).hexdigest()
        return f"SUB-{digest[:12].upper()}"

    def _stage_change(self, user_id: int) -> dict[str, Any]:
        return {
            "profile": self._profile_change(user_id),
            "fitness_test": self._measurement_change(
                FitnessTest,
                user_id,
                FitnessTest.measured_at,
                ["sbp", "dbp"],
                "FitnessTest 记录不足 2 条，无法计算最早与最新差值",
            ),
            "body_composition": self._measurement_change(
                BodyComposition,
                user_id,
                BodyComposition.measured_at,
                ["body_fat_pct", "skeletal_muscle_kg"],
                "BodyComposition 记录不足 2 条，无法计算最早与最新差值",
            ),
            "biochemical_index": self._measurement_change(
                BiochemicalIndex,
                user_id,
                BiochemicalIndex.measured_at,
                ["fbg", "tc", "tg", "hdl_c", "ldl_c"],
                "BiochemicalIndex 记录不足 2 条，无法计算最早与最新差值",
            ),
        }

    def _profile_change(self, user_id: int) -> dict[str, dict[str, Any]]:
        records = list(
            self.db.scalars(
                select(UserProfileMeasurement)
                .where(UserProfileMeasurement.user_id == user_id)
                .order_by(UserProfileMeasurement.measured_at.asc(), UserProfileMeasurement.id.asc())
            )
        )
        reason = "UserProfileMeasurement 记录不足 2 条，无法计算最早与最新差值"
        return self._delta_map(records, ["weight_kg", "bmi", "waist_cm"], reason)

    def _measurement_change(self, model, user_id: int, order_column, fields: list[str], null_reason: str) -> dict[str, dict[str, Any]]:
        records = list(
            self.db.scalars(
                select(model).where(model.user_id == user_id).order_by(order_column.asc(), model.id.asc())
            )
        )
        return self._delta_map(records, fields, null_reason)

    def _delta_map(self, records: list[Any], fields: list[str], null_reason: str) -> dict[str, dict[str, Any]]:
        if len(records) < 2:
            return {field: {"value": None, "null_reason": null_reason} for field in fields}
        earliest = records[0]
        latest = records[-1]
        result: dict[str, dict[str, Any]] = {}
        for field in fields:
            before = getattr(earliest, field, None)
            after = getattr(latest, field, None)
            if before is None or after is None:
                result[field] = {
                    "value": None,
                    "null_reason": f"{field} 最早或最新记录为空，无法计算差值",
                }
            else:
                result[field] = {
                    "before": before,
                    "after": after,
                    "delta": round(float(after) - float(before), 4),
                }
        return result

    def _request(self, request_id: int) -> ResearchExportRequest:
        request = self.db.get(ResearchExportRequest, request_id)
        if request is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export request not found")
        return request

    def _ensure_download_allowed(self, request: ResearchExportRequest, requester: User) -> None:
        role = requester.role.value
        if role == "RESEARCHER":
            organization_id = self._organization_scope_for(requester)
            if request.requested_by != requester.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot download another request")
            if request.organization_id != organization_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot download another organization export")
        if role == "ORG_ADMIN":
            organization_id = self._organization_scope_for(requester)
            if request.organization_id != organization_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot download another organization export")
        if request.status != "APPROVED":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Export request is not approved")
        if request.expires_at is None or request.expires_at < utcnow():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Export download expired")

    def _organization_scope_for(self, requester: User) -> int | None:
        role = requester.role.value
        if role == "ADMIN":
            return None
        if role in {"RESEARCHER", "ORG_ADMIN"}:
            if requester.organization_id is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research export requires organization scope")
            return requester.organization_id
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Research export role is not allowed")

    def _scoped_user_model_select(self, statement, model, organization_id: int | None):
        if organization_id is None:
            return statement
        return statement.join(User, User.id == model.user_id).where(User.organization_id == organization_id)

    def _fitness_record(self, user_id: int) -> FitnessTest | None:
        return self.db.scalar(
            select(FitnessTest).where(FitnessTest.user_id == user_id).order_by(FitnessTest.measured_at.desc()).limit(1)
        )

    def _risk_record(self, user_id: int) -> RiskScreening | None:
        return self.db.scalar(
            select(RiskScreening)
            .where(RiskScreening.user_id == user_id)
            .order_by(RiskScreening.created_at.desc())
            .limit(1)
        )

    def _biochemical(self, user_id: int) -> BiochemicalIndex | None:
        return self.db.scalar(
            select(BiochemicalIndex)
            .where(BiochemicalIndex.user_id == user_id)
            .order_by(BiochemicalIndex.measured_at.desc())
            .limit(1)
        )

    def _body(self, user_id: int) -> BodyComposition | None:
        return self.db.scalar(
            select(BodyComposition)
            .where(BodyComposition.user_id == user_id)
            .order_by(BodyComposition.measured_at.desc())
            .limit(1)
        )

    def _prescription_record(self, user_id: int) -> PrescriptionRecord | None:
        return self.db.scalar(
            select(PrescriptionRecord)
            .where(PrescriptionRecord.user_id == user_id)
            .order_by(PrescriptionRecord.created_at.desc(), PrescriptionRecord.id.desc())
            .limit(1)
        )

    def _feedback(self, user_id: int) -> list[ExerciseFeedback]:
        return list(
            self.db.scalars(
                select(ExerciseFeedback)
                .where(ExerciseFeedback.user_id == user_id)
                .order_by(ExerciseFeedback.exercise_date.desc(), ExerciseFeedback.id.desc())
            )
        )

    def _adjustment_count(self, user_id: int) -> int:
        from app.models.prescription import PrescriptionVersion

        return (
            self.db.scalar(
                select(func.count(PrescriptionVersion.id))
                .join(PrescriptionRecord, PrescriptionRecord.id == PrescriptionVersion.prescription_id)
                .where(PrescriptionRecord.user_id == user_id, PrescriptionVersion.change_reason != "INITIAL_GENERATION")
            )
            or 0
        )

    def _age_band(self, age: int | None) -> str:
        if age is None:
            return "未知"
        decade = max(0, age // 10 * 10)
        return f"{decade}-{decade + 9}"

    def _glucose_text(self, biochemical: BiochemicalIndex | None) -> str:
        if biochemical is None:
            return ""
        return f"FBG {biochemical.fbg or '-'}; 2h {biochemical.pbg_2h or '-'}; HbA1c {biochemical.hba1c or '-'}"

    def _lipid_text(self, biochemical: BiochemicalIndex | None) -> str:
        if biochemical is None:
            return ""
        return f"TC {biochemical.tc or '-'}; TG {biochemical.tg or '-'}; HDL {biochemical.hdl_c or '-'}; LDL {biochemical.ldl_c or '-'}"

    def _liver_kidney_text(self, biochemical: BiochemicalIndex | None) -> str:
        if biochemical is None:
            return ""
        return f"ALT {biochemical.alt or '-'}; AST {biochemical.ast or '-'}; Cr {biochemical.creatinine or '-'}"

    def _chronic_risk_text(self, risk: RiskScreening | None) -> str:
        if risk is None:
            return ""
        items = [
            ("高血压", risk.has_hypertension),
            ("糖尿病", risk.has_diabetes),
            ("冠心病", risk.has_chd),
            ("卒中", risk.has_stroke),
            ("慢性肾病", risk.has_ckd),
            ("呼吸系统疾病", risk.has_respiratory_disease),
            ("关节疼痛", risk.has_joint_pain),
        ]
        return "、".join(label for label, enabled in items if enabled)

    def _muscle_text(self, fitness: FitnessTest | None, body: BodyComposition | None) -> str:
        parts: list[str] = []
        if fitness:
            parts.extend([f"左握力 {fitness.grip_left}" if fitness.grip_left is not None else "", f"右握力 {fitness.grip_right}" if fitness.grip_right is not None else ""])
        if body and body.skeletal_muscle_kg is not None:
            parts.append(f"骨骼肌 {body.skeletal_muscle_kg}")
        return "；".join(part for part in parts if part)

    def _adherence_trend(self, feedback_items: list[ExerciseFeedback]) -> str:
        if not feedback_items:
            return ""
        return " -> ".join(str(round(item.completion_rate, 1)) for item in reversed(feedback_items[:6]))

    def _csv_bytes(self, rows: list[dict[str, Any]]) -> bytes:
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=EXPORT_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        return output.getvalue().encode("utf-8-sig")

    def _xlsx_bytes(self, rows: list[dict[str, Any]]) -> bytes:
        sheet_rows = [EXPORT_COLUMNS, *[[row.get(column, "") for column in EXPORT_COLUMNS] for row in rows]]
        shared = ""
        sheet_data = []
        for row_index, values in enumerate(sheet_rows, start=1):
            cells = []
            for col_index, value in enumerate(values, start=1):
                ref = f"{self._excel_col(col_index)}{row_index}"
                text = self._xml_escape("" if value is None else str(value))
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>')
            sheet_data.append(f'<row r="{row_index}">{"".join(cells)}</row>')
        worksheet = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f"<sheetData>{''.join(sheet_data)}</sheetData></worksheet>"
        )
        workbook = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="research_export" sheetId="1" r:id="rId1"/></sheets></workbook>'
        )
        rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        )
        workbook_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>"
        )
        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", content_types)
            archive.writestr("_rels/.rels", rels)
            archive.writestr("xl/workbook.xml", workbook)
            archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
            archive.writestr("xl/worksheets/sheet1.xml", worksheet)
        return buffer.getvalue()

    def _excel_col(self, index: int) -> str:
        result = ""
        while index:
            index, remainder = divmod(index - 1, 26)
            result = chr(65 + remainder) + result
        return result

    def _xml_escape(self, value: str) -> str:
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
