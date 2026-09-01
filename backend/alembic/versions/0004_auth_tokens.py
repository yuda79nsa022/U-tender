"""auth_tokens — email verification + password reset tokens

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-01

"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

auth_token_type_enum = sa.Enum("email_verify", "password_reset", name="authtokentype")


def upgrade() -> None:
    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        # SHA-256 hex digest of the raw token — only the hash is ever stored.
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("type", auth_token_type_enum, nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("used_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("token_hash", name="uq_auth_tokens_hash"),
    )
    op.create_index("idx_auth_tokens_user", "auth_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("auth_tokens")
