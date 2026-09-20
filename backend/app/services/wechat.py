"""微信小程序服务（code2session / getPhoneNumber）。

封装微信开放平台两个 HTTPS 接口，供 /auth/wx/* 使用。
依赖 config.WECHAT_APPID / WECHAT_SECRET；未配置时返回 None，由调用方给出 503。
"""
import httpx

from app.config import settings

_TIMEOUT = 15.0


def code2session(js_code: str) -> str | None:
    """用 wx.login 的 code 换取 openid。

    返回 openid；凭据缺失或接口报错返回 None。
    """
    if not settings.WECHAT_APPID or not settings.WECHAT_SECRET or not js_code:
        return None
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APPID,
        "secret": settings.WECHAT_SECRET,
        "js_code": js_code,
        "grant_type": "authorization_code",
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None
    openid = data.get("openid")
    return openid if isinstance(openid, str) and openid else None


def _get_access_token() -> str | None:
    """小程序全局访问令牌（getPhoneNumber 需要）。"""
    if not settings.WECHAT_APPID or not settings.WECHAT_SECRET:
        return None
    url = "https://api.weixin.qq.com/cgi-bin/token"
    params = {
        "grant_type": "client_credential",
        "appid": settings.WECHAT_APPID,
        "secret": settings.WECHAT_SECRET,
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None
    token = data.get("access_token")
    return token if isinstance(token, str) and token else None


def get_phone_number(code: str) -> str | None:
    """用 button open-type='getPhoneNumber' 回调的 code 换取手机号。

    返回 purePhoneNumber；凭据缺失或接口失败返回 None。
    """
    access_token = _get_access_token()
    if not access_token or not code:
        return None
    url = ("https://api.weixin.qq.com/wxa/business/getuserphonenumber"
           f"?access_token={access_token}")
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, json={"code": code})
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None
    phone_info = data.get("phone_info") or {}
    phone = phone_info.get("purePhoneNumber")
    return phone if isinstance(phone, str) and phone else None