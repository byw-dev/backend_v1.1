import base64
import hashlib
import hmac
import json
import time
from typing import Optional

import config


COOKIE_NAME = 'by_weather_session'
DEFAULT_AUTH_USERS = [
    {
        'username': 'admin',
        'password': 'admin123',
        'display_name': '全量账号',
        'role': 'full',
    },
    {
        'username': 'lite',
        'password': 'lite123',
        'display_name': '精简账号',
        'role': 'lite',
    },
]


def is_auth_enabled() -> bool:
    return bool(getattr(config, 'AUTH_ENABLED', True))


def role_permissions(role: str) -> list:
    permissions = getattr(config, 'ROLE_PERMISSIONS', {})
    if not permissions:
        permissions = {
            'full': ['view_all'],
            'lite': ['view_map', 'view_replay', 'view_weather_overlays'],
        }
    return list(permissions.get(role, []))


def public_user(user: dict) -> dict:
    role = user.get('role', 'lite')
    return {
        'username': user.get('username'),
        'display_name': user.get('display_name') or user.get('username'),
        'role': role,
        'permissions': role_permissions(role),
    }


def system_user() -> dict:
    return {
        'username': 'system',
        'display_name': 'System',
        'role': 'full',
        'permissions': role_permissions('full'),
    }


def has_permission(user: Optional[dict], permission: str) -> bool:
    if not is_auth_enabled():
        return True
    if not user:
        return False
    return permission in set(user.get('permissions') or role_permissions(user.get('role', 'lite')))


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def _password_matches(password: str, stored: str) -> bool:
    stored = str(stored or '')
    if stored.startswith('sha256:'):
        return hmac.compare_digest(_hash_password(password), stored.split(':', 1)[1])
    return hmac.compare_digest(password, stored)


def authenticate(username: str, password: str) -> Optional[dict]:
    username = str(username or '').strip()
    password = str(password or '')
    for item in getattr(config, 'AUTH_USERS', DEFAULT_AUTH_USERS):
        if item.get('username') != username:
            continue
        if _password_matches(password, item.get('password') or item.get('password_hash')):
            role = item.get('role', 'lite')
            return {
                'username': username,
                'display_name': item.get('display_name') or username,
                'role': role,
                'permissions': role_permissions(role),
            }
    return None


def _sign(payload_b64: str) -> str:
    return hmac.new(
        str(getattr(config, 'AUTH_SECRET_KEY', 'change-this-local-session-secret')).encode('utf-8'),
        payload_b64.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()


def create_session_token(user: dict) -> str:
    payload = {
        'username': user.get('username'),
        'display_name': user.get('display_name'),
        'role': user.get('role', 'lite'),
        'exp': int(time.time()) + int(getattr(config, 'SESSION_TTL_SECONDS', 12 * 60 * 60)),
    }
    raw = json.dumps(payload, separators=(',', ':'), ensure_ascii=True).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')
    return f'{payload_b64}.{_sign(payload_b64)}'


def verify_session_token(token: str) -> Optional[dict]:
    if not token or '.' not in token:
        return None
    payload_b64, signature = token.rsplit('.', 1)
    if not hmac.compare_digest(_sign(payload_b64), signature):
        return None
    padded = payload_b64 + '=' * (-len(payload_b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode('ascii')).decode('utf-8'))
    except Exception:
        return None
    if int(payload.get('exp') or 0) < int(time.time()):
        return None
    role = payload.get('role', 'lite')
    return {
        'username': payload.get('username'),
        'display_name': payload.get('display_name') or payload.get('username'),
        'role': role,
        'permissions': role_permissions(role),
    }
