try:
    from scripts._bootstrap import ensure_project_root_on_path
except ImportError:
    from _bootstrap import ensure_project_root_on_path

ensure_project_root_on_path()

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.enums import UserRole
from app.models.user import User
from app.services.clustering_service import ClusterPersistenceService


def main() -> None:
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.role == UserRole.ADMIN))
        model = ClusterPersistenceService(db).train_from_database(
            name="KMeans 人群分型模型",
            n_clusters=2,
            created_by=admin.id if admin else None,
        )
        print(f"Trained cluster model #{model.id}: {model.name}, clusters={model.n_clusters}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
