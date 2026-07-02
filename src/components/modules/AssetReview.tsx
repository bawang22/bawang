import React, { useMemo, useRef, useState } from 'react';
import { Copy, FileText, Search, Trash2, Upload } from 'lucide-react';
import mammoth from 'mammoth';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useData, SavedScript } from '../../store/DataContext';

const ALL = '全部';
const PRODUCT_OPTIONS = [ALL, '炫图AI', 'leeewow'];

function guessProduct(fileName: string, content: string) {
  const text = `${fileName} ${content}`.toLowerCase();
  if (/lee+wow|leewow/.test(text)) return 'leeewow';
  if (/炫图|xuan|p图|修图|图片/.test(text)) return '炫图AI';
  return '炫图AI';
}

function firstLine(content: string) {
  return content.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '待提炼';
}

export function AssetReview() {
  const { scriptLibrary, removeScript, saveScript, updateScriptProduct } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keyword, setKeyword] = useState('');
  const [productFilter, setProductFilter] = useState(ALL);
  const [copyStatus, setCopyStatus] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [openScriptId, setOpenScriptId] = useState('');

  const filteredScripts = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return scriptLibrary.filter(item => {
      const text = `${item.title} ${item.product} ${item.hook} ${item.cta} ${item.tags.join(' ')} ${item.content}`.toLowerCase();
      return (!q || text.includes(q)) && (productFilter === ALL || item.product === productFilter);
    });
  }, [scriptLibrary, keyword, productFilter]);

  const importScriptFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    let imported = 0;
    for (const file of files) {
      const isDocx = /\.docx$/i.test(file.name);
      const isText = /\.(txt|md)$/i.test(file.name);
      if (!isDocx && !isText) continue;

      const content = isDocx
        ? (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.trim()
        : (await file.text()).trim();
      if (!content) continue;

      const title = file.name.replace(/\.(txt|md|docx)$/i, '');
      const product = guessProduct(file.name, content);
      saveScript({
        id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        title,
        sourceType: '手动沉淀',
        platform: '未标注平台',
        product,
        hook: firstLine(content),
        cta: '待提炼',
        tags: ['历史脚本', product],
        createdAt: new Date().toLocaleString(),
        content
      });
      imported += 1;
    }
    setImportStatus(imported ? `已导入 ${imported} 个脚本` : '未识别到可导入的脚本文件');
    event.target.value = '';
  };

  const copyScript = async (script: SavedScript) => {
    const text = `标题：${script.title}\n产品：${script.product}\nHook：${script.hook}\nCTA：${script.cta}\n标签：${script.tags.join(' / ')}\n\n${script.content}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('已复制脚本');
      window.setTimeout(() => setCopyStatus(''), 1600);
    } catch {
      setCopyStatus('复制失败，可手动选中文本');
    }
  };

  return (
    <div className="space-y-8">
      <Card decoration="square" decorationColor="blue" className="bg-white">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black tracking-tighter mb-2">脚本资产概览</h2>
            <p className="font-bold text-gray-500">这里沉淀你过往的历史脚本，以及从脚本拆解中主动保存下来的可复用脚本。</p>
          </div>
          <div className="min-w-full lg:min-w-[360px] space-y-3">
            <div className="bg-[#F0F0F0] border-2 border-[#121212] p-4 font-bold">
              <span className="text-xs text-gray-500 block mb-1">脚本数</span>
              <span className="text-3xl font-black text-[#1040C0]">{scriptLibrary.length}</span>
            </div>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.docx" multiple className="hidden" onChange={importScriptFiles} />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="w-full">
              <Upload className="w-5 h-5" /> 导入历史脚本
            </Button>
            {importStatus && <div className="bg-[#F0C020] border-2 border-[#121212] p-3 font-black text-sm">{importStatus}</div>}
          </div>
        </div>
      </Card>

      <Card decoration="square" decorationColor="yellow" className="bg-white">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
          <label className="block">
            <span className="text-xs font-bold text-gray-500 uppercase block mb-1">搜索脚本</span>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜标题、产品、Hook、标签、脚本内容" className="w-full pl-10 p-3 bg-[#F0F0F0] border-2 border-[#121212] font-bold outline-none focus:bg-white" />
            </div>
          </label>
          <SelectBox label="产品" value={productFilter} options={PRODUCT_OPTIONS} onChange={setProductFilter} />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredScripts.map(script => (
          <div key={script.id} className="bg-white border-4 border-[#121212] p-5 shadow-[8px_8px_0px_0px_#121212]">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-black text-gray-500 mb-1">{script.product}</p>
                <h3 className="text-2xl font-black leading-tight">{script.title}</h3>
              </div>
              <FileText className="w-8 h-8 text-[#1040C0] shrink-0" />
            </div>
            <p className="font-black text-[#D02020] mb-3">Hook：{script.hook || '暂无'}</p>
            <pre className={`font-bold text-sm mb-4 whitespace-pre-wrap overflow-auto bg-[#F0F0F0] border-2 border-[#121212] p-3 ${openScriptId === script.id ? 'max-h-[720px]' : 'max-h-64'}`}>{script.content}</pre>
            <div className="flex flex-wrap gap-2 mb-4">
              {script.tags.map(tag => <span key={tag} className="bg-[#F0C020] border-2 border-[#121212] px-2 py-1 text-xs font-black">{tag}</span>)}
            </div>
            <div className="mb-4">
              <span className="text-xs font-bold text-gray-500 uppercase block mb-1">产品标注</span>
              <div className="grid grid-cols-2 gap-2">
                {['炫图AI', 'leeewow'].map(product => (
                  <button
                    key={product}
                    type="button"
                    onClick={() => updateScriptProduct(script.id, product)}
                    className={`border-2 border-[#121212] px-3 py-2 font-black text-sm ${script.product === product ? 'bg-[#121212] text-white' : 'bg-white text-[#121212]'}`}
                  >
                    {product}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="primary" onClick={() => setOpenScriptId(openScriptId === script.id ? '' : script.id)} className="flex-1"><FileText className="w-5 h-5" /> {openScriptId === script.id ? '收起' : '打开'}</Button>
              <Button variant="primary" onClick={() => copyScript(script)} className="flex-1"><Copy className="w-5 h-5" /> 复制</Button>
              <Button variant="outline" onClick={() => removeScript(script.id)} className="flex-1"><Trash2 className="w-5 h-5" /> 删除</Button>
            </div>
          </div>
        ))}
        {filteredScripts.length === 0 && <div className="md:col-span-2 xl:col-span-3 bg-white border-4 border-[#121212] p-8 text-center font-black text-gray-400">暂无脚本。可以导入 Word / TXT / Markdown 历史脚本，或在脚本拆解结果里点击“沉淀到脚本库”。</div>}
      </div>
      {copyStatus && <div className="fixed bottom-8 right-8 bg-[#F0C020] border-4 border-[#121212] p-4 font-black shadow-[6px_6px_0px_0px_#121212] z-50">{copyStatus}</div>}
    </div>
  );
}

function SelectBox({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-xs font-bold text-gray-500 uppercase block mb-1">{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="w-full p-3 bg-[#F0F0F0] border-2 border-[#121212] font-black outline-none focus:bg-white">{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
}
