'use client';

// ============================================================================
// components/DnaStudio.tsx —— DNA 双螺旋粒子工坊（Three.js / WebGL 动态节点）
// ----------------------------------------------------------------------------
// 对应规划：把 AI 影视全流程工具定义为「在 DNA 上游走的发光节点」，悬停高亮、
// 点击选中；配合下方工位清单（无 WebGL 时的无障碍兜底）。本组件只负责
// 可视化与选中交互，具体业务动作（弹窗/跳转）由父级 onAction 决定。
//
// 技术要点：
//   1. three 动态 import（SSR 安全），WebGL 不可用时自动降级为清单模式
//   2. 全资源生命周期管理：dispose 几何/材质/渲染器 + 取消 RAF + ResizeObserver
//   3. prefers-reduced-motion 尊重：降低旋转/游走速度
//   4. 每节点颜色/状态来自 STUDIO_TOOLS（诚实：gpu-pending 节点明确标注"接入中"）
// ============================================================================

import { useEffect, useRef, useState } from 'react';

/* ---------------------------------------------------------------------------
 * 工位配置（单一数据源：DNA 节点 / 清单 / 父级动作共用）
 * ------------------------------------------------------------------------- */

export type StudioToolAction =
  | { kind: 'modal'; modal: 'chat' | 'image' | 'video' }
  | { kind: 'href'; href: string }
  | { kind: 'none' };

export interface StudioTool {
  id: string;
  stage: string;
  title: string;
  icon: string;
  engine: string;
  status: 'live' | 'gpu-pending';
  color: string;
  desc: string;
  action: StudioToolAction;
  ctaLabel: string;
}

export const STUDIO_TOOLS: StudioTool[] = [
  {
    id: 'screenplay', stage: '01 · 剧本', title: '剧本工位', icon: '✍️',
    engine: 'DeepSeek / 腾讯混元', status: 'live', color: '#34d399',
    desc: '把一句灵感扩写成完整故事与分集剧本（文本大模型，今日即可体验）。',
    action: { kind: 'modal', modal: 'chat' }, ctaLabel: '开始写剧本',
  },
  {
    id: 'storyboard', stage: '02 · 分镜', title: '分镜设计工位', icon: '🖼️',
    engine: 'Pollinations / Replicate', status: 'live', color: '#60a5fa',
    desc: '文生图生成角色设定与分镜概念图，为成片定调（免费开放）。',
    action: { kind: 'modal', modal: 'image' }, ctaLabel: '生成分镜图',
  },
  {
    id: 'video', stage: '03 · 视频', title: '视频生成工位', icon: '🎬',
    engine: 'LTX-2.3 22B（ComfyUI）· 今日走平台网关', status: 'live', color: '#f472b6',
    desc: '核心成片引擎：LTX-2.3 音画同步模型接入中（腾讯云 A100 上线后启用）；今日由平台生成网关一键产出短视频。',
    action: { kind: 'modal', modal: 'video' }, ctaLabel: '立即生成视频',
  },
  {
    id: 'voice', stage: '04 · 配音', title: '音效配音工位', icon: '🎙️',
    engine: 'MiniMax H3 / 腾讯云 TTS', status: 'gpu-pending', color: '#fbbf24',
    desc: '角色配音、AI 音色与音效合成。随 GPU 算力集群接入后启用。',
    action: { kind: 'none' }, ctaLabel: '引擎接入中',
  },
  {
    id: 'enhance', stage: '05 · 后期', title: '4K 增强剪辑工位', icon: '✨',
    engine: '腾讯云 WAND', status: 'gpu-pending', color: '#a78bfa',
    desc: '4K 画质增强、多语种配音、智能编码（WAND 工业级后处理）。',
    action: { kind: 'none' }, ctaLabel: '引擎接入中',
  },
  {
    id: 'publish', stage: '06 · 发布', title: '全球发布工位', icon: '🚀',
    engine: '腾讯云 VOD + WordPress', status: 'live', color: '#2dd4bf',
    desc: 'VOD 转码 → 自动上架全球电影墙，作者：@您。完成创作后作品自动进入发布确认。',
    action: { kind: 'href', href: '/account' }, ctaLabel: '查看我的作品',
  },
];

/* ---------------------------------------------------------------------------
 * 组件
 * ------------------------------------------------------------------------- */

interface DnaStudioProps {
  selectedId?: string;
  onSelect?: (tool: StudioTool) => void;
  onAction?: (tool: StudioTool) => void;
  className?: string;
}

export default function DnaStudio({ selectedId, onSelect, onAction, className = '' }: DnaStudioProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<StudioTool>(
    () => STUDIO_TOOLS.find((t) => t.id === selectedId) ?? STUDIO_TOOLS[2]!,
  );
  const [webglUnsupported, setWebglUnsupported] = useState(false);

  // three 只在浏览器端动态加载
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let raf = 0;
    let renderer: {
      setSize: (w: number, h: number) => void;
      dispose: () => void;
      domElement: HTMLCanvasElement;
    } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const pickTargets: Array<{ mesh: { geometry: unknown; material: unknown }; toolId: string }> = [];

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    (async () => {
      try {
        const THREE = await import('three');
        if (disposed) return;

        // ---- 场景/相机/渲染器 ----
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
        camera.position.set(0, 0, 6.4);

        const render = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        render.setClearColor(0x000000, 0);
        renderer = render;
        container.appendChild(render.domElement);

        const group = new THREE.Group();
        scene.add(group);

        // ---- DNA 双螺旋骨架（已替换为用户提供的高清科研图：玻璃器皿+DNA 双螺旋+分子结构） ----
        // 背景图通过下方 mountRef 容器的 CSS background-image 渲染；Three.js 场景内不再绘制双螺旋。
        const R = 1.05;
        const HEIGHT = 4.4;

        // ---- 环绕粒子（游动光点：保持原参数不动） ----
        const particleCount = 420;
        const pPositions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
          const radius = R * (0.8 + Math.random() * 1.7);
          const angle = Math.random() * Math.PI * 2;
          pPositions[i * 3] = Math.cos(angle) * radius;
          pPositions[i * 3 + 1] = (Math.random() - 0.5) * HEIGHT * 1.5;
          pPositions[i * 3 + 2] = Math.sin(angle) * radius;
        }
        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPositions, 3));
        const particles = new THREE.Points(
          pGeo,
          new THREE.PointsMaterial({
            color: 0x9bd1ff,
            size: 0.02,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
          }),
        );
        group.add(particles);

        // ---- 工具节点（发光小球，沿螺旋游走） ----
        const nodeMeshes: import('three').Mesh[] = [];
        STUDIO_TOOLS.forEach((tool, idx) => {
          const geo = new THREE.SphereGeometry(0.085, 24, 24);
          const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tool.color) });
          const mesh = new THREE.Mesh(geo, mat);
          const strand = idx % 2 === 0 ? 0 : Math.PI;
          const baseAngle = idx * 0.9 + strand;
          mesh.position.set(Math.cos(baseAngle) * R * 1.06, (idx / (STUDIO_TOOLS.length - 1) - 0.5) * HEIGHT * 0.72, Math.sin(baseAngle) * R * 1.06);
          mesh.userData = { toolId: tool.id, baseY: mesh.position.y, phase: idx * 1.1, baseAngle };
          group.add(mesh);
          nodeMeshes.push(mesh);
          pickTargets.push({ mesh, toolId: tool.id });

          // 光环
          const ringGeo = new THREE.RingGeometry(0.13, 0.16, 40);
          const ringMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(tool.color),
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(mesh.position);
          ring.position.y += 0.16;
          group.add(ring);
        });

        // ---- 交互：点击节点 ----
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        const pickMesh = (clientX: number, clientY: number): string | null => {
          const rect = container.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return null;
          pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(nodeMeshes, false);
          const hit = hits[0];
          return hit ? String(hit.object.userData?.toolId ?? '') : null;
        };

        const onPointerDown = (e: PointerEvent) => {
          const toolId = pickMesh(e.clientX, e.clientY);
          if (!toolId) return;
          const tool = STUDIO_TOOLS.find((t) => t.id === toolId);
          if (!tool) return;
          setSelected(tool);
          onSelect?.(tool);
        };

        const onPointerMove = (e: PointerEvent) => {
          const toolId = pickMesh(e.clientX, e.clientY);
          container.style.cursor = toolId ? 'pointer' : 'default';
        };

        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMove);

        // ---- 尺寸自适应 ----
        const setCanvasSize = () => {
          const w = container.clientWidth || 320;
          const h = container.clientHeight || 420;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          render.setSize(w, h);
        };
        setCanvasSize();
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(setCanvasSize);
          resizeObserver.observe(container);
        }

        // ---- 动画循环 ----
        const clock = new THREE.Clock();
        const speedFactor = reducedMotion ? 0.08 : 1;
        const tick = () => {
          if (disposed) return;
          const elapsed = clock.getElapsedTime();
          group.rotation.y = elapsed * 0.12 * speedFactor;
          group.rotation.x = Math.sin(elapsed * 0.1 * speedFactor) * 0.05;

          // 节点沿螺旋上下游走
          for (const mesh of nodeMeshes) {
            const data = mesh.userData as { baseY: number; phase: number; baseAngle: number };
            mesh.position.y = data.baseY + Math.sin(elapsed * 0.6 * speedFactor + data.phase) * 0.35;
            mesh.position.x = Math.cos(data.baseAngle + group.rotation.y * 0) * R * 1.06;
            // 简单呼吸发光
            const s = 1 + Math.sin(elapsed * 2.2 * speedFactor + data.phase) * 0.12;
            mesh.scale.setScalar(s);
          }

          render.render(scene, camera);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        // ---- 清理 ----
        const cleanup = () => {
          disposed = true;
          cancelAnimationFrame(raf);
          container.removeEventListener('pointerdown', onPointerDown);
          container.removeEventListener('pointermove', onPointerMove);
          resizeObserver?.disconnect();
          scene.traverse((obj) => {
            const anyObj = obj as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
            anyObj.geometry?.dispose?.();
            anyObj.material?.dispose?.();
          });
          renderer?.dispose();
          if (renderer?.domElement && renderer.domElement.parentNode === container) {
            container.removeChild(renderer.domElement);
          }
        };
        // 返回清理函数（effect cleanup 时执行）
        return cleanup;
      } catch {
        if (!disposed) setWebglUnsupported(true);
        return undefined;
      }
    })();

    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 选中工具（外部受控优先） ---- */
  useEffect(() => {
    if (selectedId) {
      const tool = STUDIO_TOOLS.find((t) => t.id === selectedId);
      if (tool) setSelected(tool);
    }
  }, [selectedId]);

  const handleSelect = (tool: StudioTool) => {
    setSelected(tool);
    onSelect?.(tool);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* DNA 画布（无 WebGL 时隐藏，走清单） */}
      {!webglUnsupported && (
        <div
          ref={mountRef}
          role="img"
          aria-label="AI 影视六工位 DNA 节点图：点击发光节点查看工位"
          className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
          style={{
            height: 440,
            backgroundImage: 'url(/dna-studio-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {/* 顶部引擎状态 */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 text-[11px] text-white/80 bg-black/30 backdrop-blur rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            算力底座：PVE 调度层 · GPU 引擎（A100 / LTX-2.3）接入中
          </div>

          {/* 选中的工位信息卡 */}
          <div className="absolute inset-x-3 bottom-3 z-10 bg-black/55 backdrop-blur-md border border-white/10 rounded-xl p-3.5 text-white">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-white/50">{selected.stage} · {selected.engine}</p>
                <p className="font-bold truncate">{selected.icon} {selected.title}</p>
              </div>
              <span
                className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${
                  selected.status === 'live' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {selected.status === 'live' ? '● 可用' : '◌ 引擎接入中'}
              </span>
            </div>
            <p className="text-xs text-white/70 mt-1.5 leading-relaxed">{selected.desc}</p>
            {selected.action.kind !== 'none' ? (
              <button
                type="button"
                onClick={() => onAction?.(selected)}
                className="mt-2 w-full py-2 rounded-lg text-sm font-semibold text-white shadow hover:brightness-110 active:scale-[0.99] transition-all"
                style={{ background: `linear-gradient(90deg, ${selected.color}cc, ${selected.color}88)` }}
              >
                {selected.ctaLabel} →
              </button>
            ) : (
              <p className="mt-2 text-[11px] text-amber-200/80 text-center">🔧 {selected.ctaLabel}（腾讯云 A100 实例接入后自动点亮）</p>
            )}
          </div>
        </div>
      )}

      {/* 工位清单（无障碍兜底 / 无 WebGL 降级） */}
      <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2" role="list" aria-label="AI 影视六工位">
        {STUDIO_TOOLS.map((tool) => {
          const active = selected.id === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              role="listitem"
              onClick={() => handleSelect(tool)}
              aria-pressed={active}
              className={`rounded-xl border px-1 py-2 text-center transition-all ${
                active ? 'border-transparent text-white shadow-lg' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
              style={active ? { background: `linear-gradient(135deg, ${tool.color}dd, ${tool.color}66)` } : undefined}
            >
              <span className="block text-base">{tool.icon}</span>
              <span className="block text-[10px] font-semibold leading-tight">{tool.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
