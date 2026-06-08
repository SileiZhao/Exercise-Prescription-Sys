import os
from pathlib import Path

try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.enums import OrganizationType, UserRole
from app.models.user import ExpertProfile, Organization, User
from scripts.import_exercise_actions import import_exercise_actions
from scripts.import_knowledge import import_knowledge_documents
from scripts.import_prescription_templates import import_prescription_templates

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DEFAULT_ACTIONS_PATH = DATA_DIR / "seed_actions.json"
DEFAULT_KNOWLEDGE_PATH = DATA_DIR / "seed_knowledge.json"
DEFAULT_TEMPLATES_PATH = DATA_DIR / "seed_templates.json"
INITIAL_SEED_PASSWORD_ENV = "INITIAL_SEED_PASSWORD"


def _initial_seed_password() -> str:
    password = os.getenv(INITIAL_SEED_PASSWORD_ENV)
    if not password:
        raise RuntimeError(f"{INITIAL_SEED_PASSWORD_ENV} must be set before seeding initial users.")
    return password


def ensure_user(db: Session, email: str, full_name: str, role: UserRole) -> tuple[User, bool]:
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        return user, False

    user = User(
        email=email,
        hashed_password=get_password_hash(_initial_seed_password()),
        full_name=full_name,
        role=role,
        is_active=True,
        is_verified=True,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    if role == UserRole.EXPERT:
        db.add(
            ExpertProfile(
                user_id=user.id,
                title="运动健康专家",
                specialty="慢病运动干预",
                review_capacity_per_day=30,
            )
        )
    return user, True


def ensure_default_organization(db: Session) -> tuple[Organization, bool]:
    organization = db.scalar(select(Organization).where(Organization.name == "示范试点机构"))
    if organization is not None:
        return organization, False

    organization = Organization(
        name="示范试点机构",
        type=OrganizationType.COMMUNITY,
        contact_person="平台管理员",
        contact_phone="13800000000",
    )
    db.add(organization)
    db.flush()
    return organization, True


def seed_initial_data(db: Session) -> dict[str, dict[str, int]]:
    organization, organization_created = ensure_default_organization(db)
    user_created = 0

    for email, full_name, role in [
        ("admin@example.com", "平台管理员", UserRole.ADMIN),
        ("expert@example.com", "审核专家", UserRole.EXPERT),
        ("user@example.com", "普通用户", UserRole.USER),
        ("researcher@example.com", "科研人员", UserRole.RESEARCHER),
        ("org-admin@example.com", "机构管理员", UserRole.ORG_ADMIN),
    ]:
        user, created = ensure_user(db, email=email, full_name=full_name, role=role)
        user.organization_id = organization.id
        if created:
            user_created += 1

    db.commit()
    admin = db.scalar(select(User).where(User.email == "admin@example.com"))
    admin_id = admin.id if admin else None

    actions = import_exercise_actions(db, DEFAULT_ACTIONS_PATH)
    knowledge = import_knowledge_documents(db, DEFAULT_KNOWLEDGE_PATH, created_by=admin_id)
    templates = import_prescription_templates(
        db,
        DEFAULT_TEMPLATES_PATH,
        created_by=admin_id,
        increment_version_on_update=False,
    )

    return {
        "organizations": {"created": int(organization_created)},
        "users": {"created": user_created},
        "actions": actions,
        "knowledge": knowledge,
        "templates": templates,
    }


def main() -> None:
    db = SessionLocal()
    try:
        result = seed_initial_data(db)
        print(
            "Seeded initial data: "
            f"organizations_created={result['organizations']['created']}, "
            f"users_created={result['users']['created']}, "
            f"actions_created={result['actions']['created']}, "
            f"actions_updated={result['actions']['updated']}, "
            f"knowledge_created={result['knowledge']['created']}, "
            f"knowledge_updated={result['knowledge']['updated']}, "
            f"templates_created={result['templates']['created']}, "
            f"templates_updated={result['templates']['updated']}. "
            "initial seed password is provided by environment and users require first-login password change."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
