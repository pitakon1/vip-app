"""AI 应用预留 Provider（OpenAI 兼容接口）。

对外暴露 AI 能力（智能问答、语义检索/客服）的统一入口。
当前为「接口预留 + 可运行」：配置 OPENAI_API_KEY 后走真实 chat/completions，
否则返回保留提示（不影响主流程）。
"""
import httpx

from app.config import settings


class AIClient:
    def __init__(self) -> None:
        self.key = settings.OPENAI_API_KEY
        self.base = settings.OPENAI_API_BASE
        self.model = settings.OPENAI_MODEL

    @property
    def configured(self) -> bool:
        return bool(self.key)

    def chat(self, messages: list[dict], temperature: float = 0.3) -> dict:
        """对话式 AI。messages 形如 [{"role": "user|assistant", "content": "..."}]。"""
        if not self.configured:
            return {
                "ok": False,
                "status": "reserved",
                "message": "AI 接口已预留，未配置 OPENAI_API_KEY，暂不返回真实生成结果。",
                "model": self.model,
            }
        url = f"{self.base.strip('/')}/chat/completions"
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {self.key}"},
            json={"model": self.model, "messages": messages, "temperature": temperature},
            timeout=30,
        )
        if resp.status_code != 200:
            return {"ok": False, "status": "error", "message": resp.text[:500]}
        data = resp.json()
        return {
            "ok": True,
            "status": "ok",
            "model": self.model,
            "content": data["choices"][0]["message"]["content"],
        }


ai_client = AIClient()


def ai_health() -> dict:
    """描述已预留的 AI 能力与接线状态。"""
    return {
        "capabilities": [
            "contract-generation",  # 合同智能生成
            "property-search-assist",  # 找房问答
            "translate-assist",  # 翻译增强
            "auto-reply",  # 客户消息智能回复
        ],
        "configured": ai_client.configured,
        "model": ai_client.model,
    }