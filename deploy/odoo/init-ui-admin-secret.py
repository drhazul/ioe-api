"""Add a fresh pilot Odoo UI administrator password without displaying it."""

import os
from pathlib import Path
import secrets

path = Path("/root/ioe_odoo_pilot/secrets/odoo_ui_admin_password")
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as out:
    out.write(secrets.token_urlsafe(40) + "\n")
os.chmod(path, 0o600)
print("Odoo UI administrator password created in private file; value not displayed.")
