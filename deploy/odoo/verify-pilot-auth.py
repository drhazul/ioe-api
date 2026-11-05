"""Verify private pilot Odoo administrator login without printing the secret."""

import json
from pathlib import Path
from urllib.request import Request, urlopen

password = Path("/root/ioe_odoo_pilot/secrets/odoo_ui_admin_password").read_text(
    encoding="utf-8"
).strip()
payload = json.dumps(
    {"jsonrpc": "2.0", "params": {"db": "ioe_odoo_pilot", "login": "admin", "password": password}}
).encode("utf-8")
request = Request(
    "http://172.16.100.40:18069/web/session/authenticate",
    data=payload,
    headers={"Content-Type": "application/json"},
)
with urlopen(request, timeout=15) as response:
    result = json.load(response)

uid = result.get("result", {}).get("uid")
if not isinstance(uid, int) or uid <= 0:
    raise RuntimeError("Pilot Odoo administrator authentication failed")
print("Pilot Odoo administrator authentication succeeded.")
