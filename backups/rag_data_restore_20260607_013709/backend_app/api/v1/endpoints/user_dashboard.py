from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user_dashboard import UserDashboardRead
from app.services.user_dashboard_service import UserDashboardService

router = APIRouter(prefix="/user/dashboard", tags=["user-dashboard"])


@router.get("", response_model=UserDashboardRead)
def user_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return UserDashboardService(db).summary(current_user.id)
