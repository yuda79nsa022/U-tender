"""owner verification — civil ID / land ownership documents, admin
approval gate for owners, and owner/contractor scoping on document
requirements (spec follow-up: admin oversight of owners + all-offers view)

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-01

"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

verification_status = sa.Enum("incomplete", "pending_review", "changes_requested", "approved", name="verificationstatus")
document_status = sa.Enum("not_submitted", "pending", "approved", "rejected", name="documentstatus")
user_role = sa.Enum("owner", "contractor", "admin", name="userrole")


def upgrade() -> None:
    # ---------- owner_profiles: mirrors contractor_profiles' verification
    # + suspension fields, minus the payment/subscription ones that don't
    # apply to owners ----------
    op.create_table(
        "owner_profiles",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("verification_status", verification_status, nullable=False, server_default="incomplete"),
        sa.Column("is_suspended", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ---------- document_requirements: scope each requirement to owner or
    # contractor. Every existing row predates this column and was written
    # for contractors (owners had no document flow at all before this
    # migration), so backfilling the default as 'contractor' preserves
    # their behavior exactly. ----------
    op.add_column(
        "document_requirements",
        sa.Column("applies_to", user_role, nullable=False, server_default="contractor"),
    )

    # ---------- owner_documents: mirrors contractor_documents ----------
    op.create_table(
        "owner_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("owner_profiles.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "requirement_id",
            sa.String(36),
            sa.ForeignKey("document_requirements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("status", document_status, nullable=False, server_default="not_submitted"),
        sa.Column("admin_note", sa.Text, nullable=True),
        sa.Column("reviewed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime, nullable=True),
        sa.Column("submitted_at", sa.DateTime, nullable=True),
        sa.Column("expires_on", sa.Date, nullable=True),
        sa.UniqueConstraint("owner_id", "requirement_id", name="uq_owner_requirement"),
    )
    op.create_index("idx_owner_documents_owner", "owner_documents", ["owner_id"])

    # ---------- notifications: widen the enum for the 5 new owner-side
    # notification types (MySQL ENUMs are inline per-column, so this needs
    # an explicit ALTER — same pattern as 0003's subscription_status
    # widen). All existing values are kept verbatim, so this is additive
    # only; no data migration needed. ----------
    op.execute(
        "ALTER TABLE notifications MODIFY COLUMN type ENUM("
        "'document_rejected','document_approved','verification_activated','payment_activated',"
        "'payment_failed','payment_override_granted','payment_override_revoked','contractor_suspended',"
        "'contractor_reactivated','document_expiring','tender_amendment','drawing_revised',"
        "'clarification_asked','clarification_answered','bid_submitted','bid_revised','bid_withdrawn',"
        "'deadline_approaching','tender_closed','evaluation_ready','award_won','award_lost',"
        "'tender_cancelled','tender_no_award','owner_verification_activated','owner_document_rejected',"
        "'owner_document_approved','owner_suspended','owner_reactivated'"
        ") NOT NULL"
    )

    conn = op.get_bind()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # ---------- backfill: every owner who signed up before this migration
    # never had a document/approval step at all, so treating them as
    # already-approved (rather than newly incomplete) is the only choice
    # that doesn't lock an existing, already-working account out of the
    # app the moment this migration runs. The gate applies going forward,
    # to owners who sign up from here on. ----------
    existing_owner_ids = [row[0] for row in conn.execute(sa.text("SELECT id FROM users WHERE role = 'owner'"))]
    for user_id in existing_owner_ids:
        conn.execute(
            sa.text(
                "INSERT INTO owner_profiles (user_id, verification_status, is_suspended, created_at) "
                "VALUES (:user_id, 'approved', FALSE, :now)"
            ),
            {"user_id": user_id, "now": now},
        )

    # ---------- seed the two owner-side document requirements this
    # feature exists for. Admin can rename, retire (is_active=false), or
    # add more later from Admin -> Document requirements, same as the
    # existing contractor requirements — this seed just means the app
    # works out of the box instead of needing manual setup first. ----------
    for name, description in [
        ("Civil ID", "A government-issued civil ID / national ID for the property owner."),
        ("Land Ownership Proof", "A deed, title, or other document proving ownership of the property being listed."),
    ]:
        conn.execute(
            sa.text(
                "INSERT INTO document_requirements "
                "(id, name, description, is_required, is_active, applies_to, effective_from, created_at) "
                "VALUES (:id, :name, :description, TRUE, TRUE, 'owner', :now, :now)"
            ),
            {"id": str(uuid.uuid4()), "name": name, "description": description, "now": now},
        )


def downgrade() -> None:
    op.drop_index("idx_owner_documents_owner", table_name="owner_documents")
    op.drop_table("owner_documents")
    op.execute("DELETE FROM document_requirements WHERE applies_to = 'owner'")
    op.drop_column("document_requirements", "applies_to")
    op.drop_table("owner_profiles")
    op.execute(
        "ALTER TABLE notifications MODIFY COLUMN type ENUM("
        "'document_rejected','document_approved','verification_activated','payment_activated',"
        "'payment_failed','payment_override_granted','payment_override_revoked','contractor_suspended',"
        "'contractor_reactivated','document_expiring','tender_amendment','drawing_revised',"
        "'clarification_asked','clarification_answered','bid_submitted','bid_revised','bid_withdrawn',"
        "'deadline_approaching','tender_closed','evaluation_ready','award_won','award_lost',"
        "'tender_cancelled','tender_no_award'"
        ") NOT NULL"
    )
