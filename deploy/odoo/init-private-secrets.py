"""Create pilot-only Docker secrets on CT105 without printing their values."""

import os
from pathlib import Path
import secrets

BASE = Path("/root/ioe_odoo_pilot/secrets")
BASE.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(BASE, 0o700)


def create(name: str, content: str, uid: int, gid: int) -> None:
    path = BASE / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write(content)
    os.chown(path, uid, gid)
    os.chmod(path, 0o600)


create("postgresql_password", secrets.token_urlsafe(40) + "\n", 100, 101)
create("pgadmin_password", secrets.token_urlsafe(40) + "\n", 5050, 5050)
create("odoo_ui_admin_password", secrets.token_urlsafe(40) + "\n", 0, 0)
create(
    "odoo.conf",
    "[options]\n"
    f"admin_passwd = {secrets.token_urlsafe(40)}\n"
    "proxy_mode = True\n"
    "data_dir = /var/lib/odoo\n"
    "db_name = ioe_odoo_pilot\n"
    "dbfilter = ^ioe_odoo_pilot$\n"
    "list_db = False\n",
    100,
    101,
)
print("Pilot secrets created at /root/ioe_odoo_pilot/secrets; values not displayed.")
