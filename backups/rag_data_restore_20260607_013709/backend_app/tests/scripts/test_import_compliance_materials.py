import json

from sqlalchemy import select

from app.models.template import ComplianceDocument
from scripts.import_compliance_materials import import_compliance_materials


def test_import_compliance_materials_confirmed_mode_clears_pending_items(db_session, tmp_path):
    path = tmp_path / "compliance.json"
    path.write_text(
        json.dumps(
            {
                "documents": [
                    {
                        "doc_code": "CONSENT",
                        "title": "知情同意",
                        "text": "内容",
                        "pending_confirmation": ["法务"],
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    import_compliance_materials(db_session, path, confirmed=True)

    doc = db_session.scalar(select(ComplianceDocument).where(ComplianceDocument.code == "CONSENT"))
    assert doc.review_status == "CONFIRMED"
    assert doc.pending_confirmation == []
    assert doc.status == "ACTIVE"
