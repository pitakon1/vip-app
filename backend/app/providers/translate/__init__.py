"""翻译 Provider（Google Cloud Translation）。

业务人员上传的房源信息可能是多国语言，前端提供「翻译」按钮，调用本接口
将任意文本翻译为指定语言。未配置密钥时降级为站内 mock（截断/回显 + 少量词表），
保证可交互。
"""
import httpx

from app.config import settings

# 极简演示词表（mock 降级时使用，便于本地演示效果）
_DICT = {
    "zh": {"Hello": "你好", "Apartment": "公寓", "Bangkok": "曼谷"},
    "en": {"你好": "Hello", "公寓": "Apartment", "曼谷": "Bangkok"},
    "th": {"Hello": "สวัสดี", "Apartment": "คอนโด", "Bangkok": "กรุงเทพ"},
}


class TranslateProvider:
    def __init__(self) -> None:
        self.key = settings.GOOGLE_TRANSLATE_API_KEY
        self.project = settings.GOOGLE_TRANSLATE_V3_PROJECT

    @property
    def configured(self) -> bool:
        return bool(self.key)

    def translate(self, text: str, target: str = "zh", source: str = "") -> str:
        """text → target 语言。"""
        if not self.configured:
            # mock：逐词命中演示词表，未命中则原样返回
            out = []
            for w in (text or "").split():
                out.append(_DICT.get(target, {}).get(w, w))
            return " ".join(out) if out else text
        url = "https://translation.googleapis.com/language/translate/v2"
        payload = {"q": text, "target": target, "format": "text"}
        if source:
            payload["source"] = source
        resp = httpx.post(
            url, params={"key": self.key}, json=payload, timeout=10
        ).json()
        try:
            return resp["data"]["translations"][0]["translatedText"]
        except (KeyError, IndexError):
            raise RuntimeError(
                "Translate failed: %s" % resp.get("error", {}).get("message")
            )


translate_provider = TranslateProvider()