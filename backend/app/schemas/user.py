from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import OrganizationType, UserRole


class OrganizationCreate(BaseModel):
    name: str
    type: OrganizationType = OrganizationType.OTHER
    contact_person: str | None = None
    contact_phone: str | None = None
    address: str | None = None


class OrganizationRead(OrganizationCreate):
    id: int
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserRead(BaseModel):
    id: int
    email: str
    phone: str | None
    full_name: str
    role: UserRole
    organization_id: int | None
    is_active: bool
    is_verified: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    role: UserRole | None = None
    organization_id: int | None = None
    is_active: bool | None = None
    is_verified: bool | None = None


class UserListResponse(BaseModel):
    items: list[UserRead]
    total: int


class ExpertProfileCreate(BaseModel):
    user_id: int
    title: str | None = None
    specialty: str | None = None
    certificate_no: str | None = None
    bio: str | None = None
    review_capacity_per_day: int = 20


class ExpertProfileRead(ExpertProfileCreate):
    id: int
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExpertProfileWithUser(ExpertProfileRead):
    user: UserRead | None = None

    model_config = ConfigDict(from_attributes=True)
