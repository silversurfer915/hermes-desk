# Backend API tests: health root, Hermes connection (demo mode), status CRUD
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Health
def test_root(api):
    r = api.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert r.json()["message"] == "Hello World"


# Hermes connection - demo mode
def test_hermes_connection_demo(api):
    r = api.get(f"{BASE_URL}/api/hermes/connection")
    assert r.status_code == 200
    data = r.json()
    # Hermes address is now configured (stand-in fake Hermes)
    assert isinstance(data["configured"], bool)
    assert {"configured", "reachable", "signed_in"} <= set(data)


# Status checks create -> list
def test_status_create_and_list(api):
    r = api.post(f"{BASE_URL}/api/status", json={"client_name": "TEST_hermes"})
    assert r.status_code == 200
    created = r.json()
    assert created["client_name"] == "TEST_hermes"
    assert isinstance(created["id"], str)
    r2 = api.get(f"{BASE_URL}/api/status")
    assert r2.status_code == 200
    items = r2.json()
    assert any(i["id"] == created["id"] for i in items)
    assert all("_id" not in i for i in items)


def test_status_validation(api):
    r = api.post(f"{BASE_URL}/api/status", json={})
    assert r.status_code == 422

