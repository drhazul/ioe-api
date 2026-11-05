"""Run through `odoo shell -d ioe_odoo_pilot` after mounting private secret."""

from pathlib import Path

password = Path("/tmp/ioe_odoo_ui_admin_password").read_text(encoding="utf-8").strip()
if len(password) < 32:
    raise RuntimeError("Administrator password is missing or too short")

admin = env.ref("base.user_admin")
if admin.login != "admin":
    raise RuntimeError("Unexpected administrator login")

admin.write({"password": password})
env.cr.commit()
print("Pilot Odoo UI administrator password updated.")
