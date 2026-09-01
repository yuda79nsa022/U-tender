"""spec v2.1 domain expansion — tender lifecycle, payment gate, amendments,
clarifications, bid revisions, awards, notifications, audit log, CMS, i18n

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-01

"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

language_enum = sa.Enum("en", "ar", name="language")
tender_type_enum = sa.Enum("sealed", "owner_visible", name="tendertype")
notification_type_enum = sa.Enum(
    "document_rejected", "document_approved", "verification_activated", "payment_activated",
    "payment_failed", "payment_override_granted", "payment_override_revoked", "contractor_suspended",
    "contractor_reactivated", "document_expiring", "tender_amendment", "drawing_revised",
    "clarification_asked", "clarification_answered", "bid_submitted", "bid_revised", "bid_withdrawn",
    "deadline_approaching", "tender_closed", "evaluation_ready", "award_won", "award_lost",
    "tender_cancelled", "tender_no_award", name="notificationtype",
)


def upgrade() -> None:
    # ---------- users: language + email verification ----------
    op.add_column("users", sa.Column("language", language_enum, nullable=False, server_default="en"))
    op.add_column("users", sa.Column("email_verified", sa.Boolean, nullable=False, server_default=sa.false()))

    # ---------- contractor_profiles: payment gate separation ----------
    op.add_column(
        "contractor_profiles",
        sa.Column("payment_override_active", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    # subscription_status superset: existing values (trialing, active,
    # past_due, canceled) stay valid, so this is a safe widen with no data
    # migration needed.
    op.execute(
        "ALTER TABLE contractor_profiles MODIFY COLUMN subscription_status "
        "ENUM('not_started','pending','trialing','active','past_due','failed','canceled','expired','waived') NULL"
    )

    # ---------- document_requirements: versioning ----------
    op.add_column(
        "document_requirements",
        sa.Column("effective_from", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # ---------- projects: tender type + expanded lifecycle ----------
    op.add_column(
        "projects", sa.Column("tender_type", tender_type_enum, nullable=False, server_default="owner_visible")
    )
    op.add_column("projects", sa.Column("tender_type_locked", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("projects", sa.Column("revision", sa.Integer, nullable=False, server_default="1"))
    # status superset: existing values (open, closed, awarded, canceled)
    # stay valid.
    op.execute(
        "ALTER TABLE projects MODIFY COLUMN status "
        "ENUM('draft','open','closed','under_evaluation','awarded','no_award','canceled','expired') "
        "NOT NULL DEFAULT 'open'"
    )

    # ---------- project_amendments (create before project_drawings.amendment_id FK) ----------
    op.create_table(
        "project_amendments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amendment_number", sa.Integer, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("changed_fields", sa.String(500), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("deadline_extended", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "amendment_number", name="uq_project_amendment_number"),
    )
    op.create_index("idx_project_amendments_project", "project_amendments", ["project_id"])

    # ---------- project_drawings: versioning ----------
    op.add_column("project_drawings", sa.Column("revision", sa.Integer, nullable=False, server_default="1"))
    op.add_column("project_drawings", sa.Column("is_current", sa.Boolean, nullable=False, server_default=sa.true()))
    op.add_column(
        "project_drawings",
        sa.Column("amendment_id", sa.String(36), sa.ForeignKey("project_amendments.id", ondelete="SET NULL"), nullable=True),
    )

    # ---------- clarifications ----------
    op.create_table(
        "clarifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "contractor_id", sa.String(36), sa.ForeignKey("contractor_profiles.user_id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("answer", sa.Text, nullable=True),
        sa.Column("shared_with_all", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("answered_at", sa.DateTime, nullable=True),
    )
    op.create_index("idx_clarifications_project", "clarifications", ["project_id"])

    # ---------- offers: revision counter + revision log ----------
    op.add_column("offers", sa.Column("revision", sa.Integer, nullable=False, server_default="1"))
    op.create_table(
        "offer_revisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("offer_id", sa.String(36), sa.ForeignKey("offers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision_number", sa.Integer, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("timeline_estimate", sa.String(255), nullable=True),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column(
            "status",
            sa.Enum("submitted", "approved", "rejected", "withdrawn", name="offerstatus"),
            nullable=False,
        ),
        sa.Column("recorded_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("offer_id", "revision_number", name="uq_offer_revision"),
    )
    op.create_index("idx_offer_revisions_offer", "offer_revisions", ["offer_id"])

    # ---------- award_records ----------
    op.create_table(
        "award_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("offer_id", sa.String(36), sa.ForeignKey("offers.id"), nullable=False),
        sa.Column("contractor_id", sa.String(36), sa.ForeignKey("contractor_profiles.user_id"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("project_revision", sa.Integer, nullable=False),
        sa.Column("offer_revision", sa.Integer, nullable=False),
        sa.Column("awarded_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", name="uq_award_project"),
    )

    # ---------- payment_overrides ----------
    op.create_table(
        "payment_overrides",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "contractor_id", sa.String(36), sa.ForeignKey("contractor_profiles.user_id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("granted_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("revoked_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("revoked_at", sa.DateTime, nullable=True),
    )
    op.create_index("idx_payment_overrides_contractor", "payment_overrides", ["contractor_id"])

    # ---------- notifications ----------
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", notification_type_enum, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("link", sa.String(500), nullable=True),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("idx_notifications_user", "notifications", ["user_id"])

    # ---------- audit_logs ----------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(100), nullable=False),
        sa.Column("target_id", sa.String(36), nullable=False),
        sa.Column("previous_value", sa.Text, nullable=True),
        sa.Column("new_value", sa.Text, nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("idx_audit_logs_action", "audit_logs", ["action"])
    op.create_index("idx_audit_logs_target", "audit_logs", ["target_id"])

    # ---------- cms_content ----------
    op.create_table(
        "cms_content",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key", sa.String(150), nullable=False),
        sa.Column("language", language_enum, nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("key", "language", name="uq_cms_key_language"),
    )
    op.create_index("idx_cms_content_key", "cms_content", ["key"])


def downgrade() -> None:
    op.drop_table("cms_content")
    op.drop_table("audit_logs")
    op.drop_table("notifications")
    op.drop_table("payment_overrides")
    op.drop_table("award_records")
    op.drop_table("offer_revisions")
    op.drop_column("offers", "revision")
    op.drop_table("clarifications")
    op.drop_column("project_drawings", "amendment_id")
    op.drop_column("project_drawings", "is_current")
    op.drop_column("project_drawings", "revision")
    op.drop_table("project_amendments")
    op.execute("ALTER TABLE projects MODIFY COLUMN status ENUM('open','closed','awarded','canceled') NOT NULL DEFAULT 'open'")
    op.drop_column("projects", "revision")
    op.drop_column("projects", "tender_type_locked")
    op.drop_column("projects", "tender_type")
    op.drop_column("document_requirements", "effective_from")
    op.execute(
        "ALTER TABLE contractor_profiles MODIFY COLUMN subscription_status "
        "ENUM('trialing','active','past_due','canceled') NULL"
    )
    op.drop_column("contractor_profiles", "payment_override_active")
    op.drop_column("users", "email_verified")
    op.drop_column("users", "language")
