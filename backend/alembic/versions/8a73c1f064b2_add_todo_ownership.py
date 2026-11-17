"""Add private ownership while preserving unattributed legacy tasks."""

from alembic import op
import sqlalchemy as sa

revision = "8a73c1f064b2"
down_revision = "309315edcaac"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy records have no provable owner and must remain inaccessible.
    with op.batch_alter_table("todos") as batch:
        batch.add_column(sa.Column("owner_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_todos_owner_id_users", "users", ["owner_id"], ["id"]
        )
        batch.create_index("ix_todos_owner_id", ["owner_id"])


def downgrade() -> None:
    with op.batch_alter_table("todos") as batch:
        batch.drop_index("ix_todos_owner_id")
        batch.drop_constraint("fk_todos_owner_id_users", type_="foreignkey")
        batch.drop_column("owner_id")
