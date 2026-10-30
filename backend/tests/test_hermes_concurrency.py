# Hermes BFF: concurrent proxied calls (as the frontend fires them in parallel) must not lose the rotated cookie
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
H = f"{BASE_URL}/api/hermes"


def test_parallel_calls_then_after_grace():
    s = requests.Session()
    ip = f"10.9.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
    r = s.post(f"{H}/login", json={"method": "password", "provider": "basic", "username": "sam", "password": "correct-horse"},
               headers={"X-Forwarded-For": ip})
    assert r.status_code == 200
    raw = s.cookies["aura_session"]
    paths = ["/overview", "/sessions", "/sessions/search?q=deploy", "/sessions/20260601_a1/messages"]
    with ThreadPoolExecutor(4) as ex:
        codes = list(ex.map(lambda p: requests.get(f"{H}{p}", cookies={"aura_session": raw}).status_code, paths))
    assert codes == [200] * 4, codes
    time.sleep(7)
    r = requests.get(f"{H}/overview", cookies={"aura_session": raw})
    assert r.status_code == 200, r.text
    requests.post(f"{H}/logout", cookies={"aura_session": raw})
