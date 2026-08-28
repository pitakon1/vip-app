"""支付渠道收款账号集中配置。

═══════════════════════════════════════════════════════════════════════
如何修改账号：直接修改下方各变量的默认值，保存后重启后端即可生效。

  例：把 PromptPay 收款手机号改为 0891234567
      PROMPTPAY_TARGET = _env("PROMPTPAY_TARGET", "0891234567")

说明：
  1. 每个变量都支持同名环境变量覆盖（如设置系统环境变量 PROMPTPAY_TARGET），
     便于部署到不同环境时不把密钥写死在代码里。
  2. 生产环境建议通过环境变量注入，避免敏感信息入库 / 提交到仓库。
═══════════════════════════════════════════════════════════════════════
"""
import os


def _env(key: str, default: str = "") -> str:
    """读取环境变量，未设置时返回默认值。"""
    return os.getenv(key, default)


# ═══════════ PromptPay（泰国本地，推荐）═══════════
# 泰国用户扫码支付，QR 码由本地 EMVCo 算法生成，无需第三方 API。
PROMPTPAY_TARGET = _env("PROMPTPAY_TARGET", "0812345678")            # 收款方标识：手机号 / 国民ID / 税号
PROMPTPAY_TARGET_TYPE = _env("PROMPTPAY_TARGET_TYPE", "phone")       # 标识类型：phone / national_id / tax_id
PROMPTPAY_MERCHANT_NAME = _env("PROMPTPAY_MERCHANT_NAME", "VIP APP")  # QR 码上显示的商户名（≤25 字符）

# ═══════════ Stripe（国际卡）═══════════
STRIPE_SECRET_KEY = _env("STRIPE_SECRET_KEY", "sk_test_default_dev_key")          # 密钥：测试 sk_test_xxx，生产 sk_live_xxx
STRIPE_WEBHOOK_SECRET = _env("STRIPE_WEBHOOK_SECRET", "whsec_default_dev_secret")  # 回调验签密钥 whsec_xxx

# ═══════════ 微信支付（国内）═══════════
WECHAT_MERCHANT_ID = _env("WECHAT_MERCHANT_ID", "default_dev_mchid")  # 商户号 mchid
WECHAT_API_KEY = _env("WECHAT_API_KEY", "default_dev_api_v3_key")     # APIv3 密钥（32 字节），用于回调解密
WECHAT_APP_ID = _env("WECHAT_APP_ID", "default_dev_appid")            # 公众号 / 小程序 AppID
WECHAT_CERT_SERIAL_NO = _env("WECHAT_CERT_SERIAL_NO", "")             # 商户证书序列号
WECHAT_PRIVATE_KEY = _env("WECHAT_PRIVATE_KEY", "")                   # 商户私钥（PEM 文本）
WECHAT_PLATFORM_CERT = _env("WECHAT_PLATFORM_CERT", "")               # 微信平台证书（验签回调用）

# ═══════════ 支付宝 ═══════════
ALIPAY_APP_ID = _env("ALIPAY_APP_ID", "default_dev_appid")  # 应用 AppID
ALIPAY_PRIVATE_KEY = _env("ALIPAY_PRIVATE_KEY", "")         # 应用私钥（PEM 或裸 base64）
ALIPAY_PUBLIC_KEY = _env("ALIPAY_PUBLIC_KEY", "")           # 支付宝公钥（验签回调用）
ALIPAY_SIGN_TYPE = _env("ALIPAY_SIGN_TYPE", "RSA2")         # 签名类型 RSA2

# ═══════════ Wise（跨境转账）═══════════
WISE_API_KEY = _env("WISE_API_KEY", "default_dev_api_key")  # Wise API 密钥
WISE_PROFILE_ID = _env("WISE_PROFILE_ID", "")               # Wise 商户 profile ID
