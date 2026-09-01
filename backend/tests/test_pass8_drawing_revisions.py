from datetime import datetime, timedelta
import app.db as db_module  # noqa: E402
from fastapi.testclient import TestClient
from app.main import app


def test_pass8_drawing_revisions():
    results = []


    def check(name, cond):
        results.append((name, bool(cond)))
        print(("PASS" if cond else "FAIL") + " - " + name)


    owner_client = TestClient(app)
    owner_client.post("/auth/signup", json={"email": "owner1@example.com", "password": "password123", "full_name": "Owner", "role": "owner"})

    future = (datetime.utcnow() + timedelta(days=7)).isoformat()

    r = owner_client.post(
        "/projects",
        data={"title": "Roof job", "address": "1 Main St", "bid_deadline": future, "status": "open"},
        files={"drawings": ("plan.pdf", b"version one content", "application/pdf")},
    )
    check("project created with one drawing", r.status_code == 201 and len(r.json()["drawings"]) == 1)
    project_id = r.json()["id"]
    check("initial drawing is revision 1", r.json()["drawings"][0]["revision"] == 1)
    check("initial drawing is_current true", r.json()["drawings"][0]["is_current"] is True)

    # Re-upload a file with the SAME name -> should supersede, not duplicate.
    r = owner_client.post(
        f"/projects/{project_id}/drawings",
        files={"drawings": ("plan.pdf", b"version two content, revised", "application/pdf")},
    )
    check("re-upload succeeds", r.status_code == 200)
    check("still only one CURRENT drawing visible in detail", len(r.json()["drawings"]) == 1)
    check("current drawing is now revision 2", r.json()["drawings"][0]["revision"] == 2)

    # A differently-named file is a separate drawing, not a revision.
    r = owner_client.post(
        f"/projects/{project_id}/drawings",
        files={"drawings": ("elevation.pdf", b"a different drawing entirely", "application/pdf")},
    )
    check("differently-named file adds a second current drawing", len(r.json()["drawings"]) == 2)
    elevation = next(d for d in r.json()["drawings"] if d["file_name"] == "elevation.pdf")
    check("new distinct file starts at revision 1", elevation["revision"] == 1)

    # Full history includes the superseded revision 1 of plan.pdf.
    r = owner_client.get(f"/projects/{project_id}/drawings/history")
    check("history endpoint returns 200", r.status_code == 200)
    history = r.json()
    plan_revisions = sorted([h for h in history if h["file_name"] == "plan.pdf"], key=lambda h: h["revision"])
    check("history contains both plan.pdf revisions", len(plan_revisions) == 2)
    check("history: revision 1 is marked NOT current (superseded, not deleted)", plan_revisions[0]["is_current"] is False)
    check("history: revision 2 is marked current", plan_revisions[1]["is_current"] is True)
    check("history: superseded revision still has a working signed url", plan_revisions[0]["url"] is not None)
    check("history includes elevation.pdf too", any(h["file_name"] == "elevation.pdf" for h in history))
    check("history total row count is 3 (2 plan revisions + 1 elevation)", len(history) == 3)

    # drawings-zip only includes CURRENT revisions (2 files: plan v2 + elevation), not the superseded v1.
    r = owner_client.get(f"/projects/{project_id}/drawings-zip")
    check("drawings-zip succeeds", r.status_code == 200)
    import io
    import zipfile

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    check("zip contains exactly 2 entries (current revisions only)", len(names) == 2)
    check("zip's plan.pdf content is the REVISED version, not the original", zf.read("plan.pdf") == b"version two content, revised")

    # A zip upload with two entries sharing a name within the SAME batch: the
    # second should be treated as a revision of the first, not a duplicate
    # "current" row (tests the explicit db.flush() in _record_drawing).
    import zipfile as zf_mod

    buf = io.BytesIO()
    with zf_mod.ZipFile(buf, "w") as z:
        z.writestr("spec.pdf", b"same-batch entry A")
    buf.seek(0)
    r = owner_client.post(f"/projects/{project_id}/drawings", files={"drawings": ("batch1.zip", buf.read(), "application/zip")})
    check("zip batch 1 uploaded", r.status_code == 200)

    buf2 = io.BytesIO()
    with zf_mod.ZipFile(buf2, "w") as z:
        z.writestr("spec.pdf", b"same-batch entry B - revised")
    buf2.seek(0)
    r = owner_client.post(f"/projects/{project_id}/drawings", files={"drawings": ("batch2.zip", buf2.read(), "application/zip")})
    check("zip batch 2 uploaded (revises spec.pdf)", r.status_code == 200)

    spec_current = [d for d in r.json()["drawings"] if d["file_name"] == "spec.pdf"]
    check("exactly one CURRENT spec.pdf after two batches", len(spec_current) == 1)
    check("spec.pdf current revision is 2", spec_current[0]["revision"] == 2)

    r = owner_client.get(f"/projects/{project_id}/drawings/history")
    spec_history = sorted([h for h in r.json() if h["file_name"] == "spec.pdf"], key=lambda h: h["revision"])
    check("spec.pdf has exactly 2 history rows, not 3", len(spec_history) == 2)


    failed = [n for n, ok in results if not ok]
    print()
    print(f"{len(results) - len(failed)}/{len(results)} passed")
    assert not failed, "FAILED: " + str(failed)
