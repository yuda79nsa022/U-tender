"""admin moderation of projects and offers — is_suspended flags on both,
plus the 4 new notification types for suspend/reactivate on each

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-01

"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("is_suspended", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("offers", sa.Column("is_suspended", sa.Boolean, nullable=False, server_default=sa.false()))

    # notifications.type: MySQL ENUMs are inline per-column, so widening it
    # needs an explicit ALTER — same pattern as 0003/0005. Additive only;
    # every existing value is kept verbatim.
    op.execute(
        "ALTER TABLE notifications MODIFY COLUMN type ENUM("
        "'document_rejected','document_approved','verification_activated','payment_activated',"
        "'payment_failed','payment_override_granted','payment_override_revoked','contractor_suspended',"
        "'contractor_reactivated','document_expiring','tender_amendment','drawing_revised',"
        "'clarification_asked','clarification_answered','bid_submitted','bid_revised','bid_withdrawn',"
        "'deadline_approaching','tender_closed','evaluation_ready','award_won','award_lost',"
        "'tender_cancelled','tender_no_award','owner_verification_activated','owner_document_rejected',"
        "'owner_document_approved','owner_suspended','owner_reactivated','project_suspended',"
        "'project_reactivated','offer_suspended','offer_reactivated'"
        ") NOT NULL"
    )


def downgrade() -> None:
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
    op.drop_column("offers", "is_suspended")
    op.drop_column("projects", "is_suspended")
