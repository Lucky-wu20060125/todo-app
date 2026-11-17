"""Add todo color and priority position."""

from alembic import op
import sqlalchemy as sa

revision = "b7e2d4f9a1c3"
down_revision = "8a73c1f064b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("todos") as batch:
        batch.add_column(
            sa.Column(
                "color",
                sa.String(length=16),
                server_default="none",
                nullable=False,
            )
        )
        batch.add_column(
            sa.Column(
                "position",
                sa.Integer(),
                server_default="0",
                nullable=False,
            )
        )
        batch.create_index("ix_todos_position", ["position"])


def downgrade() -> None:
    with op.batch_alter_table("todos") as batch:
        batch.drop_index("ix_todos_position")
        batch.drop_column("position")
        batch.drop_column("color")
