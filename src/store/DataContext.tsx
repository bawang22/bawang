import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as xlsx from 'xlsx';

export interface Trend {
  platform: string;
  topic: string;
  title: string;
  heat_score: number;
  keywords: string;
  why_trending: string;
  reusable_angle: string;
}

export interface ProductBrief {
  product_name: string;
  target_user: string;
  feature: string;
  pain_point: string;
  value_prop: string;
  content_angle: string;
}

export interface CampaignResult {
  platform: string;
  title: string;
  hook_type: string;
  views: number;
  likes: number;
  comments: number;
  ctr: number;
  cvr: number;
  cpi: number;
  notes: string;
}

export interface SavedScript {
  id: string;
  title: string;
  sourceType: '竞品脚本拆解' | '热点事件解析' | '手动沉淀';
  platform: string;
  product: string;
  hook: string;
  cta: string;
  tags: string[];
  createdAt: string;
  content: string;
  fileName?: string;
}

export interface PoolItem {
  id: string;
  source: '鐑偣' | '绔炲搧';
  platform: string;
  title: string;
  keywords?: string;
  reusable_angle?: string;
  why_trending?: string;
  hook_type?: string;
  content_structure?: string;
  risk?: string;
}

interface DataContextType {
  trends: Trend[];
  productBriefs: ProductBrief[];
  campaignResults: CampaignResult[];
  scriptLibrary: SavedScript[];
  topicPool: PoolItem[];
  addToTopicPool: (item: PoolItem) => void;
  removeFromTopicPool: (id: string) => void;
  loadExcel: (file: File) => Promise<void>;
  loadCampaignResults: (rows: CampaignResult[]) => void;
  saveScript: (script: SavedScript) => void;
  removeScript: (id: string) => void;
  updateScriptProduct: (id: string, product: string) => void;
  refreshScripts: () => Promise<void>;
  isLoaded: boolean;
}

const DEFAULT_TRENDS: Trend[] = [
  {
    platform: '小红书',
    topic: '宠物头像定制',
    title: '把我家小猫做成手机壳和头像贴纸',
    heat_score: 95,
    keywords: '宠物周边, 情绪陪伴, 定制礼物',
    why_trending: '宠物主人愿意晒图和分享成品，对比图容易带来收藏和评论。',
    reusable_angle: '宠物照片上传后生成多种商品效果，用前后对比强化惊喜感。'
  },
  {
    platform: '抖音',
    topic: '明星同款风格',
    title: '普通照片一键生成明星同款周边',
    heat_score: 88,
    keywords: '明星同款, 风格迁移, 粉丝礼物',
    why_trending: '粉丝人群对同款、风格化和应援周边有强互动意愿。',
    reusable_angle: '用明星风格作为内容钩子，最终落到用户自己的图片定制商品。'
  },
  {
    platform: 'Bilibili',
    topic: 'IP类设计',
    title: '把喜欢的角色风格迁移到帆布包设计里',
    heat_score: 92,
    keywords: 'IP风格, AI设计, 小众周边',
    why_trending: '用户喜欢看从灵感到成品的完整过程，适合做长一点的拆解。',
    reusable_angle: '展示灵感图、提示词、商品预览和下单链路，突出低门槛创作。'
  },
];

const DEFAULT_BRIEFS: ProductBrief[] = [
  {
    product_name: 'AI定制商品平台',
    target_user: '宠物主人、追星用户、IP爱好者、情侣礼物用户、喜欢个性化周边的年轻人',
    feature: '用户上传图片并输入文字需求，选择手机壳、T恤、帆布包、抱枕、贴纸等商品类型，AI生成设计图，满意后下单生产发货。',
    pain_point: '传统定制沟通成本高、设计门槛高、成品不确定，用户很难快速看到自己的图片变成商品后的效果。',
    value_prop: '把图片和文字需求快速转成可下单商品设计，让用户低成本获得专属周边。',
    content_angle: '把宠物、人物照片或灵感图变成真实可下单的商品，用生成前后对比和开箱反馈促成转化。'
  }
];

const DEFAULT_RESULTS: CampaignResult[] = [
  { platform: '小红书', title: '我家猫的专属抱枕到了，像把它抱在怀里', hook_type: '开箱惊喜式', views: 45000, likes: 2300, comments: 450, ctr: 5.2, cvr: 1.5, cpi: 3, notes: '萌宠 情绪故事 成品对比强' },
  { platform: '抖音', title: '普通照片做成明星同款风手机壳', hook_type: '反差对比式', views: 32000, likes: 980, comments: 126, ctr: 4.1, cvr: 1.1, cpi: 5, notes: '明星 同款风格 评论区追问多' },
  { platform: 'Bilibili', title: '用AI做一个游戏角色风帆布包，过程全公开', hook_type: '过程拆解式', views: 28000, likes: 760, comments: 88, ctr: 3.6, cvr: 0.8, cpi: 7, notes: 'IP类 游戏IP 适合讲制作流程' },
  { platform: '小红书', title: '把情侣合照变成纪念日礼物，真的不撞款', hook_type: '场景痛点式', views: 18000, likes: 420, comments: 64, ctr: 2.8, cvr: 1.3, cpi: 6, notes: 'IP类 节日IP 礼物场景' },
  { platform: '抖音', title: '这张宠物头像贴纸也太像它本人了', hook_type: '好奇悬念式', views: 8000, likes: 120, comments: 10, ctr: 2.1, cvr: 0.5, cpi: 12, notes: '萌宠 宠物头像 内容偏短' },
];

const DEFAULT_SCRIPTS: SavedScript[] = [];
const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [trends, setTrends] = useState<Trend[]>(DEFAULT_TRENDS);
  const [productBriefs, setProductBriefs] = useState<ProductBrief[]>(DEFAULT_BRIEFS);
  const [campaignResults, setCampaignResults] = useState<CampaignResult[]>(DEFAULT_RESULTS);
  const [scriptLibrary, setScriptLibrary] = useState<SavedScript[]>(DEFAULT_SCRIPTS);
  const [topicPool, setTopicPool] = useState<PoolItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refreshScripts = async () => {
    const response = await fetch('/api/scripts');
    const payload = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(payload.scripts)) {
      setScriptLibrary(payload.scripts);
    }
  };

  useEffect(() => {
    refreshScripts().catch(() => {});
  }, []);

  const loadExcel = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = xlsx.read(data, { type: 'binary' });

          const loadSheet = <T,>(sheetName: string): T[] => {
            const sheet = workbook.Sheets[sheetName];
            return sheet ? xlsx.utils.sheet_to_json<T>(sheet) : [];
          };

          setTrends(loadSheet<Trend>('trends'));
          setProductBriefs(loadSheet<ProductBrief>('product_brief'));
          setCampaignResults(loadSheet<CampaignResult>('campaign_results'));
          setIsLoaded(true);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };

  const loadCampaignResults = (rows: CampaignResult[]) => {
    setCampaignResults(rows);
    setIsLoaded(true);
  };

  const saveScript = (script: SavedScript) => {
    setScriptLibrary(prev => [script, ...prev.filter(item => item.id !== script.id)]);
    fetch('/api/scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(script)
    }).then(() => refreshScripts()).catch(() => {});
  };

  const removeScript = (id: string) => {
    const target = scriptLibrary.find(item => item.id === id);
    setScriptLibrary(prev => prev.filter(item => item.id !== id));
    const fileName = target?.fileName || id;
    fetch(`/api/scripts/${encodeURIComponent(fileName)}`, { method: 'DELETE' })
      .then(() => refreshScripts())
      .catch(() => {});
  };

  const updateScriptProduct = (id: string, product: string) => {
    const target = scriptLibrary.find(item => item.id === id);
    if (!target) return;
    const updated = {
      ...target,
      product,
      tags: Array.from(new Set([...(target.tags || []).filter(tag => tag !== '炫图AI' && tag !== 'leeewow'), product]))
    };
    setScriptLibrary(prev => prev.map(item => item.id === id ? updated : item));
    fetch('/api/scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).then(() => refreshScripts()).catch(() => {});
  };

  const addToTopicPool = (item: PoolItem) => {
    if (!topicPool.find((t) => t.id === item.id)) {
      setTopicPool([...topicPool, item]);
    }
  };

  const removeFromTopicPool = (id: string) => {
    setTopicPool(topicPool.filter((t) => t.id !== id));
  };

  return (
    <DataContext.Provider value={{ trends, productBriefs, campaignResults, scriptLibrary, topicPool, addToTopicPool, removeFromTopicPool, loadExcel, loadCampaignResults, saveScript, removeScript, updateScriptProduct, refreshScripts, isLoaded }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}



