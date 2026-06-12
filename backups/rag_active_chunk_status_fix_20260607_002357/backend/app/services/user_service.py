from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.enums import UserRole
from app.models.user import ExpertProfile, Organization, User
from app.schemas.user import ExpertProfileCreate, OrganizationCreate, UserUpdate
from app.services.audit_service import AuditService


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def list_users(
        self,
        current_user: User,
        q: str | None = None,
        role: UserRole | None = None,
        organization_id: int | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[User], int]:
        query = select(User)
        if current_user.role == UserRole.ORG_ADMIN:
            query = query.where(User.organization_id == current_user.organization_id)
        elif organization_id is not None:
            query = query.where(User.organization_id == organization_id)
        if role is not None:
            query = query.where(User.role == role)
        if q:
            pattern = f"%{q.strip()}%"
            query = query.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern), User.phone.ilike(pattern)))

        total = self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        users = list(
            self.db.scalars(
                query.order_by(User.created_at.desc(), User.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )
        return users, total

    def update_user(self, user_id: int, payload: UserUpdate, actor: User) -> User | None:
        user = self.db.get(User, user_id)
        if user is None:
            return None
        if actor.role == UserRole.ORG_ADMIN and user.organization_id != actor.organization_id:
            return None
        updates = payload.model_dump(exclude_unset=True)
        if actor.role == UserRole.ORG_ADMIN:
            forbidden_fields = {"role", "organization_id"}.intersection(updates)
            if forbidden_fields:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="机构管理员无权修改用户角色或机构归属",
                )
        for key, value in updates.items():
            setattr(user, key, value)
        AuditService(self.db).record(
            action="ADMIN_UPDATE_USER",
            resource_type="User",
            actor_id=actor.id,
            resource_id=str(user.id),
            metadata={
                "role": user.role.value if hasattr(user.role, "value") else user.role,
                "organization_id": user.organization_id,
                "is_active": user.is_active,
                "is_verified": user.is_verified,
            },
        )
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_organization(self, payload: OrganizationCreate) -> Organization:
        organization = Organization(**payload.model_dump())
        self.db.add(organization)
        self.db.commit()
        self.db.refresh(organization)
        return organization

    def list_organizations(self, current_user: User) -> list[Organization]:
        query = select(Organization).order_by(Organization.created_at.desc())
        if current_user.role == UserRole.ORG_ADMIN:
            query = query.where(Organization.id == current_user.organization_id)
        return list(self.db.scalars(query))

    def create_expert_profile(self, payload: ExpertProfileCreate, actor: User) -> ExpertProfile:
        target_user = self.db.get(User, payload.user_id)
        if target_user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
        if actor.role == UserRole.ORG_ADMIN and target_user.organization_id != actor.organization_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权维护外机构专家资料")
        if target_user.role != UserRole.EXPERT:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只能为专家用户维护专家资料")
        existing = self.db.scalar(select(ExpertProfile).where(ExpertProfile.user_id == payload.user_id))
        if existing is not None:
            for key, value in payload.model_dump().items():
                setattr(existing, key, value)
            profile = existing
        else:
            profile = ExpertProfile(**payload.model_dump())
            self.db.add(profile)
        AuditService(self.db).record(
            action="UPSERT_EXPERT_PROFILE",
            resource_type="ExpertProfile",
            actor_id=actor.id,
            resource_id=str(payload.user_id),
            metadata={"specialty": payload.specialty, "capacity": payload.review_capacity_per_day},
        )
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def list_expert_profiles(self, current_user: User) -> list[ExpertProfile]:
        query = select(ExpertProfile).join(User).order_by(ExpertProfile.created_at.desc())
        if current_user.role == UserRole.ORG_ADMIN:
            query = query.where(User.organization_id == current_user.organization_id)
        return list(self.db.scalars(query).unique().all())
