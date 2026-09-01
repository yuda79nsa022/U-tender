from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


# Append-only. Every sensitive admin action (payment overrides today;
# document decisions, suspensions, and award records follow in later
# passes) calls this so there's a single queryable trail of who did what,
# when, and why — spec's audit requirement.
def log_action(
    db: Session,
    actor_id: str | None,
    action: str,
    target_type: str,
    target_id: str,
    previous_value: str | None = None,
    new_value: str | None = None,
    reason: str | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            previous_value=previous_value,
            new_value=new_value,
            reason=reason,
        )
    )
    db.commit()
