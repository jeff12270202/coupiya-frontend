'use client';

// ============================================================================
// app/satellite/page.tsx —— 星链接入口（全球星链 + 国内星网 · AI 卫星云脑）
// ----------------------------------------------------------------------------
// 板块（与产品规划一一对应）：
//   ① 真实技术边界说明（合规免责：绝不虚假宣传"点一下就上网"）
//   ② 极速连接 · 手机卫星直连检测（纯前端判定，机型不出浏览器）
//   ③ 硬件终端 · 极客必备（Starlink 官方导流 + 安装要点）
//   ④ 双引擎 · 短信驱动 AI（无网缩传：卫星短信发指令，云端 AI 回摘要 + 链接）
//   ⑤ AI 任务与专家转包工单（三步式任务弹窗 + 三色工单看板）
//   ⑥ 我的卫星云盘（Backblaze B2 自动开通 → 预签名直传 → 生命周期倒计时）
//   ⑦ 合规与隐私公示
//   ⑧ 底部八图标快捷栏：检测 / 商城 / AI 任务 / 专家 / 云盘 / 配置 / 刷脸 / 帮助
//
// 全站原则（继承本项目既有约定，不因"改版"而放松）：
//   · 全站开放浏览；开通云盘、上传、提交任务需要刷脸登录（资源归属账号）
//   · 所有结果必须真实：B2 未配置、CORS 未生效、上游报错，一律如实报错，绝不 fake 成功
//   · 未落地的能力明确标注「建设中 / 规划中」，不用假开关冒充已支持
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CheckCircleIcon,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  IdentificationIcon,
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TruckIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import FaceAuthModal from '@/components/FaceAuthModal';
import { useAuth } from '@/hooks/useAuth';
import ApiKeyModal from '@/components/satellite/ApiKeyModal';
import DrivePanel from '@/components/satellite/DrivePanel';
import TaskModal from '@/components/satellite/TaskModal';
import TicketBoard from '@/components/satellite/TicketBoard';
import { BTN_GHOST, BTN_PRIMARY, INPUT_CLS, SectionCard, SatelliteModal, detectDevice, type DetectResult } from '@/components/satellite/shared';
import { listTickets, type SatelliteTicket } from '@/components/satellite/tickets';

/* ============================================================================
 * 底部快捷栏（规格：检测 / 商城 / AI 任务 / 专家 / 云盘 / 配置 / 刷脸 / 帮助）
 * ========================================================================= */

type BarAction = 'detect' | 'store' | 'task' | 'expert' | 'drive' | 'config' | 'face' | 'help';

const BOTTOM_BAR: ReadonlyArray<{ key: BarAction; label: string; icon: ReactNode }> = [
  { key: 'detect', label: '检测', icon: <MagnifyingGlassIcon className="w-6 h-6" /> },
  { key: 'store', label: '商城', icon: <ShoppingCartIcon className="w-6 h-6" /> },
  { key: 'task', label: 'AI 任务', icon: <SparklesIcon className="w-6 h-6" /> },
  { key: 'expert', label: '专家', icon: <UserGroupIcon className="w-6 h-6" /> },
  { key: 'drive', label: '云盘', icon: <CloudArrowUpIcon className="w-6 h-6" /> },
  { key: 'config', label: '配置', icon: <Cog6ToothIcon className="w-6 h-6" /> },
  { key: 'face', label: '刷脸', icon: <IdentificationIcon className="w-6 h-6" /> },
  { key: 'help', label: '帮助', icon: <QuestionMarkCircleIcon className="w-6 h-6" /> },
];

export default function SatellitePage() {
  const { user, loading: authLoading, setUser } = useAuth();

  // 弹窗
  const [showFace, setShowFace] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showContact, setShowContact] = useState(false);

  // 检测工具
  const [modelInput, setModelInput] = useState('');
  const [detect, setDetect] = useState<DetectResult>({ hit: false, text: '' });
  const detectRef = useRef<HTMLInputElement | null>(null);

  // 工单（本地留痕，服务端上线后替换为 fetch）
  const [tickets, setTickets] = useState<SatelliteTicket[]>([]);
  useEffect(() => {
    setTickets(listTickets());
  }, []);

  const urgentCount = useMemo(() => tickets.filter((t) => t.status === 'urgent').length, [tickets]);

  const runDetect = useCallback(() => setDetect(detectDevice(modelInput)), [modelInput]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /** 底栏动作分发 —— 每个图标都有真实行为，没有一个是装饰 */
  const onBarAction = useCallback(
    (key: BarAction) => {
      switch (key) {
        case 'detect':
          scrollTo('detect');
          window.setTimeout(() => detectRef.current?.focus(), 400);
          break;
        case 'store':
          scrollTo('hardware');
          break;
        case 'task':
          setShowTask(true);
          break;
        case 'expert':
          scrollTo('expert');
          break;
        case 'drive':
          scrollTo('drive');
          break;
        case 'config':
          setShowConfig(true);
          break;
        case 'face':
          if (user) window.location.href = '/account';
          else setShowFace(true);
          break;
        case 'help':
          setShowHelp(true);
          break;
      }
    },
    [scrollTo, user],
  );

  const needLogin = useCallback(() => {
    setShowTask(false);
    setShowConfig(false);
    setShowFace(true);
  }, []);

  /* ---- 渲染 ---- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#0a1030] to-slate-900 text-white">
      {/* 顶部 */}
      <header className="container mx-auto px-4 py-5 flex items-center justify-between gap-3 flex-wrap">
        <a href="/" className="font-serif text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-fuchsia-300">
          瓷间 · 灵韵集
        </a>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-white/70">
                👤 @{user.nickname || `创作者 ${user.id}`}
                <span className="text-cyan-300 font-mono ml-2">{user.balance} Credits</span>
              </span>
              <a href="/account" className={BTN_GHOST}>
                我的
              </a>
              <a href="/recharge" className={BTN_GHOST}>
                充值
              </a>
            </>
          ) : (
            <button type="button" onClick={() => setShowFace(true)} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-sm">
              刷脸登录
            </button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-5xl space-y-8 pb-32">
        {/* ① 真实技术边界说明 */}
        <section id="top" className="text-center pt-4">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">🛰️ 星链接入口</h1>
          <p className="text-white/70 max-w-3xl mx-auto">全球星链 + 国内星网双引擎 · 短信驱动 AI 云端工作台</p>
          <div className="mt-6 text-left bg-sky-500/10 border border-sky-400/30 rounded-2xl p-5 text-sm text-sky-100/90 leading-relaxed space-y-1.5">
            <p className="flex items-center gap-2 font-semibold text-sky-200 mb-1">
              <ShieldCheckIcon className="w-5 h-5" /> 真实技术边界说明（合规免责）
            </p>
            <p>① 星链并非「手机里的软件」：普通手机接入必须依赖物理终端（Starlink Mini 等）。</p>
            <p>② 星链直连手机（Direct to Cell）仅兼容部分新款旗舰（如 iPhone 14+ 等），且目前以 SMS 短信 / 极低带宽为主，语音与高速数据仍在分批开放。</p>
            <p>③ 国内天通一号为区域覆盖系统（中国全境 + 东南亚部分），仅特定机型支持；北斗短报文为窄带文字。</p>
            <p>④ 本平台为合规增值服务导流与 AI 分发服务，不兜售「无设备上网」，不夸大卫星能力。</p>
          </div>
        </section>

        {/* ①.5 运行时主梁 —— 整页的骨架，放在最显眼处 */}
        <section
          id="harness"
          className="rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-indigo-600/20 via-slate-900/40 to-cyan-500/10 p-6 scroll-mt-24"
        >
          <div className="flex items-start gap-4 flex-wrap">
            <ServerStackIcon className="w-9 h-9 text-cyan-300 flex-shrink-0" />
            <div className="flex-1 min-w-[260px]">
              <h2 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
                Harness 运行时主梁
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-400/30">
                  方案 A · Serverless Worker
                </span>
              </h2>
              <p className="text-white/65 text-sm mt-2 leading-relaxed">
                星链已经跑通了「连得上」，但它的物理上限决定了<b className="text-white">跑不动大模型</b>：
                模型权重几百 GB、推理要独占 GPU 与机房内网带宽。
                所以星链上的 AI 只有一种可行形态 ——
                <b className="text-cyan-200">卫星只送指令，算力留在云端</b>。
                星链负责最后一公里，<b className="text-white">Harness 负责那一公里之后的全部算力</b>。
              </p>
              <p className="text-white/50 text-xs mt-2 leading-relaxed">
                它按 Serverless 形态部署：任务到达时拉起实例、跑完即销毁（冷启动 2-5 秒），
                因此不需要、也不可能"安装"到云服务器磁盘上常驻。工程图纸 / 复杂代码 /
                系统架构这类分钟级任务，请到独立工作台执行。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.open('/harness', 'coupiya-harness', 'width=1280,height=880,noopener,noreferrer')}
                  className={BTN_PRIMARY}
                >
                  <RocketLaunchIcon className="w-4 h-4 inline mr-1.5" />
                  打开主梁工作台（独立窗口）
                </button>
                <a href="/harness" className={BTN_GHOST}>
                  本页打开
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ② 手机直连检测 */}
        <SectionCard
          id="detect"
          title="极速连接 · 手机卫星直连检测"
          icon={<DevicePhoneMobileIcon className="w-6 h-6 text-cyan-300" />}
          desc="输入您的手机型号（如「iPhone 15 Pro」「华为 Mate 60 Pro」），纯前端即时判定 —— 机型字符串不会离开您的浏览器。"
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={detectRef}
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runDetect();
                }
              }}
              placeholder="输入手机型号…"
              aria-label="手机型号"
              className={`flex-1 ${INPUT_CLS}`}
            />
            <button type="button" onClick={runDetect} className={BTN_PRIMARY}>
              检测我的设备
            </button>
          </div>
          {detect.text && (
            <div
              className={`mt-4 rounded-xl p-4 text-sm leading-relaxed ${
                detect.hit ? 'bg-emerald-500/10 border border-emerald-400/30 text-emerald-100' : 'bg-amber-500/10 border border-amber-400/30 text-amber-100'
              }`}
            >
              {detect.hit ? <CheckCircleIcon className="w-5 h-5 inline mr-1" /> : <ExclamationTriangleIcon className="w-5 h-5 inline mr-1" />}
              {detect.text}
            </div>
          )}
          <p className="text-xs text-white/40 mt-3">
            当前阶段：卫星直连以短信 / 应急为主，不适合刷视频等高带宽场景；语音与数据按运营商计划分批开放。
          </p>
        </SectionCard>

        {/* ③ 硬件终端 */}
        <SectionCard
          id="hardware"
          title="硬件终端 · 极客必备"
          icon={<ShoppingCartIcon className="w-6 h-6 text-purple-300" />}
          desc="不兼容直连的设备，可选购 Starlink 官方终端（标准套件约 $499 起 / Mini 约 1.16kg，支持充电宝供电，25-40W）。请通过官方渠道购买，本平台仅导流，不做非官方分销。"
        >
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <a
              href="https://www.starlink.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-white/10 hover:bg-white/20 p-4 transition-colors flex items-center gap-2"
            >
              🛰️ 前往 Starlink 官网选购（全球配送）
            </a>
            <div className="rounded-xl bg-white/5 p-4 text-white/70 flex items-start gap-2">
              <TruckIcon className="w-5 h-5 text-purple-300 flex-shrink-0 mt-0.5" />
              安装要点：露天无遮挡（视场角 ≥100°）· 使用官方 App 找星定位 · 远离树木 / 高层遮挡
            </div>
          </div>
        </SectionCard>

        {/* ④ 双引擎 + 短信驱动 AI */}
        <SectionCard
          id="ai-sms"
          tone="indigo"
          title="双引擎 · 短信驱动 AI（无网缩传）"
          icon={<CpuChipIcon className="w-6 h-6 text-fuchsia-300" />}
          desc={
            <>
              有网时：网页上传素材、绑定服务号码。无网时：卫星短信只发<b>指令</b>（如「写 PPT 大纲：主题 X」），
              云端 AI 大脑处理后，将<b>摘要 + 提取链接</b>以短信回传；完整成果经互联网分发到邮箱 / 云盘。
            </>
          }
        >
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-white/5 p-4">
              <p className="font-semibold text-white mb-1">🌍 全球星链直连</p>
              <p className="text-white/60">T-Mobile Direct to Cell（试点，SMS 为主）；专业用户走 Starlink 硬件终端。</p>
            </div>
            <div className="rounded-xl bg-white/5 p-4">
              <p className="font-semibold text-white mb-1">🇨🇳 中国天通 / 北斗</p>
              <p className="text-white/60">中国电信天通语音 + 短信、北斗短报文（覆盖中国及东南亚部分区域，合规渠道对接中）。</p>
            </div>
            <div className="rounded-xl bg-white/5 p-4">
              <p className="font-semibold text-white mb-1">🤖 AI 任务分发</p>
              <p className="text-white/60">收到短信指令 → 生成工单 → 大模型处理 → 人工兜底 → 短信摘要 + 网络分发。</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowTask(true)} className={BTN_PRIMARY}>
              <SparklesIcon className="w-4 h-4 inline mr-1.5" />
              立即提交一个 AI 任务
            </button>
            <button type="button" onClick={() => scrollTo('expert')} className={BTN_GHOST}>
              查看我的工单
            </button>
          </div>
        </SectionCard>

        {/* ⑤ 专家转包与工单看板 */}
        <SectionCard
          id="expert"
          title="专家转包与工单系统"
          icon={<WrenchScrewdriverIcon className="w-6 h-6 text-amber-300" />}
        >
          {urgentCount > 0 && (
            <p className="mb-3 text-sm text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded-xl px-4 py-2.5">
              有 <b>{urgentCount}</b> 条工单需要人工介入，请查看下方标红的条目。
            </p>
          )}
          <TicketBoard tickets={tickets} onChange={setTickets} onOpenTask={() => setShowTask(true)} />
        </SectionCard>

        {/* ⑥ 我的卫星云盘 */}
        <SectionCard
          id="drive"
          tone="teal"
          title="我的卫星云盘（Backblaze B2）"
          icon={<CloudArrowUpIcon className="w-6 h-6 text-teal-300" />}
        >
          <DrivePanel user={user} authLoading={authLoading} onNeedLogin={needLogin} />
        </SectionCard>

        {/* ⑦ 合规公示 */}
        <SectionCard
          id="compliance"
          title="合规与隐私公示"
          icon={<ShieldCheckIcon className="w-6 h-6 text-sky-300" />}
        >
          <div className="text-sm text-white/60 leading-relaxed space-y-2">
            <p>· 本平台定位：卫星通信持牌机构的<b>增值服务商 / 分销导流</b>，不触碰自建通信网络红线；国内以工信部《指导意见》支持民企「租用卫星资源 + 增值服务」为框架。</p>
            <p>· 卫星直连为地面网络补充：仅短信 / 应急为主，语音与数据按运营商进度分批开放；预计 2027 前应急短报文为主，大规模商用以后续官方公告为准。</p>
            <p>· 硬件购买仅导流官方渠道；无信号覆盖区请以运营商覆盖图为准（天通覆盖中国及东南亚部分区域，非全球）。</p>
            <p>· <b>隐私</b>：手机型号检测在浏览器本地完成，不上传；云盘文件存放于您专属的 Backblaze B2 私有桶，服务端仅保存受限密钥且永不返回前端。</p>
            <p>· <b>真实性</b>：任何未落地的能力（服务端工单库、专家库、按租户注入的上游密钥）均在本页标注为「建设中 / 规划中」，不以假开关或假进度冒充已支持。</p>
          </div>
        </SectionCard>
      </main>

      {/* ⑧ 底部八图标快捷栏 */}
      <nav
        aria-label="功能快捷栏"
        className="fixed bottom-0 inset-x-0 z-50 bg-[#0b1445]/95 backdrop-blur border-t border-white/10"
      >
        <div className="container mx-auto px-1 py-2.5 flex justify-between items-center max-w-3xl">
          {BOTTOM_BAR.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onBarAction(item.key)}
              aria-label={item.label}
              className="relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-white/80 hover:text-cyan-300 hover:bg-white/10 transition-colors"
            >
              {item.icon}
              <span className="text-[10px]">{item.label}</span>
              {item.key === 'expert' && urgentCount > 0 && (
                <span className="absolute top-0.5 right-1.5 w-2 h-2 rounded-full bg-red-400 ring-2 ring-[#0b1445]" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* 弹窗群 */}
      <TaskModal
        open={showTask}
        onClose={() => setShowTask(false)}
        user={user}
        onNeedLogin={needLogin}
        onTicketSaved={setTickets}
      />

      <ApiKeyModal
        open={showConfig}
        onClose={() => setShowConfig(false)}
        user={user}
        onNeedLogin={needLogin}
      />

      {showHelp && (
        <SatelliteModal title="帮助与教程" onClose={() => setShowHelp(false)} wide>
          <ol className="list-decimal list-inside text-sm text-white/70 space-y-2.5 leading-relaxed">
            <li>
              <b>有网环境</b>：先完成刷脸登录 → 在「我的卫星云盘」开通服务（自动建专属 B2 桶）→ 上传素材。
            </li>
            <li>
              <b>无网环境</b>：开启手机「卫星网络」（天通 / 直连），向服务号码发送短指令，
              例如「写PPT大纲：主题 户外储能电源」。
            </li>
            <li>
              <b>领取成果</b>：云端 AI 处理后回传短信摘要与提取链接；完整成果在联网后到云盘领取。
            </li>
            <li>
              <b>硬件用户</b>：露天放置终端 → 官方 App 找星 → 连接 Wi-Fi。视场角不足时优先移到空旷处。
            </li>
            <li>
              <b>需要人工</b>：在「专家」栏查看工单，把工单号发给 support@coupiya.com 即可转入专家通道。
            </li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setShowHelp(false); setShowTask(true); }} className={BTN_PRIMARY}>
              去提交任务
            </button>
            <button type="button" onClick={() => { setShowHelp(false); setShowContact(true); }} className={BTN_GHOST}>
              联系客服
            </button>
          </div>
        </SatelliteModal>
      )}

      {showContact && (
        <SatelliteModal title="客服与工单" onClose={() => setShowContact(false)}>
          <p className="text-sm text-white/70 mb-4 leading-relaxed">
            卫星服务与 AI 工单后台建设中。需要人工介入时，请带上<b>工单号</b>邮件联系我们，我们会按号跟进：
          </p>
          <a href="mailto:support@coupiya.com" className={`${BTN_PRIMARY} inline-block`}>
            support@coupiya.com
          </a>
          <p className="text-xs text-white/40 mt-4">（也可在有网环境下通过站内 AI 助手描述问题）</p>
        </SatelliteModal>
      )}

      <FaceAuthModal
        open={showFace}
        onClose={() => setShowFace(false)}
        onSuccess={(u) => {
          setUser(u);
          setShowFace(false);
        }}
      />
    </div>
  );
}
