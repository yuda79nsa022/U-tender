import app.db as db_module  # noqa: E402
from fastapi.testclient import TestClient
from app.main import app


def test_pass4_auth():
    client = TestClient(app)

    results = []


    def check(name, cond):
        results.append((name, bool(cond)))
        print(("PASS" if cond else "FAIL") + " - " + name)


    # --- signup sends verification token (captured via monkeypatch) ---
    import app.services.auth_tokens as auth_tokens_module

    captured_tokens = {}
    orig_issue = auth_tokens_module.issue_token


    def spy_issue_token(db, user_id, token_type):
        raw = orig_issue(db, user_id, token_type)
        captured_tokens[(user_id, token_type)] = raw
        return raw


    auth_tokens_module.issue_token = spy_issue_token
    import app.auth.router as auth_router_module

    auth_router_module.issue_token = spy_issue_token

    r = client.post(
        "/auth/signup",
        json={"email": "owner1@example.com", "password": "password123", "full_name": "Owner One", "role": "owner"},
    )
    check("signup succeeds", r.status_code == 201)
    user = r.json()
    check("signup response has language default en", user.get("language") == "en")
    check("signup response has email_verified false", user.get("email_verified") is False)

    user_id = user["id"]
    from app.models.enums import AuthTokenType

    verify_token = captured_tokens.get((user_id, AuthTokenType.email_verify))
    check("verification token captured on signup", verify_token is not None)

    # --- wrong token rejected ---
    r = client.post("/auth/verify-email", json={"token": "not-a-real-token"})
    check("bogus verify token rejected 400", r.status_code == 400)

    # --- correct token verifies ---
    r = client.post("/auth/verify-email", json={"token": verify_token})
    check("valid verify token accepted", r.status_code == 200 and r.json()["email_verified"] is True)

    # --- token cannot be reused ---
    r = client.post("/auth/verify-email", json={"token": verify_token})
    check("verify token single-use (second use rejected)", r.status_code == 400)

    # --- forgot-password: unknown email still 200, generic response ---
    r = client.post("/auth/forgot-password", json={"email": "doesnotexist@example.com"})
    check("forgot-password unknown email returns 200 (no enumeration)", r.status_code == 200)
    check("unknown email issued no token", (user_id, AuthTokenType.password_reset) not in captured_tokens)

    # --- forgot-password: known email issues token ---
    r = client.post("/auth/forgot-password", json={"email": "owner1@example.com"})
    check("forgot-password known email returns 200", r.status_code == 200)
    reset_token = captured_tokens.get((user_id, AuthTokenType.password_reset))
    check("reset token captured", reset_token is not None)

    # --- reset with bogus token rejected ---
    r = client.post("/auth/reset-password", json={"token": "garbage", "new_password": "newpassword123"})
    check("bogus reset token rejected", r.status_code == 400)

    # --- reset with real token works ---
    r = client.post("/auth/reset-password", json={"token": reset_token, "new_password": "newpassword123"})
    check("valid reset token accepted", r.status_code == 200)

    # --- old password no longer works, new one does ---
    r = client.post("/auth/login", json={"email": "owner1@example.com", "password": "password123"})
    check("old password rejected after reset", r.status_code == 401)

    r = client.post("/auth/login", json={"email": "owner1@example.com", "password": "newpassword123"})
    check("new password accepted after reset", r.status_code == 200)

    # --- reset token single-use ---
    r = client.post("/auth/reset-password", json={"token": reset_token, "new_password": "another123"})
    check("reset token single-use (second use rejected)", r.status_code == 400)

    # --- change-password while authenticated ---
    r = client.post("/auth/change-password", json={"current_password": "wrongpass", "new_password": "changed12345"})
    check("change-password wrong current rejected", r.status_code == 400)

    r = client.post("/auth/change-password", json={"current_password": "newpassword123", "new_password": "changed12345"})
    check("change-password with correct current succeeds", r.status_code == 200)

    r = client.post("/auth/login", json={"email": "owner1@example.com", "password": "changed12345"})
    check("login with changed password works", r.status_code == 200)

    # --- language persistence ---
    r = client.patch("/auth/language", json={"language": "ar"})
    check("language update succeeds", r.status_code == 200 and r.json()["language"] == "ar")

    r = client.get("/auth/me")
    check("me reflects persisted language after cookie refresh", r.json()["language"] == "ar")

    # --- request-email-verification when already verified is a no-op ---
    r = client.post("/auth/request-email-verification")
    check("request-email-verification already-verified short-circuits", r.status_code == 200 and r.json().get("already_verified") is True)

    # --- logout then protected endpoints reject ---
    client.post("/auth/logout")
    r = client.get("/auth/me")
    check("me rejected after logout", r.status_code == 401)
    r = client.patch("/auth/language", json={"language": "en"})
    check("language update rejected when logged out", r.status_code == 401)
    r = client.post("/auth/change-password", json={"current_password": "x", "new_password": "y" * 10})
    check("change-password rejected when logged out", r.status_code == 401)

    failed = [n for n, ok in results if not ok]
    print()
    print(f"{len(results) - len(failed)}/{len(results)} passed")
    assert not failed, "FAILED: " + str(failed)
