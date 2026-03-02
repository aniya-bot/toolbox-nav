const tools = [
  {
    title: "创建钱包",
    description: "一键进入 EVM 链钱包创建入口。",
    href: "https://mct.xyz/create-wallet?chain=evm",
    tag: "Wallet",
    external: true,
  },
  {
    title: "Solana 批量分发",
    description: "进入 Solana 代币批量分发模拟面板。",
    href: "/solana-batch",
    tag: "Solana",
    external: false,
  },
  {
    title: "批量分发 BTC",
    description: "wizz.cash 的比特币批量转账面板。",
    href: "https://wizz.cash/btc/send",
    tag: "Batch",
    external: true,
  },
  {
    title: "批量分发工具",
    description: "支持多链的 TPT 批量发送服务。",
    href: "https://batchsender.tptool.pro/#/",
    tag: "Batch",
    external: true,
  },
  {
    title: "Disperse",
    description: "主流多链代币批量分发站点。",
    href: "https://disperse.app/",
    tag: "Airdrop",
    external: true,
  },
  {
    title: "合约工具",
    description: "CT 合约仪表盘与链上分析。",
    href: "https://ct.app/dashboard",
    tag: "Contract",
    external: true,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_rgba(236,244,255,0.6)_40%,_rgba(255,223,246,0.55)_80%)] px-4 py-12 text-slate-900 dark:bg-[radial-gradient(circle_at_top,_rgba(30,33,46,0.95),_rgba(8,10,20,1)_55%)] dark:text-slate-100 sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="clay-surface dark:clay-card-dark rounded-[32px] px-8 py-10 text-center shadow-lg shadow-indigo-200/40 backdrop-blur sm:px-12">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm dark:bg-white/10 dark:text-indigo-200">
            ✨ TOOLBOX NAV
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            粘土风工具导航站
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-300 sm:text-lg">
            可爱、清新的 Web3 小工具入口，支持暗色模式。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded-full bg-white/70 px-3 py-1 shadow-sm dark:bg-white/10">
              Claymorphism
            </span>
            <span className="rounded-full bg-white/70 px-3 py-1 shadow-sm dark:bg-white/10">
              Responsive
            </span>
            <span className="rounded-full bg-white/70 px-3 py-1 shadow-sm dark:bg-white/10">
              Dark Mode
            </span>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          {tools.map((tool) => (
            <a
              key={tool.href}
              href={tool.href}
              target={tool.external ? "_blank" : undefined}
              rel={tool.external ? "noopener noreferrer" : undefined}
              className="group relative flex h-full flex-col gap-4 rounded-[28px] border border-white/60 p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-2xl focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 active:translate-y-0 dark:border-white/10"
            >
              <div className="absolute inset-0 rounded-[28px] bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-opacity duration-300 group-hover:opacity-95 dark:bg-white/5" />
              <div className="clay-card dark:clay-card-dark relative z-10 flex h-full flex-col justify-between rounded-[24px] p-5 transition-all duration-300 group-hover:shadow-[0_18px_35px_rgba(127,144,255,0.45)] dark:group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.55)]">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                    {tool.tag}
                  </div>
                  <h2 className="text-xl font-semibold">{tool.title}</h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {tool.description}
                  </p>
                </div>
                <div className="mt-6 flex items-center justify-between text-sm font-medium text-indigo-700 dark:text-indigo-200">
                  <span className="transition-transform duration-300 group-hover:translate-x-1">
                    立即前往
                  </span>
                  <span aria-hidden="true">→</span>
                </div>
              </div>
            </a>
          ))}
        </section>

        <footer className="text-center text-xs text-slate-500 dark:text-slate-400">
          设计灵感来自 UI/UX Claymorphism 思路，专注高效导航。
        </footer>
      </div>
    </div>
  );
}
