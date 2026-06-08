import hashlib
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.enums import UserRole
from app.models.user import RefreshToken, User, utcnow
from app.schemas.auth import ChangePasswordResponse, TokenResponse, UserRegister
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
            role=UserRole.USER,
            organization_id=None,
            is_verified=False,
        )
        self.db.add(user)
        self.db.flush()

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
        return self._token_response(user)

    def refresh(self, refresh_token: str) -> TokenResponse:
        token = self._active_refresh_token(refresh_token)
        user = self.db.get(User, token.user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        token.revoked = True
        token.revoked_at = utcnow()
        AuditService(self.db).record(
            action="AUTH_REFRESH_TOKEN_ROTATED",
            resource_type="users",
            actor_id=user.id,
            resource_id=str(user.id),
        )
        self.db.commit()
        return self._token_response(user)

    def logout(self, refresh_token: str) -> dict[str, bool]:
        token = self.db.scalar(select(RefreshToken).where(RefreshToken.token_hash == self._hash_token(refresh_token)))
        if token is not None and not token.revoked:
            token.revoked = True
            token.revoked_at = utcnow()
            AuditService(self.db).record(
                action="USER_LOGOUT",
                resource_type="users",
                actor_id=token.user_id,
                resource_id=str(token.user_id),
            )
            self.db.commit()
        return {"revoked": True}

    def change_password(self, user: User, current_password: str, new_password: str) -> ChangePasswordResponse:
        if not verify_password(current_password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
        user.hashed_password = get_password_hash(new_password)
        user.must_change_password = False
        tokens = self.db.scalars(
            select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        ).all()
        for token in tokens:
            token.revoked = True
            token.revoked_at = utcnow()
        AuditService(self.db).record(
            action="USER_CHANGE_PASSWORD",
            resource_type="users",
            actor_id=user.id,
            resource_id=str(user.id),
            metadata={"revoked_refresh_tokens": len(tokens)},
        )
        self.db.commit()
        self.db.refresh(user)
        return ChangePasswordResponse(must_change_password=user.must_change_password)

    def _token_response(self, user: User) -> TokenResponse:
        raw_refresh = secrets.token_urlsafe(48)
        token = RefreshToken(
            user_id=user.id,
            token_hash=self._hash_token(raw_refresh),
            expires_at=utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
        self.db.add(token)
        self.db.commit()
        return TokenResponse(
            access_token=create_access_token(str(user.id)),
            refresh_token=raw_refresh,
            must_change_password=bool(user.must_change_password),
        )

    def _active_refresh_token(self, refresh_token: str) -> RefreshToken:
        token = self.db.scalar(select(RefreshToken).where(RefreshToken.token_hash == self._hash_token(refresh_token)))
        if token is None or token.revoked or token.expires_at < utcnow():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        return token

    def _hash_token(self, refresh_token: str) -> str:
        return hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
