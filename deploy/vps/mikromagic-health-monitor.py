#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import smtplib
import ssl
import subprocess
import sys
import time
import urllib.request
from email.message import EmailMessage
from pathlib import Path

STATE_DIR = Path("/var/lib/mikromagic-monitor")
STATE_FILE = STATE_DIR / "state.json"
APP_ROOT = Path("/opt/mikromagic-app")
BACKUP_DIR = Path("/var/backups/mikromagic")


def command(*args: str) -> tuple[bool, str]:
    result = subprocess.run(args, text=True, capture_output=True, timeout=20, check=False)
    return result.returncode == 0, (result.stdout or result.stderr).strip()


def send_email(subject: str, body: str) -> None:
    host = os.environ.get("SMTP_HOST", "").strip()
    sender = os.environ.get("SMTP_FROM", "").strip()
    recipient = os.environ.get("ALERT_TO", "").strip()
    if not host or not sender or not recipient:
        raise RuntimeError("email delivery is not configured")

    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    mode = os.environ.get("SMTP_SECURITY", "starttls").lower()
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    context = ssl.create_default_context()
    if mode == "ssl":
        client: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=20, context=context)
    else:
        client = smtplib.SMTP(host, port, timeout=20)
    with client:
        if mode == "starttls":
            client.starttls(context=context)
        if user:
            client.login(user, password)
        client.send_message(message)


def checks() -> list[str]:
    failures: list[str] = []
    for service in ("mikromagic-app.service", "nginx.service", "docker.service", "fail2ban.service"):
        ok, state = command("systemctl", "is-active", service)
        if not ok or state != "active":
            failures.append(f"{service} is {state or 'unavailable'}")

    try:
        with urllib.request.urlopen("http://127.0.0.1:3000/", timeout=10) as response:
            if response.status != 200:
                failures.append(f"local application returned HTTP {response.status}")
    except Exception as error:
        failures.append(f"local application request failed: {error}")

    try:
        usage = shutil.disk_usage("/")
        used_percent = round(usage.used * 100 / usage.total)
        if used_percent >= 85:
            failures.append(f"root disk usage is {used_percent}%")
    except Exception as error:
        failures.append(f"disk usage check failed: {error}")

    backups = sorted(BACKUP_DIR.glob("mikromagic_*.backup"))
    if not backups:
        failures.append("no database backup exists")
    else:
        age_hours = (time.time() - backups[-1].stat().st_mtime) / 3600
        if age_hours > 36:
            failures.append(f"latest database backup is {age_hours:.1f} hours old")

    current = (APP_ROOT / "current").resolve(strict=False)
    stable = (APP_ROOT / "stable").resolve(strict=False)
    if current != stable:
        failures.append(f"current release {current.name} differs from stable {stable.name}")

    ok, unhealthy = command(
        "docker",
        "ps",
        "--filter",
        "health=unhealthy",
        "--format",
        "{{.Names}}",
    )
    if not ok:
        failures.append("Docker health query failed")
    elif unhealthy:
        failures.append(f"unhealthy containers: {unhealthy.replace(chr(10), ', ')}")
    return failures


def main() -> int:
    if "--test-email" in sys.argv:
        send_email("MikroMagic VPS monitoring test", "Email alert delivery is working.")
        print("test email sent")
        return 0

    failures = checks()
    status = "failed" if failures else "healthy"
    previous = {}
    try:
        previous = json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({"status": status, "failures": failures, "checkedAt": int(time.time())}))
    STATE_FILE.chmod(0o600)

    if previous.get("status") != status:
        hostname = os.uname().nodename
        if failures:
            subject = f"MikroMagic VPS alert: {len(failures)} failed check(s)"
            body = f"Host: {hostname}\n\n" + "\n".join(f"- {item}" for item in failures)
        else:
            subject = "MikroMagic VPS recovered"
            body = f"Host: {hostname}\n\nAll configured health checks are passing."
        try:
            send_email(subject, body)
        except Exception as error:
            print(f"monitor status changed but email was not sent: {error}", file=sys.stderr)

    if failures:
        print("; ".join(failures), file=sys.stderr)
        return 1
    print("healthy")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
