from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.enums import UserRole
from app.models.user import ExpertProfile, User
from app.schemas.auth import TokenResponse, UserRegister
from app.services.audit_service import AuditService


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def register(self, payload: UserRegister) -> User:
        existing = self.db.scalar(select(User).where(User.email == payload.email))
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

        if payload.phone:
            existing_phone = self.db.scalar(select(User).where(User.phone == payload.phone))
            if existing_phone is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Phone already exists"
                )

        user = User(
            email=str(payload.email),
            phone=payload.phone,
            hashed_password=get_password_hash(payload.password),
            full_name=payload.full_name,
            role=payload.role,
            organization_id=payload.organization_id,
            is_verified=payload.role in {UserRole.ADMIN, UserRole.EXPERT},
        )
        self.db.add(user)
        self.db.flush()

        if payload.role == UserRole.EXPERT:
            self.db.add(ExpertProfile(user_id=user.id))

        AuditService(self.db).record(
            action="USER_REGISTERED",
            resource_type="users",
            actor_id=user.id,
            resource_id=str(user.id),
            metadata={"role": user.role.value},
        )
        self.db.commit()
        self.db.refresh(user)
        return user

    def login(self, username: str, password: str) -> TokenResponse:
        user = self.db.scalar(select(User).where(User.email == username))
        if user is None or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")

        AuditService(self.db).record(
            action="USER_LOGIN",
            resource_type="users",
            actor_id=user.id,
            resource_id=str(user.id),
        )
        self.db.commit()
        return TokenResponse(access_token=create_access_token(str(user.id)))
