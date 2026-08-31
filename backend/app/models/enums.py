import enum


class UserRole(str, enum.Enum):
    owner = "owner"
    contractor = "contractor"
    admin = "admin"


class ProjectStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    awarded = "awarded"
    canceled = "canceled"


class OfferStatus(str, enum.Enum):
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"
    withdrawn = "withdrawn"


class VerificationStatus(str, enum.Enum):
    incomplete = "incomplete"
    pending_review = "pending_review"
    changes_requested = "changes_requested"
    approved = "approved"


class DocumentStatus(str, enum.Enum):
    not_submitted = "not_submitted"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class SubscriptionStatus(str, enum.Enum):
    trialing = "trialing"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"
