"""
将 DESIGN.md 转为 GitHub 风格 PDF（使用 Chrome headless 模式）
不需要额外的依赖（已检测到 Chrome）
"""
import subprocess
import sys
import time
from pathlib import Path
import markdown

WORKSPACE = Path(r"e:\work\app\vip app")
MD_FILE = WORKSPACE / "DESIGN.md"
HTML_FILE = WORKSPACE / "DESIGN.html"
PDF_FILE = WORKSPACE / "DESIGN.pdf"

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def find_chrome() -> str:
    """查找 Chrome 可执行文件"""
    for p in CHROME_PATHS:
        if Path(p).exists():
            return p
    # 尝试从环境变量查找
    result = subprocess.run(["where.exe", "chrome"], capture_output=True, text=True)
    if result.returncode == 0:
        return result.stdout.strip().splitlines()[0]
    raise FileNotFoundError("未找到 Chrome，请安装或手动指定路径")


def read_css() -> str:
    """GitHub 风格 CSS（适配 Chrome 打印）"""
    return """
@page {
    size: A4;
    margin: 2cm 1.5cm 2.2cm 1.5cm;
}

@page :first {
    margin-top: 1cm;
}

* { box-sizing: border-box; }

body {
    font-family: "Microsoft YaHei", "Noto Sans Thai", "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #24292e;
    max-width: 100%;
    margin: 0;
    padding: 0;
}

h1 {
    font-size: 22pt;
    font-weight: 600;
    color: #24292e;
    border-bottom: 2px solid #e1e4e8;
    padding-bottom: 0.3em;
    margin-top: 1.5em;
    margin-bottom: 0.6em;
    page-break-before: always;
    page-break-after: avoid;
}

h1:first-of-type {
    page-break-before: avoid;
}

h2 {
    font-size: 17pt;
    font-weight: 600;
    color: #24292e;
    border-bottom: 1px solid #e1e4e8;
    padding-bottom: 0.3em;
    margin-top: 1.3em;
    margin-bottom: 0.5em;
    page-break-after: avoid;
}

h3 {
    font-size: 13.5pt;
    font-weight: 600;
    color: #24292e;
    margin-top: 1.1em;
    margin-bottom: 0.4em;
    page-break-after: avoid;
}

h4 {
    font-size: 11.5pt;
    font-weight: 600;
    color: #24292e;
    margin-top: 0.9em;
    margin-bottom: 0.3em;
    page-break-after: avoid;
}

h5, h6 {
    font-size: 10.5pt;
    font-weight: 600;
    color: #586069;
    margin-top: 0.7em;
    margin-bottom: 0.3em;
    page-break-after: avoid;
}

p {
    margin: 0.5em 0 0.8em 0;
    text-align: justify;
    orphans: 3;
    widows: 3;
}

a {
    color: #0366d6;
    text-decoration: none;
}

blockquote {
    margin: 0.8em 0;
    padding: 0.5em 1em;
    color: #6a737d;
    border-left: 4px solid #dfe2e5;
    background: #f6f8fa;
    border-radius: 3px;
    page-break-inside: avoid;
}

blockquote > :first-child { margin-top: 0; }
blockquote > :last-child { margin-bottom: 0; }

ul, ol {
    margin: 0.5em 0 0.8em 0;
    padding-left: 1.8em;
}

li {
    margin: 0.2em 0;
}

li > p { margin: 0.2em 0; }

code {
    font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
    font-size: 0.88em;
    background: rgba(27, 31, 35, 0.08);
    color: #24292e;
    padding: 0.15em 0.4em;
    border-radius: 3px;
    word-wrap: break-word;
}

pre {
    font-family: "Cascadia Code", "Consolas", "Courier New", monospace;
    font-size: 9pt;
    line-height: 1.5;
    background: #f6f8fa;
    color: #24292e;
    padding: 12px 14px;
    border-radius: 4px;
    overflow: auto;
    border: 1px solid #e1e4e8;
    margin: 0.8em 0;
    page-break-inside: avoid;
    white-space: pre-wrap;
    word-wrap: break-word;
}

pre code {
    background: transparent;
    padding: 0;
    font-size: 100%;
    white-space: pre-wrap;
}

table {
    border-collapse: collapse;
    margin: 0.8em 0;
    width: 100%;
    font-size: 9.5pt;
    page-break-inside: avoid;
}

table thead { background: #f6f8fa; }

table th, table td {
    padding: 6px 10px;
    border: 1px solid #dfe2e5;
    text-align: left;
    vertical-align: top;
}

table th {
    font-weight: 600;
    background: #f6f8fa;
    color: #24292e;
}

table tr:nth-child(even) td { background: #f9fafb; }

hr {
    border: 0;
    border-top: 1px solid #e1e4e8;
    height: 0;
    margin: 1.5em 0;
}

img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0.8em auto;
    page-break-inside: avoid;
}

strong { color: #24292e; font-weight: 600; }

/* 代码高亮（python-markdown codehilite） */
.highlight { background: #f6f8fa; }
.highlight .k { color: #d73a49; font-weight: 600; }  /* keyword */
.highlight .kn { color: #d73a49; }                  /* keyword.namespace */
.highlight .s { color: #032f62; }                   /* string */
.highlight .s2 { color: #032f62; }                  /* string.double */
.highlight .s1 { color: #032f62; }                  /* string.single */
.highlight .c1 { color: #6a737d; font-style: italic; }  /* comment */
.highlight .c { color: #6a737d; font-style: italic; }
.highlight .n { color: #24292e; }                   /* name */
.highlight .nb { color: #005cc5; }                  /* name.builtin */
.highlight .nf { color: #6f42c1; }                  /* name.function */
.highlight .nc { color: #6f42c1; font-weight: 600; }  /* name.class */
.highlight .o { color: #d73a49; }                   /* operator */
.highlight .mi { color: #005cc5; }                  /* number.integer */
.highlight .mf { color: #005cc5; }                  /* number.float */
.highlight .kc { color: #005cc5; }                  /* keyword.constant */
"""


def md_to_html(md_text: str, css: str, title: str = "") -> str:
    """Markdown -> HTML（带样式）"""
    md = markdown.Markdown(
        extensions=[
            "extra",
            "codehilite",
            "sane_lists",
            "fenced_code",
            "tables",
            "attr_list",
        ],
        extension_configs={
            "codehilite": {
                "css_class": "highlight",
                "guess_lang": False,
            },
        },
    )
    body = md.convert(md_text)

    # 未指定标题时，从首个 H1 提取
    if not title:
        for line in md_text.splitlines():
            stripped = line.strip()
            if stripped.startswith("# "):
                title = stripped[2:].strip()
                break
        if not title:
            title = "文档"

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>{css}</style>
</head>
<body>
{body}
</body>
</html>"""


def main():
    # 支持命令行参数：python md_to_pdf.py [输入.md]
    # 默认转换 DESIGN.md
    md_arg = sys.argv[1] if len(sys.argv) > 1 else "DESIGN.md"
    md_file = (WORKSPACE / md_arg).resolve() if not Path(md_arg).is_absolute() else Path(md_arg)

    if not md_file.exists():
        print(f"❌ 找不到文件: {md_file}", file=sys.stderr)
        sys.exit(1)

    # 推导输出路径：同名 .html / .pdf
    html_file = md_file.with_suffix(".html")
    pdf_file = md_file.with_suffix(".pdf")

    chrome = find_chrome()
    print(f"✓ 找到 Chrome: {chrome}")

    print(f"📖 读取 Markdown: {md_file}")
    md_text = md_file.read_text(encoding="utf-8")
    print(f"   共 {len(md_text):,} 字符 / {len(md_text.splitlines()):,} 行")

    print("🔄 Markdown → HTML ...")
    css = read_css()
    html = md_to_html(md_text, css)
    html_file.write_text(html, encoding="utf-8")
    print(f"   HTML 已写入: {html_file}")

    print("🖨️  Chrome 生成 PDF ...")
    # Chrome headless 命令
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        f"--print-to-pdf={pdf_file}",
        "--print-to-pdf-no-header",  # 去掉浏览器自带的页眉页脚
        f"file:///{html_file.as_posix()}",
    ]
    print(f"   执行命令: {' '.join(cmd[:3])} ...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        print(f"❌ Chrome 返回错误: {result.returncode}", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)

    # 等待 PDF 写入完成
    time.sleep(0.5)

    if pdf_file.exists():
        size_kb = pdf_file.stat().st_size / 1024
        print(f"✅ 完成! 文件大小: {size_kb:.1f} KB")
        print(f"   路径: {pdf_file}")
    else:
        print("❌ PDF 文件未生成", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
