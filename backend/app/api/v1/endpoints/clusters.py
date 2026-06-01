from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.cluster import (
    ClusterModelRead,
    ClusterModelStatusUpdate,
    ClusterTrainRequest,
    UserClusterAssignmentRead,
)
from app.services.clustering_service import ClusterPersistenceService

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.post("/classify/me", response_model=UserClusterAssignmentRead)
def classify_current_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ClusterPersistenceService(db).classify_user(current_user.id)


@router.post("/train", response_model=ClusterModelRead)
def train_cluster_model(
    payload: ClusterTrainRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.RESEARCHER, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    try:
        return ClusterPersistenceService(db).train_from_database(
            name=payload.name,
            n_clusters=payload.n_clusters,
            created_by=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/models", response_model=list[ClusterModelRead])
def list_cluster_models(
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.RESEARCHER, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return ClusterPersistenceService(db).list_models()


@router.patch("/models/{model_id}/status", response_model=ClusterModelRead)
def update_cluster_model_status(
    model_id: int,
    payload: ClusterModelStatusUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.RESEARCHER, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    model = ClusterPersistenceService(db).update_model_status(
        model_id=model_id,
        status=payload.status,
        actor_id=current_user.id,
        reason=payload.reason,
    )
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="聚类模型不存在")
    return model
