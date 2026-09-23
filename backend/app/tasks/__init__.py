"""Celery 任务包。

注意：每个任务模块都必须在此导入 —— 模块级 `@shared_task` 装饰器在导入时才会
执行，任务才注册到 worker；漏掉某个模块会让 beat 投递时报
"Received unregistered task"（每日备份曾因此静默失效）。

这里用 `from . import <module>` 而不是 `from .x import *`：注册靠的是「导入」
这一副作用，符号本身不需要再导出到本命名空间，通配导入只会顺带污染命名空间，
也让"到底用到哪些符号"无法被静态检查发现。
"""
from . import (  # noqa: F401 - 导入即注册任务，模块名本身不被引用
    backup_tasks,
    event_tasks,
    freshness_tasks,
    notification_tasks,
    reconciliation_tasks,
    reminder_tasks,
)