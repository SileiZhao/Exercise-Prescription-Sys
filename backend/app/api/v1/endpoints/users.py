from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import (
    ExpertProfileCreate,
    ExpertProfileRead,
    ExpertProfileWithUser,
    OrganizationCreate,
    OrganizationRead,
    UserListResponse,
    UserRead,
    UserUpdate,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("", response_model=UserListResponse)
def list_users(
    q: str | None = Query(default=None, max_length=128),
    role: UserRole | None = None,
    organization_id: int | None = Query(default=None, ge=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    users, total = UserService(db).list_users(
        current_user,
        q=q,
        role=role,
        organization_id=organization_id,
        page=page,
        page_size=page_size,
    )
    return {"items": users, "total": total}


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    user = UserService(db).update_user(user_id, payload, actor=current_user)
    if user is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在或无权访问")
    return user


@router.get("/organizations", response_model=list[OrganizationRead])
def list_organizations(
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return UserService(db).list_organizations(current_user)


@router.post("/organizations", response_model=OrganizationRead)
def create_organization(
    payload: OrganizationCreate,
    _: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return UserService(db).create_organization(payload)


@router.post("/expert-profiles", response_model=ExpertProfileRead)
def create_expert_profile(
    payload: ExpertProfileCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return UserService(db).create_expert_profile(payload, actor_id=current_user.id)


@router.get("/expert-profiles", response_model=list[ExpertProfileWithUser])
def list_expert_profiles(
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.ORG_ADMIN)),
    db: Session = Depends(get_db),
):
    return UserService(db).list_expert_profiles(current_user)
