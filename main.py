#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║     ██████╗ ██████╗ ██╗   ██╗██████╗ ██╗██╗   ██╗ █████╗                     ║
║    ██╔════╝██╔═══██╗██║   ██║██╔══██╗██║╚██╗ ██╔╝██╔══██╗                    ║
║    ██║     ██║   ██║██║   ██║██████╔╝██║ ╚████╔╝ ███████║                    ║
║    ██║     ██║   ██║██║   ██║██╔═══╝ ██║  ╚██╔╝  ██╔══██║                    ║
║    ╚██████╗╚██████╔╝╚██████╔╝██║     ██║   ██║   ██║  ██║                    ║
║     ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝   ╚═╝   ╚═╝  ╚═╝                    ║
║                                                                              ║
║         极速 AI 极客创作空间 · Global AI Cinema Production Pipeline           ║
║                    "Write Code. Click Run. Cinema is Born."                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

全球创作者指南 | Global Creator Guide
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  欢迎来到您专属的 AI 影视生产车间！
  您不需要高性能显卡，不需要安装任何软件，这里已经为您准备好一切。

  您只需要做一件事：
     把 AI（ChatGPT / DeepSeek / Claude）生成的 Python 代码粘贴进来，
     点击 "运行"，您的作品就会自动发布到 coupiya.com 全球电影墙！

  以下是一个万能主控脚本，您可以直接修改配置区域，或完全替换为自己的代码。
  所有核心功能都以函数形式提供，您可以自由组合调用。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

运行环境自动检测：
  • 用户身份：从环境变量 COUPIYA_USER_ID 自动注入
  • 个人云盘：/home/coupiya_workspace (5GB 独立空间)
  • 输出目录：/home/coupiya_workspace/output/
  • 资产目录：/home/coupiya_workspace/assets/
"""

import os
import sys
import json
import time
import uuid
import hashlib
import logging
import subprocess
import traceback
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field, asdict
from concurrent.futures import ThreadPoolExecutor, as_completed

# ============================================================================
# 0. 环境自检 & 依赖自动安装
# ============================================================================

REQUIRED_PACKAGES = [
    "requests",
    "Pillow",
]

_tz_utc8 = timezone(timedelta(hours=8))


def _auto_install_deps():
    """静默安装缺失的依赖包。"""
    for pkg in REQUIRED_PACKAGES:
        try:
            __import__(pkg)
        except ImportError:
            print(f"[BOOTSTRAP] 正在安装依赖: {pkg} ...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])
    print("[BOOTSTRAP] ✅ 所有依赖就绪")


_auto_install_deps()

import requests

# ============================================================================
# 1. 全局配置中心（修改这里即可控制一切）
# ============================================================================


@dataclass
class CoupiyaConfig:
    """
    全局配置。所有可调参数集中于此。
    您可以通过环境变量覆盖任何字段（前缀 COUPIYA_）。
    例如：export COUPIYA_DRAMA_EPISODES=20
    """

    # ── 身份 ──
    user_id: str = field(
        default_factory=lambda: os.getenv("COUPIYA_USER_ID", "anonymous")
    )
    user_token: str = field(
        default_factory=lambda: os.getenv("COUPIYA_USER_TOKEN", "")
    )

    # ── API 端点 ──
    api_base_url: str = field(
        default_factory=lambda: os.getenv(
            "COUPIYA_API_BASE", "https://api.coupiya.com"
        )
    )
    publish_movie_endpoint: str = "/api/ai/publish-vod-movie"
    publish_series_endpoint: str = "/api/ai/publish-vod-series"

    # ── AI 服务密钥 ──
    deepseek_api_key: str = field(
        default_factory=lambda: os.getenv("DEEPSEEK_API_KEY", "")
    )
    deepseek_base_url: str = field(
        default_factory=lambda: os.getenv(
            "DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"
        )
    )
    openai_api_key: str = field(
        default_factory=lambda: os.getenv("OPENAI_API_KEY", "")
    )
    openai_base_url: str = field(
        default_factory=lambda: os.getenv(
            "OPENAI_BASE_URL", "https://api.openai.com/v1"
        )
    )
    replicate_api_token: str = field(
        default_factory=lambda: os.getenv("REPLICATE_API_TOKEN", "")
    )
    pollinations_base_url: str = field(
        default_factory=lambda: os.getenv(
            "POLLINATIONS_BASE_URL", "https://image.pollinations.ai"
        )
    )

    # ── 腾讯云 Workbuddy ──
    tencent_workbuddy_endpoint: str = field(
        default_factory=lambda: os.getenv(
            "TENCENT_WORKBUDDY_ENDPOINT",
            "https://workbuddy.cloud.tencent.com/api/v1",
        )
    )
    tencent_secret_id: str = field(
        default_factory=lambda: os.getenv("TENCENT_SECRET_ID", "")
    )
    tencent_secret_key: str = field(
        default_factory=lambda: os.getenv("TENCENT_SECRET_KEY", "")
    )

    # ── 连续剧配置 ──
    drama_model: str = field(
        default_factory=lambda: os.getenv("COUPIYA_DRAMA_MODEL", "deepseek-chat")
    )
    drama_episodes: int = int(os.getenv("COUPIYA_DRAMA_EPISODES", "10"))
    drama_parallel: bool = (
        os.getenv("COUPIYA_DRAMA_PARALLEL", "true").lower() == "true"
    )
    drama_max_workers: int = int(os.getenv("COUPIYA_DRAMA_MAX_WORKERS", "5"))

    # ── 视频生成配置 ──
    video_provider: str = field(
        default_factory=lambda: os.getenv(
            "COUPIYA_VIDEO_PROVIDER", "workbuddy"
        )
    )
    video_model: str = field(
        default_factory=lambda: os.getenv("COUPIYA_VIDEO_MODEL", "default")
    )
    video_duration: int = int(os.getenv("COUPIYA_VIDEO_DURATION", "10"))
    video_resolution: str = field(
        default_factory=lambda: os.getenv("COUPIYA_VIDEO_RESOLUTION", "1080p")
    )
    video_fps: int = int(os.getenv("COUPIYA_VIDEO_FPS", "24"))

    # ── 海报生成 ──
    poster_provider: str = field(
        default_factory=lambda: os.getenv("COUPIYA_POSTER_PROVIDER", "pollinations")
    )
    poster_width: int = int(os.getenv("COUPIYA_POSTER_WIDTH", "720"))
    poster_height: int = int(os.getenv("COUPIYA_POSTER_HEIGHT", "1080"))

    # ── 工作目录 ──
    workspace_dir: str = field(
        default_factory=lambda: os.getenv(
            "COUPIYA_WORKSPACE", "/home/coupiya_workspace"
        )
    )

    # ── 全局开关 ──
    auto_publish: bool = (
        os.getenv("COUPIYA_AUTO_PUBLISH", "true").lower() == "true"
    )
    dry_run: bool = os.getenv("COUPIYA_DRY_RUN", "false").lower() == "true"
    verbose: bool = os.getenv("COUPIYA_VERBOSE", "true").lower() == "true"
    language: str = field(
        default_factory=lambda: os.getenv("COUPIYA_LANGUAGE", "zh")
    )

    def to_env_dict(self) -> Dict[str, str]:
        """导出当前配置为环境变量字典（方便子进程继承）。"""
        result = {}
        for k, v in asdict(self).items():
            if v is not None and v != "":
                result[f"COUPIYA_{k.upper()}"] = str(v)
        return result

    @classmethod
    def from_args(cls, **overrides) -> "CoupiyaConfig":
        """创建配置实例，支持运行时参数覆盖。"""
        instance = cls()
        for k, v in overrides.items():
            if hasattr(instance, k) and v is not None:
                setattr(instance, k, v)
        return instance


# 全局单例
CONFIG = CoupiyaConfig()

# ============================================================================
# 2. 日志系统
# ============================================================================


def _setup_logging(verbose: bool = True) -> logging.Logger:
    fmt = "[%(asctime)s] %(levelname)-7s %(message)s" if verbose else "%(message)s"
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format=fmt,
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )
    return logging.getLogger("Coupiya")


logger = _setup_logging(CONFIG.verbose)

# ============================================================================
# 3. 工作空间初始化
# ============================================================================


def init_workspace() -> Dict[str, Path]:
    """创建并返回所有必要的工作目录。"""
    base = Path(CONFIG.workspace_dir)
    dirs = {
        "workspace": base,
        "output": base / "output",
        "assets": base / "assets",
        "scripts": base / "scripts",
        "posters": base / "posters",
        "temp": base / "temp",
        "logs": base / "logs",
    }
    for name, path in dirs.items():
        path.mkdir(parents=True, exist_ok=True)
        logger.debug(f"📁 {name}: {path}")
    logger.info("✅ 工作空间就绪")
    return dirs


WORKSPACE = init_workspace()

# ============================================================================
# 4. 核心工具函数
# ============================================================================


def generate_trace_id() -> str:
    """生成全局唯一的追踪 ID。"""
    return f"{int(time.time()*1000)}-{uuid.uuid4().hex[:8]}"


def timestamp_utc8() -> str:
    """返回东八区 ISO 时间戳字符串。"""
    return datetime.now(_tz_utc8).isoformat(timespec="seconds")


def safe_json_dumps(obj: Any, indent: int = 2) -> str:
    """安全的 JSON 序列化。"""
    return json.dumps(obj, ensure_ascii=False, indent=indent, default=str)


def download_file(url: str, dest: Path, timeout: int = 120) -> bool:
    """下载文件到指定路径。返回是否成功。"""
    try:
        logger.info(f"⬇  下载: {url} -> {dest}")
        resp = requests.get(url, stream=True, timeout=timeout)
        resp.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        logger.info(f"✅ 下载完成: {dest} ({dest.stat().st_size} bytes)")
        return True
    except Exception as e:
        logger.error(f"❌ 下载失败: {e}")
        return False


# ============================================================================
# 5. AI 文本生成（大语言模型接口）
# ============================================================================


class AITextGenerator:
    """
    统一的 AI 文本生成接口。
    支持：DeepSeek, OpenAI, 以及任何兼容 OpenAI Chat Completions 的 API。
    """

    def __init__(self, config: CoupiyaConfig = CONFIG):
        self.config = config

    def _openai_chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "deepseek-chat",
        temperature: float = 0.8,
        max_tokens: int = 4096,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> Optional[str]:
        """通用 OpenAI-compatible Chat Completions 调用。"""
        key = api_key or self.config.deepseek_api_key or self.config.openai_api_key
        url = (base_url or self.config.deepseek_base_url).rstrip("/") + "/chat/completions"

        if not key:
            logger.warning("⚠️  未设置 API Key，跳过 AI 文本生成")
            return None

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

        try:
            logger.info(f"🤖 调用 {model} ...")
            resp = requests.post(url, json=payload, headers=headers, timeout=120)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            logger.info(f"✅ {model} 返回 {len(content)} 字符")
            return content
        except Exception as e:
            logger.error(f"❌ AI 文本生成失败: {e}")
            return None

    def generate_script(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> Optional[str]:
        """单次文本生成。"""
        messages = [
            {
                "role": "system",
                "content": system_prompt
                or "你是一位世界顶级的影视编剧和创意导演。用专业、细腻的笔触进行创作。",
            },
            {"role": "user", "content": prompt},
        ]
        return self._openai_chat(messages, model=model or self.config.drama_model)

    def generate_drama_scripts(
        self,
        concept: str,
        episodes: Optional[int] = None,
    ) -> Optional[List[Dict[str, str]]]:
        """
        生成多集连续剧剧本。
        返回列表，每项 {'episode': 1, 'title': '...', 'script': '...', 'prompt': '...'}
        """
        n_episodes = episodes or self.config.drama_episodes

        # 第一步：生成大纲
        outline_prompt = f"""请为一部连续剧写一份详细的分集大纲。

核心概念：{concept}

要求：
- 共 {n_episodes} 集
- 每集包含：集数、标题（中英文）、一句话概要、该集的核心视觉提示词（用于AI视频生成，英文，详细描述画面风格/色调/构图/关键元素）

返回严格的 JSON 数组格式：
[
  {{"episode": 1, "title_cn": "第1集标题", "title_en": "Ep1 Title", "synopsis": "概要", "visual_prompt": "Cinematic shot, ..."}},
  ...
]

只返回 JSON，不要附带其他文字。"""

        raw = self.generate_script(outline_prompt)
        if not raw:
            return None

        # 清理 JSON 响应
        raw = raw.strip()
        if raw.startswith("```"):
            # 去掉 markdown 代码块标记
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        try:
            episodes_data = json.loads(raw)
        except json.JSONDecodeError:
            logger.error(f"❌ JSON 解析失败，原始返回:\n{raw[:500]}")
            return None

        logger.info(f"✅ 剧本大纲生成完成，共 {len(episodes_data)} 集")

        # 第二步（可选）：为每集生成详细剧本
        detailed_scripts = []
        for ep in episodes_data:
            ep_num = ep.get("episode", len(detailed_scripts) + 1)
            ep_title = ep.get("title_cn", ep.get("title_en", f"第{ep_num}集"))
            ep_synopsis = ep.get("synopsis", "")
            ep_visual = ep.get("visual_prompt", concept)

            # 生成详细场景描述
            detail_prompt = f"""基于以下概要，写一段 200 字以内的精炼场景描述，用作 AI 视频生成的提示词：

剧集标题：{ep_title}
概要：{ep_synopsis}

要求：以英文输出，描述镜头语言、色调、光影、景别、氛围。直接输出描述文本，不要加引号或前缀。"""

            detail_script = self.generate_script(detail_prompt)
            detailed_scripts.append(
                {
                    "episode": ep_num,
                    "title_cn": ep_title,
                    "title_en": ep.get("title_en", f"Episode {ep_num}"),
                    "synopsis": ep_synopsis,
                    "visual_prompt": ep_visual,
                    "detailed_prompt": detail_script or ep_visual,
                    "script_raw": detail_script,
                }
            )

        logger.info(f"✅ 全部 {len(detailed_scripts)} 集详细剧本生成完成")
        return detailed_scripts


# 全局实例
ai_text = AITextGenerator()


# ============================================================================
# 6. AI 图像/海报生成
# ============================================================================


class PosterGenerator:
    """
    海报生成器。
    支持 Pollinations、Replicate、DALL·E 等多种后端。
    """

    def __init__(self, config: CoupiyaConfig = CONFIG):
        self.config = config

    def generate_with_pollinations(
        self,
        prompt: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> Optional[str]:
        """
        使用 Pollinations.ai 生成海报（免费）。
        返回海报的 URL。
        """
        w = width or self.config.poster_width
        h = height or self.config.poster_height
        encoded_prompt = requests.utils.quote(prompt, safe="")
        url = f"{self.config.pollinations_base_url}/prompt/{encoded_prompt}?width={w}&height={h}&nologo=true&seed={int(time.time())}"

        logger.info(f"🎨 Pollinations 生成海报: {prompt[:80]}...")
        try:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            poster_path = WORKSPACE["posters"] / f"poster_{generate_trace_id()}.png"
            with open(poster_path, "wb") as f:
                f.write(resp.content)
            logger.info(f"✅ 海报已保存: {poster_path}")
            return str(poster_path)
        except Exception as e:
            logger.error(f"❌ 海报生成失败: {e}")
            return None

    def generate_poster(
        self,
        title: str,
        visual_style: str = "cinematic, movie poster, high quality",
    ) -> Optional[str]:
        """
        统一的海报生成入口。
        自动选择可用的后端。
        """
        prompt = f"Movie poster for '{title}'. {visual_style}. Professional cinema poster design, dramatic lighting, 4K quality."

        provider = self.config.poster_provider
        if provider == "pollinations" or not self.config.replicate_api_token:
            return self.generate_with_pollinations(prompt)

        # 可扩展其他 provider
        logger.warning(f"⚠️  未知海报后端: {provider}，降级到 Pollinations")
        return self.generate_with_pollinations(prompt)


poster_gen = PosterGenerator()


# ============================================================================
# 7. AI 视频生成（多后端支持）
# ============================================================================


class VideoGenerator:
    """
    视频生成器。
    支持：腾讯云 Workbuddy、Replicate、Runway 等后端。
    用户可自由扩展。
    """

    def __init__(self, config: CoupiyaConfig = CONFIG):
        self.config = config

    def generate_with_workbuddy(
        self,
        prompt: str,
        duration: Optional[int] = None,
        resolution: Optional[str] = None,
    ) -> Optional[str]:
        """
        调用腾讯云 Workbuddy 生成视频。
        返回生成的视频文件路径或 URL。
        """
        dur = duration or self.config.video_duration
        res = resolution or self.config.video_resolution

        logger.info(f"🎬 Workbuddy 生成视频 | 时长: {dur}s | 分辨率: {res}")
        logger.info(f"   Prompt: {prompt[:120]}...")

        endpoint = self.config.tencent_workbuddy_endpoint.rstrip("/")

        payload = {
            "prompt": prompt,
            "duration": dur,
            "resolution": res,
            "fps": self.config.video_fps,
            "user_id": self.config.user_id,
            "trace_id": generate_trace_id(),
        }

        headers = {"Content-Type": "application/json"}
        if self.config.tencent_secret_id:
            headers["X-TC-SecretId"] = self.config.tencent_secret_id
            headers["X-TC-SecretKey"] = self.config.tencent_secret_key

        try:
            resp = requests.post(
                f"{endpoint}/generate-video",
                json=payload,
                headers=headers,
                timeout=600,
            )
            resp.raise_for_status()
            result = resp.json()

            video_url = result.get("video_url") or result.get("url") or result.get("data", {}).get("url")
            if video_url:
                logger.info(f"✅ Workbuddy 视频生成成功: {video_url}")
                return video_url
            else:
                logger.error(f"❌ Workbuddy 返回数据异常: {result}")
                return None
        except Exception as e:
            logger.error(f"❌ Workbuddy 调用失败: {e}")
            return None

    def generate_with_replicate(
        self,
        prompt: str,
        model: str = "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
    ) -> Optional[str]:
        """通过 Replicate 生成视频。"""
        if not self.config.replicate_api_token:
            logger.warning("⚠️  未设置 Replicate API Token")
            return None

        logger.info(f"🎬 Replicate 生成视频: {prompt[:80]}...")
        try:
            import replicate

            os.environ["REPLICATE_API_TOKEN"] = self.config.replicate_api_token
            output = replicate.run(model, input={"input_image": None, "prompt": prompt})
            video_url = output if isinstance(output, str) else str(output)
            logger.info(f"✅ Replicate 视频生成成功: {video_url}")
            return video_url
        except Exception as e:
            logger.error(f"❌ Replicate 调用失败: {e}")
            return None

    def generate(
        self,
        prompt: str,
        provider: Optional[str] = None,
        **kwargs,
    ) -> Optional[str]:
        """统一的视频生成入口，自动路由到配置的后端。"""
        p = provider or self.config.video_provider

        if p == "workbuddy":
            return self.generate_with_workbuddy(prompt, **kwargs)
        elif p == "replicate":
            return self.generate_with_replicate(prompt, **kwargs)
        else:
            logger.error(f"❌ 未知视频后端: {p}")
            return None


video_gen = VideoGenerator()


# ============================================================================
# 8. 发布引擎（核心：推送到 WordPress）
# ============================================================================


class PublishEngine:
    """
    作品发布引擎。
    将视频/系列推送到 Next.js API -> VOD 转码 -> WordPress。
    """

    def __init__(self, config: CoupiyaConfig = CONFIG):
        self.config = config

    def _api_post(self, endpoint: str, payload: Dict[str, Any]) -> Optional[Dict]:
        """统一的 API POST 请求。"""
        url = self.config.api_base_url.rstrip("/") + endpoint
        headers = {
            "Content-Type": "application/json",
            "X-User-Id": self.config.user_id,
        }
        if self.config.user_token:
            headers["Authorization"] = f"Bearer {self.config.user_token}"

        logger.info(f"📡 POST {endpoint}")
        logger.debug(f"   Payload: {safe_json_dumps(payload)}")

        if self.config.dry_run:
            logger.info(f"🏜️  [DRY RUN] 跳过实际请求，payload 已记录")
            return {"dry_run": True, "status": "skipped"}

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=60)
            resp.raise_for_status()
            result = resp.json()
            logger.info(f"✅ API 响应: {safe_json_dumps(result)}")
            return result
        except Exception as e:
            logger.error(f"❌ 发布失败: {e}")
            return None

    def publish_movie(
        self,
        title: str,
        description: str,
        video_url: str,
        poster_url: Optional[str] = None,
        tags: Optional[List[str]] = None,
        category: str = "AI-Movies",
        extra_meta: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict]:
        """
        发布单部电影到 WordPress Movies 表。

        参数：
            title:       电影标题
            description: 电影描述
            video_url:   视频 URL（或本地路径，API 会上传）
            poster_url:  海报 URL
            tags:        标签列表
            category:    WordPress 分类
            extra_meta:  额外元数据（如导演、演员等）
        """
        payload = {
            "title": title,
            "description": description,
            "video_url": video_url,
            "poster_url": poster_url or "",
            "tags": tags or ["AI-Generated", "Coupiya"],
            "category": category,
            "author_user_id": self.config.user_id,
            "source": "cloud-studio",
            "trace_id": generate_trace_id(),
            "generated_at": timestamp_utc8(),
            "meta": extra_meta or {},
        }

        logger.info(f"🎬 发布电影: 《{title}》")
        return self._api_post(self.config.publish_movie_endpoint, payload)

    def publish_series(
        self,
        series_title: str,
        series_description: str,
        episodes: List[Dict[str, Any]],
        poster_url: Optional[str] = None,
        tags: Optional[List[str]] = None,
        category: str = "AI-TV-Shows",
    ) -> Optional[Dict]:
        """
        发布多集连续剧到 WordPress TV Shows 表。

        参数：
            series_title:       系列总标题
            series_description: 系列描述
            episodes:           剧集列表，每项含 title/video_url/description
            poster_url:         海报 URL
            tags:               标签列表
            category:           WordPress 分类
        """
        payload = {
            "series_title": series_title,
            "series_description": series_description,
            "episodes": episodes,
            "poster_url": poster_url or "",
            "tags": tags or ["AI-Generated", "Coupiya", "Series"],
            "category": category,
            "author_user_id": self.config.user_id,
            "source": "cloud-studio",
            "trace_id": generate_trace_id(),
            "total_episodes": len(episodes),
        }

        logger.info(f"📺 发布连续剧: 《{series_title}》共 {len(episodes)} 集")
        return self._api_post(self.config.publish_series_endpoint, payload)


publisher = PublishEngine()


# ============================================================================
# 9. 流水线编排（高层业务逻辑）
# ============================================================================


class CinemaPipeline:
    """
    AI 影视生产流水线。
    将"文本生成 → 视频生成 → 海报生成 → 发布"串联为一步操作。
    """

    def __init__(self, config: CoupiyaConfig = CONFIG):
        self.config = config

    # ------------------------------------------------------------------
    # 9.1 单部电影模式
    # ------------------------------------------------------------------

    def produce_movie(
        self,
        title: str,
        concept: str,
        visual_prompt: Optional[str] = None,
        auto_poster: bool = True,
        tags: Optional[List[str]] = None,
    ) -> bool:
        """
        一站式生成单部 AI 电影。

        流程：
          1. (可选) 用 AI 美化视觉提示词
          2. 生成视频
          3. (可选) 生成海报
          4. 发布到 WordPress
        """
        trace_id = generate_trace_id()
        logger.info("=" * 70)
        logger.info(f"🎬 开始创作电影 | Trace: {trace_id}")
        logger.info(f"   标题: 《{title}》")
        logger.info(f"   概念: {concept[:100]}...")
        logger.info("=" * 70)

        # Step 1: 视觉提示词
        if visual_prompt is None:
            logger.info("📝 使用 AI 生成视觉提示词...")
            visual_prompt = ai_text.generate_script(
                f"为一个 AI 视频生成器写一段详细的英文视觉提示词。主题：{concept}。描述镜头语言、色调、光影、构图。只输出提示词文本。"
            )
            if not visual_prompt:
                visual_prompt = concept
        logger.info(f"🎯 视觉提示词: {visual_prompt[:150]}...")

        # Step 2: 生成视频
        video_result = video_gen.generate(visual_prompt)
        if not video_result:
            logger.error("❌ 视频生成失败，流水线中止")
            return False

        # Step 3: 海报
        poster_result = None
        if auto_poster:
            poster_result = poster_gen.generate_poster(title, visual_prompt)

        # Step 4: 发布
        pub_result = publisher.publish_movie(
            title=title,
            description=concept,
            video_url=video_result,
            poster_url=poster_result,
            tags=tags,
            extra_meta={
                "visual_prompt": visual_prompt,
                "generator": self.config.video_provider,
                "trace_id": trace_id,
            },
        )

        if pub_result:
            logger.info("=" * 70)
            logger.info(f"🎉 恭喜！《{title}》创作完成并已发布！")
            logger.info(f"   前往 https://coupiya.com/blog 查看您的作品！")
            logger.info("=" * 70)
            return True
        return False

    # ------------------------------------------------------------------
    # 9.2 多集连续剧模式
    # ------------------------------------------------------------------

    def produce_drama_series(
        self,
        series_title: str,
        concept: str,
        episodes: Optional[int] = None,
        auto_poster: bool = True,
        tags: Optional[List[str]] = None,
    ) -> bool:
        """
        一站式生成多集 AI 连续剧。

        流程：
          1. 用 DeepSeek 生成分集剧本
          2. 并/串行生成所有剧集视频
          3. 生成海报
          4. 打包发布到 WordPress TV Shows
        """
        n_episodes = episodes or self.config.drama_episodes
        trace_id = generate_trace_id()

        logger.info("=" * 70)
        logger.info(f"📺 开始创作连续剧 | Trace: {trace_id}")
        logger.info(f"   标题: 《{series_title}》")
        logger.info(f"   概念: {concept[:100]}...")
        logger.info(f"   集数: {n_episodes}")
        logger.info("=" * 70)

        # Step 1: 剧本生成
        logger.info("📝 Phase 1/4: AI 编剧生成分集剧本...")
        scripts = ai_text.generate_drama_scripts(concept, n_episodes)
        if not scripts:
            logger.error("❌ 剧本生成失败，流水线中止")
            return False

        # Step 2: 逐集生成视频
        logger.info(f"🎬 Phase 2/4: 生成 {len(scripts)} 集视频...")

        def _gen_one(ep_data: Dict) -> Dict:
            """生成单集视频。"""
            prompt = ep_data.get("detailed_prompt") or ep_data.get("visual_prompt", concept)
            ep_num = ep_data["episode"]
            logger.info(f"  🎬 第 {ep_num} 集: {ep_data.get('title_cn', '')}")

            video = video_gen.generate(prompt)
            ep_data["video_url"] = video
            ep_data["status"] = "success" if video else "failed"
            return ep_data

        if self.config.drama_parallel and self.config.drama_max_workers > 1:
            logger.info(f"   并行模式 (max_workers={self.config.drama_max_workers})")
            with ThreadPoolExecutor(max_workers=self.config.drama_max_workers) as executor:
                futures = {
                    executor.submit(_gen_one, ep): ep["episode"]
                    for ep in scripts
                }
                for future in as_completed(futures):
                    ep_num = futures[future]
                    try:
                        result = future.result()
                        status = "✅" if result.get("status") == "success" else "❌"
                        logger.info(f"   第 {ep_num} 集完成 {status}")
                    except Exception as e:
                        logger.error(f"   第 {ep_num} 集异常: {e}")
        else:
            logger.info("   串行模式")
            for ep in scripts:
                _gen_one(ep)

        success_count = sum(1 for ep in scripts if ep.get("status") == "success")
        logger.info(f"   视频生成完成: {success_count}/{len(scripts)} 成功")

        # Step 3: 海报
        poster_result = None
        if auto_poster:
            logger.info("🎨 Phase 3/4: 生成海报...")
            poster_result = poster_gen.generate_poster(series_title, concept)

        # Step 4: 打包发布
        logger.info("📡 Phase 4/4: 发布连续剧...")
        episodes_payload = []
        for ep in scripts:
            if ep.get("status") == "success":
                episodes_payload.append(
                    {
                        "episode": ep["episode"],
                        "title": ep.get("title_cn", f"第{ep['episode']}集"),
                        "title_en": ep.get("title_en", ""),
                        "description": ep.get("synopsis", ""),
                        "video_url": ep.get("video_url", ""),
                        "visual_prompt": ep.get("visual_prompt", ""),
                    }
                )

        if not episodes_payload:
            logger.error("❌ 没有成功生成的剧集，发布中止")
            return False

        pub_result = publisher.publish_series(
            series_title=series_title,
            series_description=f"AI 生成连续剧 · 共 {len(episodes_payload)} 集\n\n概念：{concept}",
            episodes=episodes_payload,
            poster_url=poster_result,
            tags=tags,
        )

        if pub_result:
            logger.info("=" * 70)
            logger.info(f"🎉 恭喜！《{series_title}》连续剧创作完成！")
            logger.info(f"   成功生成: {len(episodes_payload)} 集")
            logger.info(f"   前往 https://coupiya.com/blog 查看您的作品！")
            logger.info("=" * 70)
            return True
        return False


pipeline = CinemaPipeline()


# ============================================================================
# 10. 快捷函数（用户可直接调用的最简接口）
# ============================================================================


def create_movie(
    title: str,
    prompt: str,
    visual_prompt: Optional[str] = None,
    **kwargs,
) -> bool:
    """
    🎬 最简电影创作接口。
    您只需提供标题和创意概念，其余全自动。

    用法：
        create_movie("赛博朋克之夜", "霓虹灯下的东京雨夜，一个女杀手在巷战中逃亡")
    """
    return pipeline.produce_movie(
        title=title, concept=prompt, visual_prompt=visual_prompt, **kwargs
    )


def create_series(
    title: str,
    concept: str,
    episodes: int = 10,
    **kwargs,
) -> bool:
    """
    📺 最简连续剧创作接口。
    只需提供系列标题和概念，AI 会自动写剧本、生成视频、打包发布。

    用法：
        create_series("赛博朋克：暗夜传说", "一个黑客在2077年的东京地下世界崛起", episodes=10)
    """
    return pipeline.produce_drama_series(
        series_title=title, concept=concept, episodes=episodes, **kwargs
    )


def quick_publish(
    title: str,
    video_url: str,
    description: str = "",
    poster_url: Optional[str] = None,
) -> Optional[Dict]:
    """
    ⚡ 快速发布已有视频。
    如果您已经有视频 URL（从其他 AI 工具生成），直接发布到电影墙。

    用法：
        quick_publish("我的AI电影", "https://example.com/video.mp4", "一部关于未来的短片")
    """
    return publisher.publish_movie(
        title=title,
        description=description or title,
        video_url=video_url,
        poster_url=poster_url,
    )


# ============================================================================
# 11. 演示 & 自检
# ============================================================================


def run_self_check() -> Dict[str, Any]:
    """运行环境自检，输出诊断报告。"""
    checks = {
        "user_id": CONFIG.user_id,
        "workspace": str(WORKSPACE["workspace"]),
        "workspace_exists": WORKSPACE["workspace"].exists(),
        "api_base": CONFIG.api_base_url,
        "deepseek_configured": bool(CONFIG.deepseek_api_key),
        "openai_configured": bool(CONFIG.openai_api_key),
        "replicate_configured": bool(CONFIG.replicate_api_token),
        "tencent_configured": bool(CONFIG.tencent_secret_id and CONFIG.tencent_secret_key),
        "video_provider": CONFIG.video_provider,
        "auto_publish": CONFIG.auto_publish,
        "dry_run": CONFIG.dry_run,
        "python_version": sys.version,
        "timestamp": timestamp_utc8(),
    }

    logger.info("=" * 70)
    logger.info("🔍 Coupiya 环境诊断报告")
    logger.info("=" * 70)
    for k, v in checks.items():
        logger.info(f"   {k}: {v}")
    logger.info("=" * 70)
    return checks


def show_guide():
    """显示用户指引。"""
    guide = """
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                🌍 全球 AI 创作者 · 快速上手指南                               ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  📌 方式一：创作单部电影                                                      ║
║  ─────────────────────────                                                   ║
║  create_movie(                                                               ║
║      title="您的电影标题",                                                   ║
║      prompt="您的故事概念/创意描述",                                          ║
║  )                                                                           ║
║                                                                              ║
║  示例：                                                                       ║
║  create_movie(                                                               ║
║      "月亮上的猫",                                                           ║
║      "一只橘猫意外登上月球，在环形山间跳跃，地球在远方缓缓升起"                ║
║  )                                                                           ║
║                                                                              ║
║  📌 方式二：创作多集连续剧                                                     ║
║  ─────────────────────────                                                   ║
║  create_series(                                                              ║
║      title="您的连续剧标题",                                                 ║
║      concept="整体世界观和故事概念",                                          ║
║      episodes=10,  # 集数                                                    ║
║  )                                                                           ║
║                                                                              ║
║  📌 方式三：快速发布已有视频                                                   ║
║  ─────────────────────────                                                   ║
║  quick_publish(                                                              ║
║      title="电影标题",                                                       ║
║      video_url="https://...",                                                ║
║  )                                                                           ║
║                                                                              ║
║  📌 自定义配置                                                                ║
║  ─────────────────────────                                                   ║
║  修改顶部 CONFIG 区域，或使用环境变量。                                        ║
║  完整 API 文档请查看各函数的 docstring。                                      ║
║                                                                              ║
║  ⚙️  环境变量示例：                                                           ║
║  export COUPIYA_USER_ID="user_12345"                                         ║
║  export COUPIYA_DRAMA_EPISODES=20                                            ║
║  export DEEPSEEK_API_KEY="sk-..."                                            ║
║                                                                              ║
║  🌐 作品发布后，前往 https://coupiya.com/blog 查看您的作品！                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""
    print(guide)


# ============================================================================
# 12. 主入口
# ============================================================================


def main():
    """主入口。首次运行显示指引并自检，然后进入交互或自动执行模式。"""
    logger.info("")
    logger.info("🚀 Coupiya AI Cinema Pipeline 启动")
    logger.info(f"   用户 ID: {CONFIG.user_id}")
    logger.info(f"   工作空间: {WORKSPACE['workspace']}")
    logger.info(f"   Dry Run: {CONFIG.dry_run}")
    logger.info("")

    show_guide()
    run_self_check()

    # ────────────────────────────────────────────────
    # 这里以下是用户的创作区域。
    # 您可以把 AI 生成的代码直接粘贴在下方，
    # 然后点击运行，作品就会自动发布！
    #
    # 提示：上面所有的函数（create_movie, create_series,
    #       quick_publish 等）都可以直接调用。
    # ────────────────────────────────────────────────

    # ╔═══════════════════════════════════════════════════════════════════╗
    # ║              ↓↓↓  在此粘贴您的 AI 创作代码  ↓↓↓                    ║
    # ╚═══════════════════════════════════════════════════════════════════╝

    # ========== 示例代码（请替换为您的创作） ==========

    # -- 示例 1：单部电影 --
    # create_movie(
    #     title="霓虹废墟",
    #     prompt="2149年的上海，城市被霓虹灯淹没，一个孤独的机器人艺术家在废墟中寻找最后的色彩",
    # )

    # -- 示例 2：多集连续剧 --
    # create_series(
    #     title="星河迷途",
    #     concept="一支人类舰队在寻找新家园的旅途中，发现了一个沉睡百万年的外星文明。每集探索一颗新的星球。",
    #     episodes=10,
    # )

    # -- 示例 3：批量创作 --
    # movies = [
    #     {"title": "沙漠之心", "prompt": "无边沙漠中，一棵水晶树在月光下生长"},
    #     {"title": "深蓝恐惧", "prompt": "深海7000米，一艘潜艇发现了不该存在的东西"},
    #     {"title": "最后的人类", "prompt": "AI统治的世界里，最后一个人类小孩被机器人抚养"},
    # ]
    # for m in movies:
    #     create_movie(**m)

    # ==================================================

    logger.info("")
    logger.info("🏁 流水线执行完毕。")
    logger.info("   如果看到 '创作完成并已发布'，请前往 https://coupiya.com/blog 查看！")
    logger.info("   如果是 Dry Run 模式，请将 COUPIYA_DRY_RUN=false 后重试。")
    logger.info("")


# ============================================================================
# 启动
# ============================================================================

if __name__ == "__main__":
    main()

"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   代码架构概览：                                                              ║
║                                                                              ║
║   CoupiyaConfig   →  全局配置（环境变量驱动）                                ║
║   AITextGenerator →  AI 文本/剧本生成（DeepSeek / OpenAI）                    ║
║   PosterGenerator →  AI 海报生成（Pollinations / Replicate）                  ║
║   VideoGenerator  →  AI 视频生成（Workbuddy / Replicate）                     ║
║   PublishEngine   →  发布到 WordPress（通过 Next.js API）                     ║
║   CinemaPipeline  →  流水线编排（串联以上所有模块）                            ║
║                                                                              ║
║   快捷函数：                                                                  ║
║   create_movie()    →  一键创作单部电影                                       ║
║   create_series()   →  一键创作多集连续剧                                     ║
║   quick_publish()   →  快速发布已有视频                                       ║
║                                                                              ║
║   设计原则：                                                                  ║
║   - 零门槛：粘贴 AI 生成的代码即可运行                                        ║
║   - 无限灵活：每个模块独立，可自由组合                                        ║
║   - 多后端：视频/海报/文本生成均可切换后端                                    ║
║   - 全自动：从创作到发布一条龙，无需手动操作                                  ║
║   - 可扩展：新增 AI 后端只需添加方法                                          ║
║   - 上帝视角：运行 → 刷新 coupiya.com → 作品已上墙                           ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""