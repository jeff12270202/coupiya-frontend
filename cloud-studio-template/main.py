#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================================
# main.py —— 极速AI极客创作空间 ·「自动化保姆」模板（Cloud Studio UGC-AI-Cinema-Template）
# ----------------------------------------------------------------------------
# 全球创作者体验（SOP 39/40）：
#   1. 把您的 AI 生成 Python 代码粘贴到下方 user_creations() 的标记区；
#   2. 点击「运行」；
#   3. 脚本自动检测成片 output.mp4 → 通过平台接口换取 COS 预签名上传地址
#      （密钥始终留在平台服务端，工作区内不落地任何密钥）→ 直传 COS；
#   4. 终端打印蓝绿色可点击发布链接 → 单击 → 官网发布确认页（字段已自动填好）
#      → 一键上架全球电影墙。
#
# 环境变量（创建空间时由平台注入，无需填写）：
#   USER_ID               网站账号 ID
#   COUPIYA_API_BASE      平台 API 基址（默认 https://api.coupiya.com）
#   COUPIYA_PUBLISH_TOKEN 发布令牌（HMAC，身份凭证，勿外泄）
#   COUPIYA_SITE_BASE     官网基址（默认 https://coupiya.com）
#   OUTPUT_VIDEO          成片文件名（默认 output.mp4）
# ============================================================================

import glob
import os
import sys
import time
import urllib.parse

import requests

API_BASE = os.environ.get('COUPIYA_API_BASE', 'https://api.coupiya.com').rstrip('/')
SITE_BASE = os.environ.get('COUPIYA_SITE_BASE', 'https://coupiya.com').rstrip('/')
PUBLISH_TOKEN = os.environ.get('COUPIYA_PUBLISH_TOKEN', '')
USER_ID = os.environ.get('USER_ID', '')
OUTPUT_VIDEO = os.environ.get('OUTPUT_VIDEO', 'output.mp4')
MAX_VIDEO_BYTES = 200 * 1024 * 1024  # 200MB，与平台一致

C_GREEN = '\033[92m'
C_CYAN = '\033[96m'
C_YELLOW = '\033[93m'
C_RED = '\033[91m'
C_BOLD = '\033[1m'
C_END = '\033[0m'


def banner() -> None:
    print()
    print(C_BOLD + C_CYAN + '=' * 66 + C_END)
    print(C_BOLD + C_CYAN + '   🚀 极速AI极客创作空间 · 全球 UGC AI 影视生产车间' + C_END)
    print(C_BOLD + C_CYAN + '=' * 66 + C_END)
    print('   1) 把您的 AI 生成代码粘贴到 user_creations() 标记区')
    print('   2) 点击右上角「运行」')
    print('   3) 点击终端里的发布链接 → 确认上架全球电影墙')
    print()


def check_env() -> None:
    status = {
        'USER_ID': '✅' if USER_ID else '❌ 缺失（创建空间时自动注入）',
        'COUPIYA_API_BASE': f'✅ {API_BASE}',
        'COUPIYA_PUBLISH_TOKEN': '✅' if PUBLISH_TOKEN else '❌ 缺失',
    }
    print(C_YELLOW + '【环境检查】（只显示状态，不显示密钥）' + C_END)
    for k, v in status.items():
        print(f'   {k}: {v}')
    print()


# ============================================================================
# ⬇️⬇️⬇️ 用户代码区：把您的 AI 生成代码粘贴到下面 ⬇️⬇️⬇️
# ============================================================================
def user_creations() -> None:
    """
    在这里粘贴您通过 ChatGPT / DeepSeek / Claude / WorkBuddy 等生成的
    AI 视频 Python 代码。

    要求：代码运行结束后，把成片保存为 output.mp4（可改名，见 OUTPUT_VIDEO）。
    示例（moviepy）：
        from moviepy.editor import TextClip, CompositeVideoClip
        clip = TextClip('HELLO AI CINEMA', fontsize=120, color='white', size=(1280, 720), duration=5)
        clip.write_videofile('output.mp4', fps=24)
    """
    # ↓↓↓↓↓ 在此粘贴您的代码（删除下方示例提示行） ↓↓↓↓↓
    print('👋 请将您的 AI 生成代码粘贴到 user_creations() 内，运行后将自动发布。')
    # ↑↑↑↑↑ 粘贴结束 ↑↑↑↑↑


# ⬆️⬆️⬆️ 用户代码区结束 ⬆️⬆️⬆️
# ============================================================================


def find_video() -> str:
    """查找成片：优先 OUTPUT_VIDEO，其次常见命名。"""
    candidates = [OUTPUT_VIDEO, 'output.mp4', 'output.webm', 'out.mp4', 'video.mp4']
    for name in candidates:
        if os.path.isfile(name):
            return name
    # 兜底：工作区里最新的视频文件
    found = sorted(glob.glob('*.mp4') + glob.glob('*.webm') + glob.glob('*.mov'), key=os.path.getmtime, reverse=True)
    if found:
        return found[0]
    return ''


def get_upload_ticket(filename: str) -> dict:
    """向平台换取 COS 预签名上传地址（密钥不落地工作区）。"""
    if not PUBLISH_TOKEN:
        raise RuntimeError('COUPIYA_PUBLISH_TOKEN 缺失，无法发布')
    resp = requests.post(
        f'{API_BASE}/api/ai/ugc-upload-ticket',
        headers={'Content-Type': 'application/json', 'x-coupiya-publish-token': PUBLISH_TOKEN},
        json={'filename': filename},
        timeout=20,
    )
    data = resp.json() if resp.headers.get('content-type', '').startswith('application/json') else {}
    if not resp.ok or not data.get('uploadUrl'):
        code = data.get('code', '')
        message = data.get('message', f'HTTP {resp.status_code}')
        request_id = data.get('requestId', '')
        raise RuntimeError(f'获取上传地址失败[{code}]: {message}（requestId={request_id}）')
    return data


def upload_to_cos(upload_url: str, path: str) -> None:
    """直传 COS（预签名 PUT，无需任何密钥）。"""
    size = os.path.getsize(path)
    if size <= 0:
        raise RuntimeError('视频文件为空')
    if size > MAX_VIDEO_BYTES:
        raise RuntimeError(f'视频超过 200MB 上限（当前 {size / 1024 / 1024:.1f}MB）')
    with open(path, 'rb') as f:
        resp = requests.put(upload_url, data=f, headers={'Content-Type': 'video/mp4'}, timeout=1800)
    if resp.status_code not in (200, 204):
        raise RuntimeError(f'上传 COS 失败（HTTP {resp.status_code}）')


def print_confirm_link(public_url: str, title: str) -> None:
    """终端打印可点击的发布确认链接（SOP 39）。"""
    query = urllib.parse.urlencode({
        'video_url': public_url,
        'title': title,
        'user_id': USER_ID,
    })
    link = f'{SITE_BASE}/publish-confirm?{query}'
    print()
    print(C_BOLD + C_GREEN + '✅ 视频生成完毕！点击下方链接，打开官网表单完成最后发布：' + C_END)
    print()
    print(C_BOLD + C_CYAN + link + C_END)
    print()
    print(C_YELLOW + '发布后将自动完成：余额扣费 → 腾讯云 VOD 转码 → WordPress 上架 → 全球电影墙置顶' + C_END)
    print()


def auto_publish() -> None:
    """自动化保姆：检测成片 → 上传 COS → 打印发布链接。"""
    print(C_BOLD + '🔍 正在检测成片文件…' + C_END)
    path = find_video()
    if not path:
        print(C_RED + '❌ 未找到视频成片。请确认您的代码已生成 output.mp4（或设置 OUTPUT_VIDEO）。' + C_END)
        sys.exit(1)
    print(f'   找到成片：{path}（{os.path.getsize(path) / 1024 / 1024:.1f}MB）')

    print('☁️  正在向平台换取 COS 上传地址…')
    ticket = get_upload_ticket(os.path.basename(path))

    print('☁️  正在直传腾讯云 COS（密钥全程在平台服务端）…')
    upload_to_cos(ticket['uploadUrl'], path)

    title = os.path.splitext(os.path.basename(path))[0]
    print_confirm_link(ticket['publicUrl'], title)


def main() -> None:
    banner()
    check_env()
    user_creations()
    auto_publish()


if __name__ == '__main__':
    main()
