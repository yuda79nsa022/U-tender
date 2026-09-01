import stripe

from app.config import get_settings

settings = get_settings()
if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


# Maps Stripe's subscription.status values onto our narrower
# subscription_status enum (trialing | active | past_due | canceled).
# Stripe has a few extra states (incomplete, incomplete_expired, unpaid,
# paused) that don't have a clean equivalent — folded into whichever of
# ours is closest in meaning for gating access. Ported from src/lib/stripe.ts.
def map_stripe_status(stripe_status: str) -> str:
    if stripe_status == "trialing":
        return "trialing"
    if stripe_status == "active":
        return "active"
    if stripe_status in ("past_due", "unpaid", "incomplete"):
        return "past_due"
    return "canceled"  # canceled, incomplete_expired, paused, or anything unrecognized
