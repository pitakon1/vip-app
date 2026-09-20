"""Google / Apple OAuth 登录校验服务。

封装两家 idToken 校验接口，供 /auth/oauth/* 使用。
不做任何配置校验（配置校验放路由层），仅负责「纯校验」：
校验成功返回带 email/sub/aud/name 的 dict，失败返回 None。
"""
import httpx
from jose import jwt

_TIMEOUT = 15.0


def verify_google_id_token(id_token: str) -> dict | None:
    """校验 Google idToken 并返回 claims（含 email/sub/aud/name）。

    用 Google tokeninfo 端点换取明文 claims：200 且存在 email 才认为有效。
    """
    if not id_token:
        return None
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None
    if not isinstance(data, dict) or not data.get("email"):
        return None
    return data


def verify_apple_id_token(id_token: str) -> dict | None:
    """校验 Apple idToken 并返回 claims（含 email/sub/aud）。

    拉取 Apple 公开 JWKS，用 RS256 解码。异常或不存在 email 返回 None。
    """
    if not id_token:
        return None
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get("https://appleid.apple.com/auth/keys")
            resp.raise_for_status()
            jwks = resp.json()
        claims = jwt.decode(id_token, key=jwks, algorithms=["RS256"])
    except Exception:
        return None
    if not isinstance(claims, dict) or not claims.get("email"):
        return None
    return claims