"""结构化日志配置模块。

使用 structlog 配置 JSON 格式日志，支持 request_id 追踪。
"""
import logging
import sys

import structlog

from app.config import settings

# 标记是否已配置
_configured = False


def _log_level() -> int:
    """日志级别跟随 DEBUG 配置（此前硬编码 INFO，DEBUG 下看不到调试日志）。"""
    return logging.DEBUG if settings.DEBUG else logging.INFO


def configure_logging() -> None:
    """配置 structlog 结构化日志。

    输出 JSON 格式日志，包含时间戳、日志级别、事件和 request_id 上下文。
    """
    global _configured
    if _configured:
        return

    level = _log_level()
    timestamper = structlog.processors.TimeStamper(fmt="iso")

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        timestamper,
    ]

    structlog.configure(
        processors=shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # 配置标准库 logging，将 structlog 的日志转发到标准输出
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    # 设置 structlog 的标准库处理器，统一日志格式
    processor = structlog.stdlib.ProcessorFormatter(
        processor=structlog.processors.JSONRenderer(),
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(processor)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(level)

    _configured = True


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """获取一个配置好的 structlog 日志记录器。

    Args:
        name: 日志记录器名称，通常传入 __name__。

    Returns:
        配置好的 structlog 日志记录器。
    """
    if not _configured:
        configure_logging()
    return structlog.get_logger(name)
