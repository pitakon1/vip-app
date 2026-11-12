"""本地开发启动入口：等价于 `uvicorn --reload`，并修复 Windows 下 reload 卡死。

为什么需要这个文件
------------------
uvicorn 在 Windows 上结束旧 worker 的方式是
`os.kill(child_pid, signal.CTRL_C_EVENT)` 再 `process.join()`。
当进程没有可用的交互式控制台（IDE/脚本/后台任务启动）时，这个 Ctrl+C 事件送不到
worker，reloader 会永久阻塞在 join()，表现为：

    WARNING: WatchFiles detected changes in 'app\\xxx.py'. Reloading...
    （然后没有 "Started server process"，旧代码继续服务，必须手动重启）

这里只在 win32 上把 BaseReload.restart 换成 `process.terminate()`
（Windows 上是 TerminateProcess，必定生效），watchfiles 监听、socket 复用等
其余行为保持不变；生产部署不走这里（Dockerfile 用 --workers）。

日志
----
同时写控制台和 `backend/logs/uvicorn-dev.log`，方便从任何方式启动后排查。
"""
from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG_FILE = ROOT / "logs" / "uvicorn-dev.log"


class _Tee:
    """把写入同时转发到控制台和日志文件。"""

    def __init__(self, *streams):
        self._streams = streams

    def write(self, data: str) -> int:
        for stream in self._streams:
            try:
                stream.write(data)
                stream.flush()
            except Exception:
                pass
        return len(data)

    def flush(self) -> None:
        for stream in self._streams:
            try:
                stream.flush()
            except Exception:
                pass

    def isatty(self) -> bool:
        return False


def _patch_windows_restart() -> None:
    """把 reload 重启从 CTRL_C_EVENT 改为 terminate()。"""
    import logging

    from uvicorn._subprocess import get_subprocess
    from uvicorn.supervisors.basereload import BaseReload

    logger = logging.getLogger("uvicorn.error")

    def _restart(self) -> None:
        self.is_restarting = False
        self.process.terminate()
        self.process.join()
        self.process = get_subprocess(
            config=self.config, target=self.target, sockets=self.sockets
        )
        self.process.start()
        # 写进日志文件，便于确认重载后新 worker 确实起来了
        logger.warning("dev_server: worker restarted, new pid=%s", self.process.pid)

    BaseReload.restart = _restart


def main() -> None:
    import uvicorn

    # 无论从哪个目录启动，都按 backend/ 作为工程根目录
    os.chdir(ROOT)
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    log_handle = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
    log_handle.write(f"\n===== {datetime.now():%Y-%m-%d %H:%M:%S} start =====\n")
    sys.stdout = _Tee(sys.__stdout__, log_handle)
    sys.stderr = _Tee(sys.__stderr__, log_handle)

    if sys.platform == "win32":
        _patch_windows_restart()

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        # 只监听应用代码，避免 log 文件自身变化触发循环重载
        reload_dirs=[str(ROOT / "app")],
    )


if __name__ == "__main__":
    main()
