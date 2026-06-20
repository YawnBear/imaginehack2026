from app.rules.engine import evaluate_event
from app.rules.seed_rules import builtin_rules
from app.services.seed import demo_events


def _match_for(resource_id: str):
    rules = builtin_rules()
    for event in demo_events():
        if event.resource_id != resource_id:
            continue
        matches = evaluate_event(event, rules)
        assert len(matches) == 1, f"{resource_id} should fire exactly one rule"
        return matches[0]
    raise AssertionError(f"no demo event for {resource_id}")


def test_public_bucket():
    m = _match_for("bucket-project-drawings")
    assert m.issue_type == "public_bucket"
    assert m.severity == "critical"  # production
    assert m.required_reviewers == ["security", "devops"]
    assert m.rule_confidence == 0.98
    assert m.evidence["public_access"] is True


def test_idle_vm():
    m = _match_for("vm-render-worker-07")
    assert m.issue_type == "idle_vm"
    assert m.severity == "medium"  # staging
    assert "devops" in m.required_reviewers
    assert m.evidence["monthly_usd"] == 96


def test_unused_storage():
    m = _match_for("vol-legacy-survey-backup")
    assert m.issue_type == "unused_storage"
    assert m.severity == "medium"
    assert "compliance" in m.required_reviewers


def test_unencrypted_db():
    m = _match_for("db-project-claims-prod")
    assert m.issue_type == "unencrypted_database"
    assert m.severity == "critical"  # production
    assert m.required_reviewers == ["security", "devops", "application_owner", "dba"]


def test_all_builtins_present():
    ids = {r.rule_id for r in builtin_rules()}
    assert ids == {
        "RULE_PUBLIC_BUCKET",
        "RULE_IDLE_VM",
        "RULE_UNUSED_STORAGE",
        "RULE_UNENCRYPTED_DATABASE",
        "RULE_FAILED_LOGIN",
        "RULE_IAM_CHANGE",
        "RULE_FIREWALL_INGRESS_CHANGE",
        "RULE_BUCKET_POLICY_CHANGE",
        "RULE_AUDIT_LOGGING_CHANGE",
        "RULE_DATABASE_CHANGE",
    }
