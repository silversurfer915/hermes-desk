"""Deterministic tests for the explicit advanced Hermes BFF surfaces."""
import os

from cryptography.fernet import Fernet
import pytest

os.environ.setdefault("AURA_UPSTREAM_KEY", Fernet.generate_key().decode())
os.environ.setdefault("AURA_SESSION_PEPPER", "test-only-pepper")

import hermes_bff as bff  # noqa: E402


def mock_reads(monkeypatch, responses):
    calls = []

    async def read(_request, path, params=None):
        calls.append((path, params))
        value = responses[path]
        return value(path, params) if callable(value) else value

    monkeypatch.setattr(bff, "_hermes_get", read)
    return calls


@pytest.mark.asyncio
async def test_skills_and_schedules_accept_keyed_envelopes(monkeypatch):
    mock_reads(monkeypatch, {
        "/api/skills": {"skills": [{"name": "research", "enabled": True}]},
        "/api/cron/jobs": {"jobs": [{"id": "job/one", "name": "Morning briefing"}]},
        "/api/cron/delivery-targets": {"targets": []},
    })
    skills = await bff.settings_section(None, "skills")
    schedules = await bff.settings_section(None, "schedules")
    assert skills["skills"] == [{"name": "research", "enabled": True}]
    assert schedules["jobs"] == [{"id": "job/one", "name": "Morning briefing"}]


@pytest.mark.asyncio
async def test_briefing_displays_latest_hermes_assistant_message(monkeypatch):
    calls = mock_reads(monkeypatch, {
        "/api/cron/jobs": [{"id": "job/one", "name": "Daily brief", "profile": "work"}],
        "/api/cron/jobs/job%2Fone/runs": {"runs": [{"session_id": "run/one", "source": "agent"}]},
        "/api/sessions/run%2Fone/messages": {"messages": [
            {"role": "assistant", "content": "Earlier"},
            {"role": "user", "content": "Ignored"},
            {"role": "assistant", "text": "Written by Hermes"},
        ]},
    })
    result = await bff.briefing(None)
    assert result["content"] == "Written by Hermes"
    assert result["content_kind"] == "message"
    assert calls[-1][1]["profile"] == "work"


@pytest.mark.asyncio
async def test_briefing_labels_cron_output_as_preview(monkeypatch):
    mock_reads(monkeypatch, {
        "/api/cron/jobs": {"jobs": [{"job_id": "brief", "title": "Morning briefing"}]},
        "/api/cron/jobs/brief/runs": [{"id": "run", "source": "cron_output", "preview": "Hermes preview"}],
    })
    result = await bff.briefing(None)
    assert result["content"] == "Hermes preview"
    assert result["content_kind"] == "preview"


@pytest.mark.asyncio
async def test_briefing_without_job_does_not_invent_content(monkeypatch):
    mock_reads(monkeypatch, {"/api/cron/jobs": {"jobs": []}})
    assert await bff.briefing(None) == {"job": None, "run": None, "content": None}


@pytest.mark.asyncio
async def test_bots_returns_profile_roster_and_normalized_routines(monkeypatch):
    mock_reads(monkeypatch, {
        "/api/profiles": {"profiles": [{"name": "default", "api_key": "not-returned"}]},
        "/api/profiles/active": {"current": "default"},
        "/api/cron/jobs": {"jobs": [{"id": "routine", "profile": "default"}]},
    })
    result = await bff.bots(None)
    assert result["profiles"] == [{"name": "default"}]
    assert result["routines"] == [{"id": "routine", "profile": "default"}]
    assert result["group_rooms"]["supported"] is None


def test_secret_shaped_config_is_redacted_recursively():
    value = {"api_key": "secret", "nested": {"password": "secret", "name": "shown"}}
    assert bff._redacted(value) == {
        "api_key": "[stored securely on Hermes]",
        "nested": {"password": "[stored securely on Hermes]", "name": "shown"},
    }
