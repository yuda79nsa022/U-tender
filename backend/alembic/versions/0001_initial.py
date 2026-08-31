"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

user_role = sa.Enum("owner", "contractor", "admin", name="userrole")
project_status = sa.Enum("open", "closed", "awarded", "canceled", name="projectstatus")
offer_status = sa.Enum("submitted", "approved", "rejected", "withdrawn", name="offerstatus")
verification_status = sa.Enum("incomplete", "pending_review", "changes_requested", "approved", name="verificationstatus")
document_status = sa.Enum("not_submitted", "pending", "approved", "rejected", name="documentstatus")
subscription_status = sa.Enum("trialing", "active", "past_due", "canceled", name="subscriptionstatus")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="owner"),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "contractor_profiles",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("license_number", sa.String(100), nullable=True),
        sa.Column("primary_trade", sa.String(100), nullable=True),
        sa.Column("service_area", sa.String(255), nullable=True),
        sa.Column("verification_status", verification_status, nullable=False, server_default="incomplete"),
        sa.Column("is_suspended", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("avg_rating", sa.Numeric(2, 1), server_default="0"),
        sa.Column("review_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("subscription_status", subscription_status, nullable=True),
        sa.Column("subscription_current_period_end", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "document_requirements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_required", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "contractor_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "contractor_id",
            sa.String(36),
            sa.ForeignKey("contractor_profiles.user_id", ondelete="CASCADE"),
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
        sa.UniqueConstraint("contractor_id", "requirement_id", name="uq_contractor_requirement"),
    )
    op.create_index("idx_contractor_documents_contractor", "contractor_documents", ["contractor_id"])

    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("trade", sa.String(100), nullable=True),
        sa.Column("bid_deadline", sa.DateTime, nullable=False),
        sa.Column("status", project_status, nullable=False, server_default="open"),
        sa.Column("deadline_reminder_sent", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("idx_projects_status", "projects", ["status"])
    op.create_index("idx_projects_owner", "projects", ["owner_id"])

    op.create_table(
        "project_drawings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_name", sa.String(500), nullable=False),
        sa.Column("uploaded_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "offers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "contractor_id",
            sa.String(36),
            sa.ForeignKey("contractor_profiles.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("timeline_estimate", sa.String(255), nullable=True),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("status", offer_status, nullable=False, server_default="submitted"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("project_id", "contractor_id", name="uq_project_contractor"),
    )
    op.create_index("idx_offers_project", "offers", ["project_id"])
    op.create_index("idx_offers_contractor", "offers", ["contractor_id"])

    op.create_table(
        "reviews",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("contractor_id", sa.String(36), sa.ForeignKey("contractor_profiles.user_id"), nullable=False),
        sa.Column("rating", sa.SmallInteger, nullable=False),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", name="uq_review_project"),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_rating_range"),
    )


def downgrade() -> None:
    op.drop_table("reviews")
    op.drop_table("offers")
    op.drop_table("project_drawings")
    op.drop_table("projects")
    op.drop_table("contractor_documents")
    op.drop_table("document_requirements")
    op.drop_table("contractor_profiles")
    op.drop_table("users")
    for e in (user_role, project_status, offer_status, verification_status, document_status, subscription_status):
        e.drop(op.get_bind(), checkfirst=True)
