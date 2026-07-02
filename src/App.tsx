import React, { useState } from 'react';
import { CompetitorAnalysis } from './components/modules/CompetitorAnalysis';
import { AssetReview } from './components/modules/AssetReview';

function GeometricLogo() {
  return (
    <div className="flex items-center gap-2 md:gap-4 group cursor-pointer shrink-0" aria-label="产品标识">
      <div className="w-8 h-8 md:w-12 md:h-12 bg-[#D02020] rounded-full border-[3px] md:border-4 border-[#121212]"></div>
      <div className="w-8 h-8 md:w-12 md:h-12 bg-[#F0C020] border-[3px] md:border-4 border-[#121212]"></div>
      <div className="w-0 h-0 border-l-[16px] md:border-l-[24px] border-l-transparent border-r-[16px] md:border-r-[24px] border-r-transparent border-b-[28px] md:border-b-[42px] border-b-[#1040C0] relative top-[-4px]">
        <div className="absolute top-[4px] left-[-12px] md:left-[-20px] w-0 h-0 border-l-[12px] md:border-l-[20px] border-l-transparent border-r-[12px] md:border-r-[20px] border-r-transparent border-b-[20px] md:border-b-[35px] border-b-[#121212] -z-10 opacity-30"></div>
      </div>
    </div>
  );
}

const TABS = [
  {
    id: 'script',
    label: '脚本拆解',
    comp: CompetitorAnalysis,
    color: 'text-[#F0C020]',
    bg: 'bg-[#1040C0]',
    text: 'text-white',
    title: '脚本拆解与产品迁移',
    subtitle: '导入竞品或热点内容，拆解爆点结构，生成适配我方产品的创作脚本。'
  },
  {
    id: 'assets',
    label: '脚本库',
    comp: AssetReview,
    color: 'text-[#F0C020]',
    bg: 'bg-white',
    text: 'text-[#121212]',
    title: '脚本沉淀库',
    subtitle: '保存、筛选和复用高质量创作脚本，让可用结构沉淀为内容资产。'
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('script');
  const activeTabData = TABS.find(t => t.id === activeTab) || TABS[0];
  const ActiveComponent = activeTabData.comp;

  return (
    <div className="min-h-screen bg-[#F0F0F0] flex flex-col font-sans text-[#121212] border-[8px] md:border-[12px] border-[#121212] selection:bg-[#F0C020] selection:text-[#121212]">
      <nav className="h-20 bg-white border-b-8 border-[#121212] flex items-center justify-between px-4 md:px-10 z-20 shrink-0">
        <GeometricLogo />
        <div className="flex gap-4 md:gap-8 text-xl md:text-3xl font-black tracking-widest overflow-x-auto hide-scrollbar items-center">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap transition-colors hover:text-[#1040C0] focus:outline-none py-2 px-1 ${
                activeTab === tab.id
                  ? 'text-[#121212] underline decoration-4 md:decoration-8 underline-offset-[12px] decoration-[#D02020]'
                  : 'text-[#121212]/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <header className={`md:min-h-56 flex ${activeTabData.bg} ${activeTabData.text} border-b-8 border-[#121212] relative shrink-0 transition-colors duration-300`}>
        <div className="flex-1 p-6 md:p-10 flex flex-col justify-center">
          <h1 className="text-5xl md:text-7xl lg:text-[7.5rem] font-black leading-[0.86] tracking-tighter mb-4">
            {activeTabData.title}
          </h1>
          <p className="text-xl md:text-3xl lg:text-4xl font-black tracking-widest max-w-5xl">{activeTabData.subtitle}</p>
        </div>
      </header>

      <main className="flex-1 w-full overflow-y-auto relative antialiased p-6 md:p-12">
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(#121212_2px,transparent_2px)] [background-size:24px_24px] z-0 mix-blend-multiply"></div>
        <div className="relative z-10 max-w-7xl mx-auto">
          <ActiveComponent />
        </div>
      </main>

      <footer className="h-16 bg-[#121212] text-white flex items-center justify-between px-4 md:px-10 text-[8px] md:text-[10px] font-bold uppercase tracking-[0.1em] md:tracking-[0.2em] shrink-0">
        <div className="hidden sm:block">功能性客体 1923 / 2026</div>
        <div className="flex gap-4 md:gap-6 w-full sm:w-auto justify-between sm:justify-center">
          <span className="text-[#F0C020]">状态：运行中</span>
          <span className="text-[#D02020]">错误：00</span>
          <span className="text-[#1040C0]">连接：高速</span>
        </div>
        <div className="hidden md:block">形式追随功能</div>
      </footer>
    </div>
  );
}


