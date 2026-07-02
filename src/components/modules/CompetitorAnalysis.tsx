import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Boxes, Crosshair, Download, FileText, FileVideo, Flame, Loader2, X } from 'lucide-react';
import { useData } from '../../store/DataContext';

type Mode = 'competitor' | 'trend';
type TimelineItem = { time: string; voice?: string; visual?: string; editing?: string; ocr?: string; emotion?: string; selling_point?: string; conversion_role?: string; product_exposure?: string; content?: string };

type ScriptItem = { time?: string; scene?: string; source_basis?: string; visual?: string; voiceover?: string; subtitle?: string; editing?: string; text?: string; placement?: string; purpose?: string };
type TrendPerson = { name?: string; role?: string; relationship?: string };
type TrendSource = { title?: string; link?: string; snippet?: string };
type TrendIdea = { id?: string; title?: string; core_angle?: string; event_hook?: string; product_connection?: string; suitable_platform?: string; why_fit?: string; risk?: string; script_potential?: string };

interface AnalysisResult {
  competitor_timeline?: TimelineItem[];
  content_structure?: string[];
  competitor_hook?: string;
  competitor_rhythm?: string;
  competitor_emotion?: string;
  competitor_product_placement?: string;
  competitor_core_selling_point?: string;
  competitor_pain_points?: string;
  competitor_cta?: string;
  competitor_comments_focus?: string;
  direct_transfer?: string[];
  rewrite_transfer?: string[];
  no_transfer?: string[];
  reasoning?: string;
  evidence_status?: string;
  confidence?: string;
  trend_keywords?: string[];
  trend_summary?: string;
  trend_origin?: string;
  trend_process?: string[];
  trend_current_status?: string;
  trend_people?: TrendPerson[];
  trend_relationships?: string[];
  trend_burst?: string;
  trend_emotion?: string;
  trend_audience?: string;
  trend_comments_conflict?: string;
  trend_risk?: string;
  fit_judgement?: string;
  recommended_angle?: string;
  trend_sources?: TrendSource[];
  our_title?: string;
  our_hook?: string;
  our_script?: ScriptItem[];
  our_placement?: string;
  our_cta?: string;
  script_document?: string;
  comment_interest?: string;
  comment_consult?: string;
  comment_doubt?: string;
  comment_buy?: string;
}

const COMPETITOR_DIMENSIONS = ['前3秒Hook', '镜头节奏', '字幕/OCR', '口播脚本', '产品露出位置', '情绪触发点', '评论区引导', '转化CTA', '可迁移卖点', '风险/侵权点'];
const TREND_DIMENSIONS = ['关键词识别', '联网检索', '事件起因', '事件经过', '人物关系', '争议焦点', '评论情绪', '内容风险', '借势判断'];
const PLATFORM_OPTIONS = ['抖音', '小红书', 'TikTok', 'Instagram', 'YouTube'];
const emptyCompetitorProduct = { name: '' };
const emptyOurProduct = { name: '', features: '', users: '', excluded_points: '' };
const emptyTrendInfo = { title: '', background: '', comments: '', risk_limit: '', platform: '抖音' };

function asText(value: unknown, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => asText(item)).filter(Boolean).join('\n');
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => `${key}：${asText(val)}`)
    .join('\n');
  return fallback;
}

function formatDocumentText(value: unknown) {
  return asText(value)
    .replace(/([一二三四五六七八九十]、)/g, '\n\n$1')
    .replace(/(【[^】]+】)/g, '\n\n$1')
    .replace(/(原片段依据：|原片段作用：|我方改写方向：|产品功能植入：|用户心理：|我方画面：|口播：|屏幕字幕：|剪辑\/节奏：|产品植入：|转化目的：)/g, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeScriptPayload(payload: any): AnalysisResult {
  const normalized: AnalysisResult = {
    ...payload,
    our_title: asText(payload?.our_title, '我方创作脚本'),
    our_hook: asText(payload?.our_hook),
    our_placement: asText(payload?.our_placement),
    our_cta: asText(payload?.our_cta),
    script_document: formatDocumentText(payload?.script_document || payload?.document || payload?.方案 || payload),
    comment_interest: asText(payload?.comment_interest),
    comment_consult: asText(payload?.comment_consult),
    comment_doubt: asText(payload?.comment_doubt),
    comment_buy: asText(payload?.comment_buy),
  };
  if (Array.isArray(payload?.our_script)) {
    normalized.our_script = payload.our_script.map((item: any) => ({
      time: asText(item?.time || item?.时间段),
      scene: asText(item?.scene || item?.镜头),
      source_basis: asText(item?.source_basis || item?.原片段依据),
      visual: asText(item?.visual || item?.我方画面 || item?.画面),
      voiceover: asText(item?.voiceover || item?.voice || item?.口播),
      subtitle: asText(item?.subtitle || item?.屏幕字幕 || item?.字幕),
      editing: asText(item?.editing || item?.剪辑 || item?.节奏),
      text: asText(item?.text),
      placement: asText(item?.placement || item?.产品植入),
      purpose: asText(item?.purpose || item?.转化目的 || item?.用户心理),
    }));
  }
  return normalized;
}

const demoAnalysis: AnalysisResult = {
  competitor_hook: '前3秒用强反差展示“普通照片变成可下单商品”。',
  competitor_rhythm: '前3秒快切，4-12秒步骤拆解，结尾放慢承接转化。',
  competitor_emotion: '好奇、惊喜、想拥有同款。',
  competitor_product_placement: '第5秒露出上传图片，第10秒露出商品预览，第18秒露出下单路径。',
  competitor_timeline: [
    { time: '0-3s', voice: '直接抛出反差问题', visual: '普通照片与成品快速对比', editing: '快切+强对比', ocr: '大字标题强化结果', product_exposure: '先不露产品' },
    { time: '4-8s', voice: '解释上传图片和选择商品类型', visual: '展示操作界面', editing: '步骤切分', ocr: '上传/选择/生成', product_exposure: '第一次露出核心功能' },
    { time: '9-15s', voice: '强调AI生成多版设计', visual: '商品应用场景轮播', editing: '结果密集展示', ocr: '不撞款/可下单', product_exposure: '展示商品预览' },
  ],
  competitor_core_selling_point: '把普通图片快速变成可购买的个性化商品。',
  competitor_pain_points: '传统定制沟通成本高、设计费贵、容易撞款。',
  competitor_cta: '评论“同款”或点击主页入口体验。',
  competitor_comments_focus: '用户会问能不能做宠物/情侣照、价格、发货周期和效果稳定性。',
  direct_transfer: ['前后对比开场', '展示生成过程', '评论区求同款承接'],
  rewrite_transfer: ['把竞品表达改成我方“上传图片+文字需求+选择商品类型”的路径。'],
  no_transfer: ['竞品品牌口号、专属模板名、未授权IP画面。'],
  reasoning: '结构可迁移，但素材和品牌表达必须替换成我方资产。',
};

const demoScript: AnalysisResult = {
  our_title: '把你家宠物做成真正能下单的专属周边',
  our_hook: '别只把宠物照片存在相册里，30秒把它变成专属抱枕。',
  our_placement: '第5秒展示上传图片和选择商品类型，第12秒展示AI生成效果，第20秒进入下单路径。',
  our_cta: '评论“宠物”，领取适合猫狗照片的生成模板。',
  script_document: `标题：把你家宠物做成真正能下单的专属周边

核心策略：用竞品的“前后反差 + 生成过程 + 成品展示”结构承接用户停留，但把表达改成我方产品的真实操作路径：上传图片、输入文字需求、选择商品类型、满意后下单发货。

完整脚本：
0-3秒：画面展示宠物原图和成品抱枕快速对比。口播：别只把宠物照片存在相册里，它也可以变成你每天抱得到的东西。
3-8秒：画面进入产品界面，展示上传图片、输入风格需求、选择抱枕/手机壳/T恤。字幕：上传图片 + 写一句需求 + 选择商品。
8-15秒：展示AI生成多版设计图，横向切换不同商品效果。口播：AI会先生成设计图，满意后再下单，不用反复找设计师沟通。
15-22秒：展示成品效果对比和下单发货路径。口播：想做宠物版、情侣版、头像版，都可以从一张照片开始。
22-25秒：评论区引导。字幕：评论“宠物”，我整理一版适合猫狗照片的模板。

产品植入：产品在第4秒自然出现，先解决“怎么做”的问题，再在第15秒承接“可以下单”的转化。

CTA：评论“宠物”领取模板，或进入主页上传图片试做。`,
  our_script: [
    { scene: '宠物原图与成品抱枕对比', text: '别只把宠物照片存在相册里。', placement: '用结果吸引停留' },
    { scene: '上传图片并选择商品类型', text: '上传图片，再写一句想要的风格。', placement: '展示核心功能' },
    { scene: 'AI生成多版设计图', text: '满意后再下单，不用找设计师反复沟通。', placement: '强化转化理由' },
  ],
  comment_interest: '可以用自己的宠物照片生成，适合做头像、抱枕和手机壳。',
  comment_consult: '流程是上传图片、输入风格、选择商品类型，满意后再下单。',
  comment_doubt: '效果会受原图清晰度影响，正脸、光线清楚的照片会更稳定。',
  comment_buy: '想看同款可以先评论宠物类型，我会按猫/狗/情侣照整理模板。',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">{label}</label>{children}</div>;
}
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full p-3 bg-[#F0F0F0] border-2 border-[#121212] font-bold outline-none focus:bg-white" />;
}
function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="w-full p-3 bg-[#F0F0F0] border-2 border-[#121212] font-bold outline-none focus:bg-white resize-none" />;
}
async function saveWordToLibrary(payload: {
  title: string;
  body: string;
  sourceType: string;
  platform?: string;
  product?: string;
  hook?: string;
  cta?: string;
  tags?: string[];
}) {
  const response = await fetch('/api/export-word-to-library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      createdAt: new Date().toLocaleString()
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '保存 Word 失败');
  return result;
}

function buildAnalysisDocument(mode: Mode, analysis: AnalysisResult) {
  if (mode === 'trend') {
    const people = analysis.trend_people?.map((person, i) => `${i + 1}. ${person.name || '未知'}｜${person.role || ''}｜${person.relationship || ''}`).join('\n') || '';
    const clues = analysis.competitor_timeline?.map((item, i) => `${i + 1}. ${item.time}\n画面：${item.visual || ''}\n口播：${item.voice || item.content || ''}\nOCR：${item.ocr || ''}\n线索：${item.conversion_role || item.selling_point || ''}`).join('\n\n') || '';
    return `热点事件解析\n\n关键词：\n${(analysis.trend_keywords || []).join('、')}\n\n事件摘要：\n${analysis.trend_summary || ''}\n\n事件起因：\n${analysis.trend_origin || ''}\n\n事件经过：\n${(analysis.trend_process || []).join('\n')}\n\n当前状态：\n${analysis.trend_current_status || ''}\n\n涉及人物/账号/机构：\n${people}\n\n关系链/冲突链：\n${(analysis.trend_relationships || []).join('\n')}\n\n爆点来源：\n${analysis.trend_burst || ''}\n\n情绪触发：\n${analysis.trend_emotion || ''}\n\n人群关注点：\n${analysis.trend_audience || ''}\n\n评论区争议：\n${analysis.trend_comments_conflict || ''}\n\n内容风险：\n${analysis.trend_risk || ''}\n\n借势判断：\n${analysis.fit_judgement || ''}\n\n安全角度：\n${analysis.recommended_angle || ''}\n\n视频线索：\n${clues}`;
  }
  const summary = `Hook/开场策略：${analysis.competitor_hook || ''}\n内容结构：${analysis.content_structure?.join(' -> ') || analysis.competitor_rhythm || ''}\n核心卖点：${analysis.competitor_core_selling_point || ''}\n转化触发：${analysis.competitor_cta || analysis.competitor_product_placement || ''}`;
  const timeline = analysis.competitor_timeline?.map((item, i) => `${i + 1}. ${item.time}\n画面：${item.visual || ''}\n口播：${item.voice || item.content || ''}\nOCR：${item.ocr || ''}\n剪辑：${item.editing || ''}\n情绪：${item.emotion || ''}\n卖点：${item.selling_point || item.product_exposure || ''}\n作用：${item.conversion_role || ''}`).join('\n\n') || '';
  return `${summary}\n\n时间轴拆解：\n${timeline}\n\n内容结构：\n${(analysis.content_structure || []).join('\n')}\n\n可迁移点：\n${(analysis.direct_transfer || []).join('\n')}\n\n不建议迁移：\n${(analysis.no_transfer || []).join('\n')}`;
}
export function CompetitorAnalysis() {
  const { saveScript, refreshScripts } = useData();
  const [mode, setMode] = useState<Mode>('competitor');
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [competitorProduct, setCompetitorProduct] = useState(emptyCompetitorProduct);
  const [ourProduct, setOurProduct] = useState(emptyOurProduct);
  const [trendInfo, setTrendInfo] = useState(emptyTrendInfo);
  const [selectedDims, setSelectedDims] = useState<string[]>(COMPETITOR_DIMENSIONS);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [script, setScript] = useState<AnalysisResult | null>(null);
  const [trendIdeas, setTrendIdeas] = useState<TrendIdea[]>([]);
  const [generatingTrendIdeaId, setGeneratingTrendIdeaId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisErrorCode, setAnalysisErrorCode] = useState('');
  const [exportStatus, setExportStatus] = useState('');

  const dimensions = mode === 'competitor' ? COMPETITOR_DIMENSIONS : TREND_DIMENSIONS;
  const sourceLabel = mode === 'competitor' ? '竞品内容' : '热点事件内容';

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    setAnalysis(null);
    setScript(null);
    setTrendIdeas([]);
    setSelectedDims(nextMode === 'competitor' ? COMPETITOR_DIMENSIONS : TREND_DIMENSIONS);
  };

  const handleAnalyze = async () => {
    if (!videoFile) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    setScript(null);
    setTrendIdeas([]);
    setAnalysisError('');
    setAnalysisErrorCode('');
    setExportStatus('');
    try {
      const meta = {
        mode: mode === 'competitor' ? '竞品脚本拆解' : '热点事件解析',
        import_type: 'upload',
        text: '',
        competitor_product: { source: '由系统根据导入内容自动分析', ...competitorProduct },
        hot_event: trendInfo,
        dimensions: selectedDims,
      };
      const response = await fetch('/api/analyze-competitor-upload', {
        method: 'POST',
        headers: {
          'Content-Type': videoFile.type || 'application/octet-stream',
          'X-ContentOps-Meta': encodeURIComponent(JSON.stringify(meta)),
        },
        body: videoFile,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload.error || '拆解失败';
        const error: any = new Error(message);
        error.code = payload.code || '';
        throw error;
      }
      setAnalysis(payload);
    } catch (err: any) {
      setAnalysisError(err?.message || '拆解失败，请换一个 mp4 视频上传。');
      setAnalysisErrorCode(err?.code || '');
    } finally {
      setIsAnalyzing(false);
    }
  };


  const handleGenerateTrendIdeas = async () => {
    if (!analysis) return;
    setIsGenerating(true);
    setTrendIdeas([]);
    try {
      const response = await fetch('/api/generate-trend-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, product: trendInfo })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '生成结合建议失败');
      setTrendIdeas(Array.isArray(payload.trend_ideas) ? payload.trend_ideas : []);
    } catch (err: any) {
      setAnalysisError(err?.message || '生成结合建议失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!analysis) return;
    setIsGenerating(true);
    setScript(null);
    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, our_product: ourProduct, hot_event: trendInfo, mode })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error([payload.error, payload.detail].filter(Boolean).join('：') || '生成脚本失败');
      setScript(normalizeScriptPayload(payload));
    } catch (err: any) {
      setAnalysisError(err?.message || '生成脚本失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateTrendScript = async (idea: TrendIdea) => {
    if (!analysis) return;
    setGeneratingTrendIdeaId(idea.id || idea.title || 'selected');
    setIsGenerating(true);
    setScript(null);
    try {
      const response = await fetch('/api/generate-trend-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, product: trendInfo, idea })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '生成脚本失败');
      setScript(normalizeScriptPayload(payload));
    } catch (err: any) {
      setAnalysisError(err?.message || '生成脚本失败');
    } finally {
      setIsGenerating(false);
      setGeneratingTrendIdeaId(null);
    }
  };

  const exportWord = async () => {
    if (!script) return;
    const title = asText(script.our_title, '我方创作脚本');
    const product = mode === 'competitor' ? ourProduct.name : trendInfo.product_name;
    const platform = mode === 'trend' ? trendInfo.platform : '未标注平台';
    try {
      await saveWordToLibrary({
        title,
        body: buildScriptDocument(script),
        sourceType: mode === 'competitor' ? '竞品脚本拆解' : '热点事件解析',
        platform,
        product: product || '未标注产品',
        hook: asText(script.our_hook, '暂无'),
        cta: asText(script.our_cta, '暂无'),
        tags: [mode === 'competitor' ? '竞品迁移' : '热点迁移', '最终脚本', platform, product].filter(Boolean)
      });
      await refreshScripts();
      setExportStatus('已保存 Word 到脚本文件夹，并同步到脚本库。');
    } catch (err: any) {
      setAnalysisError(err?.message || '保存 Word 失败');
    }
  };

  const saveCurrentScript = () => {
    if (!script) return;
    const product = mode === 'competitor' ? ourProduct.name : trendInfo.product_name;
    const platform = mode === 'trend' ? trendInfo.platform : '未标注平台';
    saveScript({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: asText(script.our_title, '我方创作脚本'),
      sourceType: mode === 'competitor' ? '竞品脚本拆解' : '热点事件解析',
      platform,
      product: product || '未标注产品',
      hook: asText(script.our_hook, '暂无'),
      cta: asText(script.our_cta, '暂无'),
      tags: [mode === 'competitor' ? '竞品迁移' : '热点迁移', platform, product].filter(Boolean),
      createdAt: new Date().toLocaleString(),
      content: buildScriptDocument(script)
    });
  };

  const exportAnalysisWord = async () => {
    if (!analysis) return;
    const title = mode === 'competitor' ? '竞品拆解结果' : '热点拆解结果';
    try {
      await saveWordToLibrary({
        title,
        body: buildAnalysisDocument(mode, analysis),
        sourceType: mode === 'competitor' ? '竞品脚本拆解' : '热点事件解析',
        platform: mode === 'trend' ? trendInfo.platform : '未标注平台',
        product: mode === 'trend' ? trendInfo.product_name || '未标注产品' : ourProduct.name || '未标注产品',
        hook: mode === 'competitor' ? asText(analysis.competitor_hook, '暂无') : asText(analysis.trend_summary, '暂无'),
        cta: asText(analysis.competitor_cta || analysis.recommended_angle, '暂无'),
        tags: [mode === 'competitor' ? '竞品拆解' : '热点解析', '拆解结果', mode === 'trend' ? trendInfo.platform : '未标注平台'].filter(Boolean)
      });
      await refreshScripts();
      setExportStatus('已保存 Word 到脚本文件夹，并同步到脚本库。');
    } catch (err: any) {
      setAnalysisError(err?.message || '保存 Word 失败');
    }
  };

  const toggleDim = (dim: string) => setSelectedDims(prev => prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]);

  return (
    <div className="space-y-8">
      <Card decoration="square" decorationColor="yellow" className="bg-white">
        <h2 className="text-2xl font-black border-b-4 border-[#121212] pb-4 mb-6">选择拆解类型</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModeButton active={mode === 'competitor'} icon={<Boxes className="w-8 h-8 mb-3" />} title="竞品脚本拆解" desc="先拆解竞品内容，再结合我方产品生成脚本。" onClick={() => handleModeChange('competitor')} color="blue" />
          <ModeButton active={mode === 'trend'} icon={<Flame className="w-8 h-8 mb-3" />} title="热点事件解析" desc="识别关键词并联网检索，讲清事件脉络和人物关系。" onClick={() => handleModeChange('trend')} color="red" />
        </div>
      </Card>

      <Card decoration="square" decorationColor="blue" className="bg-white">
        <h2 className="text-2xl font-black border-b-4 border-[#121212] pb-4 mb-6">1. 导入并{mode === 'competitor' ? '拆解' : '解析'}{sourceLabel}</h2>
        <UploadBox videoFile={videoFile} setVideoFile={setVideoFile} sourceLabel={sourceLabel} />
        <div className="mt-6 pt-6 border-t-4 border-[#121212]"><Button variant="primary" onClick={handleAnalyze} disabled={isAnalyzing || !videoFile} className="w-full md:w-auto px-8 py-4 text-xl">{isAnalyzing ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <Crosshair className="w-6 h-6 mr-2" />}开始拆解</Button>{analysisError && <div className="mt-4 bg-[#D02020] text-white border-4 border-[#121212] p-4 font-black"><p>{analysisError}</p></div>}{exportStatus && <div className="mt-4 bg-[#F0C020] text-[#121212] border-4 border-[#121212] p-4 font-black"><p>{exportStatus}</p></div>}</div>
      </Card>

      {analysis && <AnalysisPanel mode={mode} analysis={analysis} onExport={exportAnalysisWord} />}

      {analysis && mode === 'competitor' && <ProductStep mode={mode} competitorProduct={competitorProduct} setCompetitorProduct={setCompetitorProduct} ourProduct={ourProduct} setOurProduct={setOurProduct} trendInfo={trendInfo} setTrendInfo={setTrendInfo} />}

      {analysis && mode === 'trend' && <TrendProductStep trendInfo={trendInfo} setTrendInfo={setTrendInfo} />}

      {analysis && mode === 'trend' && <Card decoration="square" decorationColor="yellow" className="bg-white"><h2 className="text-2xl font-black border-b-4 border-[#121212] pb-4 mb-6">3. 生成热点结合建议</h2><Button variant="primary" onClick={handleGenerateTrendIdeas} disabled={!analysis || isGenerating} className="w-full md:w-auto px-8 py-4 text-xl">{isGenerating ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <FileText className="w-6 h-6 mr-2" />}生成结合建议</Button></Card>}

      {trendIdeas.length > 0 && <TrendIdeasPanel ideas={trendIdeas} onSelect={handleGenerateTrendScript} generatingId={generatingTrendIdeaId} isGenerating={isGenerating} />}

      {analysis && mode === 'competitor' && <Card decoration="square" decorationColor="yellow" className="bg-white">
        <h2 className="text-2xl font-black border-b-4 border-[#121212] pb-4 mb-6">3. 生成我方创作脚本</h2>
        <div className="flex flex-wrap gap-3 mb-6">{dimensions.map(dim => <label key={dim} className="flex items-center gap-2 cursor-pointer bg-[#F0F0F0] px-3 py-2 border-2 border-transparent hover:border-gray-300 transition-colors"><input type="checkbox" checked={selectedDims.includes(dim)} onChange={() => toggleDim(dim)} className="w-4 h-4 accent-[#121212]" /><span className="font-bold text-sm uppercase">{dim}</span></label>)}</div>
        <Button variant="primary" onClick={handleGenerateScript} disabled={!analysis || isGenerating} className="w-full md:w-auto px-8 py-4 text-xl">{isGenerating ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <FileText className="w-6 h-6 mr-2" />}结合拆解结果生成脚本</Button>
      </Card>}

      {script && <ScriptDocument script={script} onExport={exportWord} onSave={saveCurrentScript} />}
    </div>
  );
}

function UploadBox({ videoFile, setVideoFile, sourceLabel }: any) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)) {
      alert('请选择视频文件');
      return;
    }
    if (file.size > 120 * 1024 * 1024) {
      alert('视频太大了，建议先压缩到 120MB 以内');
      return;
    }
    setVideoFile(file);
  };

  return (
    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-6 text-center">
      {!videoFile ? (
        <label className="flex flex-col items-center justify-center gap-3 cursor-pointer min-h-40">
          <FileVideo className="w-12 h-12 text-gray-500" />
          <p className="font-bold text-[#121212]">点击选择{sourceLabel}视频</p>
          <p className="text-sm text-gray-500">支持 mp4、mov、webm、mkv、avi，建议 3 分钟以内</p>
          <input type="file" accept="video/*,.mp4,.mov,.webm,.mkv,.avi" className="sr-only" onChange={handleFileChange} />
        </label>
      ) : (
        <div className="flex items-center justify-between bg-white border-2 border-[#121212] p-4">
          <div className="flex items-center gap-3">
            <FileVideo className="w-8 h-8 text-[#1040C0]" />
            <div className="text-left">
              <p className="font-bold text-[#121212] truncate max-w-[220px] sm:max-w-sm">{videoFile.name}</p>
              <p className="text-xs text-gray-500">{(videoFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button onClick={() => setVideoFile(null)} className="p-2 bg-red-100 text-red-600 hover:bg-red-200"><X className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, icon, title, desc, onClick, color }: { active: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void; color: 'blue' | 'red' }) {
  return <button onClick={onClick} className={`text-left border-4 border-[#121212] p-5 transition-all ${active ? `${color === 'blue' ? 'bg-[#1040C0]' : 'bg-[#D02020]'} text-white shadow-[6px_6px_0px_0px_#121212]` : 'bg-[#F0F0F0] hover:-translate-y-1'}`}>{icon}<h3 className="text-2xl font-black mb-2">{title}</h3><p className="font-bold opacity-80">{desc}</p></button>;
}

function AnalysisPanel({ mode, analysis, onExport }: { mode: Mode; analysis: AnalysisResult; onExport: () => void }) {
  const isLocalFallback = analysis.reasoning?.includes('不是最终完整拆解') || analysis.reasoning?.includes('不是完整竞品拆解') || analysis.reasoning?.includes('模型调用失败') || analysis.reasoning?.includes('API key') || analysis.reasoning?.includes('人工复核');
  if (mode === 'trend') {
    return <Card decoration="square" decorationColor="red" className="bg-white"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-4 border-[#121212] pb-4 mb-6"><div><h2 className="text-2xl font-black">2. 热点事件解析结果</h2><p className="font-black text-gray-500 mt-2">关键词识别 + 联网检索 + 事件脉络梳理</p></div><Button variant="outline" onClick={onExport}><Download className="w-5 h-5" /> 导出Word</Button></div>{isLocalFallback && <div className="mb-6 border-4 border-[#121212] bg-[#FFD23F] p-4 font-black">{analysis.reasoning || '联网资料不足，事件结论需要人工复核。'}</div>}<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"><InfoBox label="可信度" value={analysis.confidence || 'low'} /><InfoBox label="证据状态" value={analysis.evidence_status || analysis.reasoning} /><InfoBox label="事件摘要" value={analysis.trend_summary} /><InfoBox label="当前状态" value={analysis.trend_current_status} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><SectionBox title="识别关键词" items={analysis.trend_keywords} /><SectionBox title="事件经过" items={analysis.trend_process} /><SectionBox title="人物/账号/机构关系" items={analysis.trend_people?.map(person => `${person.name || '未知'}：${person.role || ''}${person.relationship ? `，${person.relationship}` : ''}`)} /><SectionBox title="关系链/冲突链" items={analysis.trend_relationships} /></div><div className="mt-6 border-4 border-[#121212] bg-[#F0F0F0]"><div className="bg-[#121212] text-white font-black p-3">视频线索</div>{analysis.competitor_timeline?.map((item, i) => <div key={i} className="grid grid-cols-1 md:grid-cols-[90px_1.2fr_1fr] gap-3 border-b border-[#121212]/20 p-3 font-bold text-sm"><div className="font-black text-lg">{item.time}</div><div><p>画面：{item.visual || '暂无'}</p><p>口播：{item.voice || item.content || '暂无'}</p><p>OCR：{item.ocr || '暂无'}</p></div><div>线索：{item.conversion_role || item.selling_point || '暂无'}</div></div>)}</div></Card>;
  }
  return <Card decoration="square" decorationColor="red" className="bg-white"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-4 border-[#121212] pb-4 mb-6"><h2 className="text-2xl font-black">2. 竞品拆解结果</h2><Button variant="outline" onClick={onExport}><Download className="w-5 h-5" /> 导出Word</Button></div>{isLocalFallback && <div className="mb-6 border-4 border-[#121212] bg-[#FFD23F] p-4 font-black">{analysis.reasoning || '当前只完成了本地抽帧、镜头切分和OCR识别，还不是最终完整拆解。'}</div>}<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">{[['Hook/开场策略', analysis.competitor_hook], ['内容结构', analysis.content_structure?.join(' -> ') || analysis.competitor_rhythm], ['核心卖点', analysis.competitor_core_selling_point], ['转化触发', analysis.competitor_cta || analysis.competitor_product_placement]].map(([label, value]) => <InfoBox key={label} label={label} value={value as string} />)}</div><div className="border-4 border-[#121212] bg-[#F0F0F0]"><div className="grid grid-cols-[90px_1.2fr_1fr_1fr] gap-3 bg-[#121212] text-white font-black text-sm p-3"><span>时间</span><span>画面/口播/OCR</span><span>剪辑/情绪</span><span>卖点/转化作用</span></div>{analysis.competitor_timeline?.map((item, i) => <div key={i} className="grid grid-cols-1 md:grid-cols-[90px_1.2fr_1fr_1fr] gap-3 border-b border-[#121212]/20 p-3 font-bold text-sm"><div className="font-black text-lg">{item.time}</div><div className="space-y-2"><p>画面：{item.visual || '暂无'}</p><p>口播：{item.voice || item.content || '暂无'}</p><p>OCR：{item.ocr || '暂无'}</p></div><div className="space-y-2"><p>剪辑：{item.editing || '暂无'}</p><p>情绪：{item.emotion || '暂无'}</p></div><div className="space-y-2"><p>卖点：{item.selling_point || item.product_exposure || '暂无'}</p><p>作用：{item.conversion_role || '暂无'}</p></div></div>)}</div><div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6"><MiniList title="内容结构" items={analysis.content_structure} /><MiniList title="可迁移点" items={analysis.direct_transfer} /><MiniList title="不建议迁移" items={analysis.no_transfer} /></div></Card>;
}

function InfoBlock({ title, value }: { title: string; value?: string }) {
  return <div className="border-2 border-[#121212] bg-[#F0F0F0] p-4"><h3 className="font-black mb-2">{title}</h3><p className="font-bold">{value || '暂无'}</p></div>;
}

function SectionBox({ title, items }: { title: string; items?: string[] }) {
  return <div className="border-2 border-[#121212] bg-[#F0F0F0] p-4"><h3 className="font-black mb-2">{title}</h3><ul className="list-disc pl-5 font-bold text-sm space-y-1">{items?.length ? items.map((item, i) => <li key={i}>{item}</li>) : <li>暂无</li>}</ul></div>;
}
function InfoBox({ label, value }: { label: string; value?: string; key?: React.Key }) {
  return <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3"><span className="text-xs font-bold text-gray-500 block mb-1">{label}</span><p className="font-black text-sm">{value || '暂无'}</p></div>;
}
function MiniList({ title, items }: { title: string; items?: string[] }) {
  return <div><h3 className="font-black mb-2">{title}</h3><ul className="list-disc pl-5 font-bold text-sm space-y-1">{items?.map((item, i) => <li key={i}>{item}</li>) || <li>暂无</li>}</ul></div>;
}

function ProductStep({ mode, ourProduct, setOurProduct, trendInfo, setTrendInfo }: any) {
  return mode === 'competitor' ? <CompetitorProductStep ourProduct={ourProduct} setOurProduct={setOurProduct} /> : <TrendProductStep trendInfo={trendInfo} setTrendInfo={setTrendInfo} />;
}
function CompetitorProductStep({ ourProduct, setOurProduct }: any) {
  return <Card decoration="square" decorationColor="blue" className="bg-white"><h2 className="text-2xl font-black border-b-4 border-[#121212] pb-4 mb-6">2. 补充我方产品信息</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><Field label="我方产品名称"><TextInput value={ourProduct.name} onChange={e => setOurProduct({ ...ourProduct, name: e.target.value })} /></Field><Field label="我方想要呈现的功能"><TextInput value={ourProduct.features} onChange={e => setOurProduct({ ...ourProduct, features: e.target.value })} /></Field><Field label="我方目标用户"><TextInput value={ourProduct.users} onChange={e => setOurProduct({ ...ourProduct, users: e.target.value })} /></Field></div></Card>;
}
function TrendProductStep({ trendInfo, setTrendInfo }: any) {
  return <Card decoration="square" decorationColor="blue" className="bg-white"><h2 className="text-2xl font-black border-b-4 border-[#121212] pb-4 mb-6">2. 补充我方产品信息</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Field label="分发平台"><div className="flex flex-wrap gap-2">{PLATFORM_OPTIONS.map(platform => <button type="button" key={platform} onClick={() => setTrendInfo({ ...trendInfo, platform })} className={`px-4 py-3 border-2 border-[#121212] font-black ${trendInfo.platform === platform ? 'bg-[#121212] text-white' : 'bg-[#F0F0F0] text-[#121212]'}`}>{platform}</button>)}</div></Field><Field label="我方产品名称"><TextInput value={trendInfo.product_name} onChange={e => setTrendInfo({ ...trendInfo, product_name: e.target.value })} /></Field><Field label="我方想要呈现的功能"><TextArea value={trendInfo.product_feature} onChange={e => setTrendInfo({ ...trendInfo, product_feature: e.target.value })} className="h-24" /></Field><Field label="目标用户"><TextInput value={trendInfo.target_user} onChange={e => setTrendInfo({ ...trendInfo, target_user: e.target.value })} /></Field></div></Card>;
}

function TrendIdeasPanel({ ideas, onSelect, generatingId, isGenerating }: { ideas: TrendIdea[]; onSelect: (idea: TrendIdea) => void; generatingId: string | null; isGenerating: boolean }) {
  return <Card decoration="square" decorationColor="yellow" className="bg-white"><h2 className="text-2xl font-black border-b-4 border-[#121212] pb-4 mb-6">热点 x 产品结合建议</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{ideas.map((idea, i) => { const ideaKey = idea.id || idea.title || `idea-${i}`; const isThisGenerating = generatingId === ideaKey; return <div key={ideaKey} className="border-4 border-[#121212] bg-[#F0F0F0] p-5"><div className="flex items-start justify-between gap-3 mb-3"><h3 className="text-xl font-black">{idea.title || `思路 ${i + 1}`}</h3><span className="bg-[#121212] text-white px-3 py-1 font-black text-xs">可选思路</span></div><p className="font-black mb-3">核心角度：{idea.core_angle || '暂无'}</p><div className="space-y-2 font-bold text-sm"><p>当前热点依据：{idea.event_hook || '暂无'}</p><p>产品结合：{idea.product_connection || '暂无'}</p><p>适合平台：{idea.suitable_platform || '暂无'}</p><p>为什么适合：{idea.why_fit || '暂无'}</p><p>风险规避：{idea.risk || '暂无'}</p><p>后续脚本结构：{idea.script_potential || '暂无'}</p></div><Button variant="outline" className="mt-4 w-full" onClick={() => onSelect(idea)} disabled={isGenerating}>{isThisGenerating ? '生成中...' : '选择这个思路生成脚本'}</Button></div>; })}</div></Card>;
}
function scriptLineValue(...values: unknown[]) {
  for (const value of values) {
    const text = asText(value).trim();
    if (text) return text;
  }
  return '暂无';
}

function buildScriptDocument(script: AnalysisResult) {
  const scenes = script.our_script?.map((s, i) => `${i + 1}. ${s.time || s.scene || `第${i + 1}段`}
原片段依据：${s.source_basis || ''}
我方画面：${s.visual || s.scene || ''}
口播：${s.voiceover || s.text || ''}
屏幕字幕：${s.subtitle || ''}
剪辑/节奏：${s.editing || ''}
产品植入：${s.placement || ''}
转化目的：${s.purpose || ''}`).join('\n\n') || '';
  return `标题：${script.our_title || ''}\n\n前3秒Hook：${script.our_hook || ''}\n\n完整脚本：\n${scenes}\n\n评论区引导：\n兴趣型：${script.comment_interest || ''}\n咨询型：${script.comment_consult || ''}\n质疑型：${script.comment_doubt || ''}\n求链接：${script.comment_buy || ''}`;
}
function ScriptDocument({ script, onExport, onSave }: { script: AnalysisResult; onExport: () => void; onSave: () => void }) {
  const title = asText(script.our_title, '我方创作脚本');
  const scenes = script.our_script || [];
  const commentItems = [
    ['兴趣型', script.comment_interest],
    ['咨询型', script.comment_consult],
    ['质疑型', script.comment_doubt],
    ['求链接', script.comment_buy],
  ];
  return <Card decoration="square" decorationColor="red" className="bg-white"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-4 border-[#121212] pb-4 mb-6"><div><h2 className="text-3xl font-black">我方创作脚本</h2><p className="font-black text-gray-500 mt-2">按拆解脚本逐段迁移生成</p></div><div className="flex flex-col sm:flex-row gap-3"><Button variant="primary" onClick={onSave}><FileText className="w-5 h-5" /> 沉淀到脚本库</Button><Button variant="outline" onClick={onExport}><Download className="w-5 h-5" /> 导出Word</Button></div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"><InfoBox label="标题" value={title} /><InfoBox label="前3秒Hook" value={script.our_hook} /><InfoBox label="主CTA" value={script.our_cta} /></div><div className="border-4 border-[#121212] bg-[#F0F0F0]"><div className="grid grid-cols-[90px_1.2fr_1fr_1fr] gap-3 bg-[#121212] text-white font-black text-sm p-3"><span>时间</span><span>我方画面/口播/字幕</span><span>剪辑/产品植入</span><span>依据/目的</span></div>{scenes.map((item, i) => <div key={i} className="grid grid-cols-1 md:grid-cols-[90px_1.2fr_1fr_1fr] gap-3 border-b border-[#121212]/20 p-3 font-bold text-sm"><div className="font-black text-lg">{scriptLineValue(item.time, item.scene, `第${i + 1}段`)}</div><div className="space-y-2"><p>画面：{scriptLineValue(item.visual, item.scene)}</p><p>口播：{scriptLineValue(item.voiceover, item.text)}</p><p>字幕：{scriptLineValue(item.subtitle)}</p></div><div className="space-y-2"><p>剪辑：{scriptLineValue(item.editing)}</p><p>植入：{scriptLineValue(item.placement)}</p></div><div className="space-y-2"><p>原片依据：{scriptLineValue(item.source_basis)}</p><p>目的：{scriptLineValue(item.purpose)}</p></div></div>)}</div><div className="mt-6 border-4 border-[#121212] bg-white"><div className="bg-[#121212] text-white font-black p-3">评论引导话术</div><div className="grid grid-cols-1 md:grid-cols-2 gap-0">{commentItems.map(([label, value]) => <div key={label} className="border-b md:border-r border-[#121212]/20 p-4"><span className="text-xs font-black text-gray-500 block mb-2">{label}</span><p className="font-bold">{asText(value, '暂无')}</p></div>)}</div></div></Card>;
}

































