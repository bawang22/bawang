import "dotenv/config";
import express from "express";
import path from "path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import mammoth from "mammoth";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const execFileAsync = promisify(execFile);
  const rawVideoParser = express.raw({ type: ["video/*", "application/octet-stream"], limit: "150mb" });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  function configureProxy() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || "http://127.0.0.1:7890";
    if (!proxyUrl) return;
    try {
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
      console.log(`Outbound proxy enabled: ${proxyUrl.replace(/\/\/.*@/, "//***@")}`);
    } catch (error) {
      console.warn("Failed to configure outbound proxy", error);
    }
  }

  configureProxy();

  let geminiAI: GoogleGenAI | null = null;
  let openaiClient: OpenAI | null = null;
  function getGeminiAI() {
    if (!geminiAI) {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set.");
      }
      geminiAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return geminiAI;
  }

  function getOpenAIClient() {
    if (!openaiClient) {
      if (!process.env.LLM_API_KEY) {
        throw new Error("LLM_API_KEY is not set.");
      }
      openaiClient = new OpenAI({
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
      });
    }
    return openaiClient;
  }

  function getProvider() {
    return (process.env.LLM_PROVIDER || "openai-compatible").toLowerCase();
  }

  function extractJson(text: string) {
    const trimmed = String(text || "").trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
      throw new Error(`模型没有返回合法 JSON：${trimmed.slice(0, 300)}`);
    }
  }

  async function callJsonModel(prompt: string, images: any[] = []) {
    if (getProvider() === "gemini") {
      const contents: any[] = images.length
        ? [prompt, ...images.map((image) => ({ inlineData: { data: image.data, mimeType: image.mimeType || "image/jpeg" } }))]
        : [prompt];
      const response = await getGeminiAI().models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
        contents,
        config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text || "{}");
    }

    const content: any[] = [{ type: "text", text: prompt }];
    for (const image of images.slice(0, 8)) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${image.mimeType || "image/jpeg"};base64,${image.data}` }
      });
    }
    const response = await getOpenAIClient().chat.completions.create({
      model: process.env.LLM_MODEL || "qwen-vl-plus",
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" } as any,
      temperature: 0.3,
    });
    return extractJson(response.choices[0]?.message?.content || "{}");
  }

  function decodeHtml(value: string) {
    return String(value || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  async function searchWeb(query: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&setlang=zh-CN`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 ContentOps/1.0" }
      });
      if (!response.ok) throw new Error(`search failed ${response.status}`);
      const xml = await response.text();
      const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].slice(0, 5).map((match) => {
        const item = match[0];
        const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
        const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
        const snippet = item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
        return { title: decodeHtml(title), link: decodeHtml(link), snippet: decodeHtml(snippet) };
      }).filter((item) => item.title || item.snippet);
      return items;
    } catch (error) {
      console.warn("Trend web search failed", query, error instanceof Error ? error.message : error);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  async function analyzeTrendEvent(input: { text: string; hot_event: any; videoMetadata: any; framePayloads: any[] }) {
    const { text, hot_event, videoMetadata, framePayloads } = input;
    const keywordPrompt = `你是热点事件检索助手。请只根据导入视频链接/文案、OCR、口播转写和关键帧，提取可用于联网搜索的关键词。

【导入内容】${text || "未提供"}
【用户补充】${JSON.stringify(hot_event || {})}
【视频预处理结果】${JSON.stringify(videoMetadata || {})}

要求：
1. 优先提取人名、账号名、品牌名、节目/地点、事件名、显眼字幕。
2. 不确定就给更宽泛的检索词，不要编造不存在的人名。
3. 返回 3-6 个中文搜索词，必要时包含平台名。
只返回合法 JSON：{ "keywords": ["关键词"], "search_queries": ["检索词"], "video_clues": ["视频里明确看到/听到的线索"] }`;
    const keywordResult = await callJsonModel(keywordPrompt, framePayloads);
    const queries = Array.from(new Set([...(keywordResult.search_queries || []), ...(keywordResult.keywords || [])]
      .map((item: any) => String(item || "").trim())
      .filter(Boolean)))
      .slice(0, 5);
    const searchResults = [];
    for (const query of queries) {
      const results = await searchWeb(query);
      searchResults.push({ query, results });
    }

    const flattenedSources = searchResults.flatMap((group) => group.results).slice(0, 10);
    const hasEnoughSources = flattenedSources.length >= 2;
    const finalPrompt = `你是热点事件研究员和内容风控顾问。请基于【视频线索】和【联网检索结果】把热点事件讲清楚。

重要：这一步不是脚本拆解，不要生成我方创作脚本。更重要：严禁编造事件、人物关系、起因经过。

【证据状态】${hasEnoughSources ? "检索到至少2条候选来源，可以谨慎归纳，但仍必须逐项基于来源。" : "联网来源不足，必须输出证据不足，不得补全故事。"}
【导入内容】${text || "未提供"}
【用户补充】${JSON.stringify(hot_event || {})}
【关键词提取】${JSON.stringify(keywordResult || {})}
【联网检索结果】${JSON.stringify(searchResults || [])}
【视频预处理结果】${JSON.stringify(videoMetadata || {})}

硬性规则：
1. 只有在视频线索或检索来源明确出现的信息，才可以写入事件起因、经过、人物关系。
2. 不允许根据同名人物、相似标题、模糊关键词拼接故事。
3. 不允许把搜索结果里没有明确支持的内容写成事实。
4. 如果来源不足、来源不相关、人物无法对应，trend_summary 写“证据不足，无法确认具体热点事件”。
5. 如果不能确认人物关系，trend_people 和 trend_relationships 返回空数组，或写“无法确认”。
6. trend_process 只写有证据的节点；没有证据就返回 ["证据不足，无法还原完整经过"]。
7. 内容运营分析也必须基于已确认信息；无法确认时写“需人工补充关键词/评论区/原视频标题后再判断”。
8. 输出 evidence_status 和 confidence：high/medium/low。来源不足时必须是 low。

只返回合法 JSON，不要 markdown。JSON 字段：
{
  "evidence_status": "证据是否充足，以及哪些地方不足",
  "confidence": "high/medium/low",
  "trend_keywords": ["关键词"],
  "trend_summary": "一句话概括事件；证据不足时必须写无法确认",
  "trend_origin": "事件起因；证据不足时写无法确认",
  "trend_process": ["经过节点；证据不足时只写无法还原完整经过"],
  "trend_current_status": "当前结果/现状；证据不足时写无法确认",
  "trend_people": [{"name":"人物/账号/机构", "role":"角色", "relationship":"与事件中其他对象的关系"}],
  "trend_relationships": ["人物关系/利益关系/冲突关系"],
  "trend_burst": "爆点来源；不确定就写需人工复核",
  "trend_emotion": "情绪触发点；不确定就写需人工复核",
  "trend_audience": "人群关注点；不确定就写需人工复核",
  "trend_comments_conflict": "评论区争议点；不确定就写需补充评论区",
  "trend_risk": "内容风险点",
  "fit_judgement": "是否适合结合产品/品牌借势",
  "recommended_angle": "如果要借势，建议的安全角度",
  "trend_sources": [{"title":"来源标题", "link":"链接", "snippet":"摘要"}],
  "competitor_timeline": [{"time":"视频时间", "visual":"画面线索", "voice":"口播/声音", "ocr":"字幕/OCR", "conversion_role":"该片段提供的事件线索"}],
  "content_structure": ["事件背景", "关键冲突", "人物关系", "争议焦点", "风险判断"]
}`;
    const finalResult = await callJsonModel(finalPrompt, framePayloads);
    if (!hasEnoughSources) {
      return {
        ...finalResult,
        evidence_status: "联网检索来源不足，无法可靠还原完整热点事件。请补充更明确的标题、人物名、账号名或评论区摘要。",
        confidence: "low",
        trend_keywords: finalResult.trend_keywords || keywordResult.keywords || queries,
        trend_summary: "证据不足，无法确认具体热点事件。",
        trend_origin: "证据不足，无法确认事件起因。",
        trend_process: ["证据不足，无法还原完整经过。"],
        trend_current_status: "证据不足，无法确认当前状态。",
        trend_people: [],
        trend_relationships: [],
        trend_burst: "需补充更明确的视频标题、人物名或评论区后判断。",
        trend_emotion: "需补充评论区和事件上下文后判断。",
        trend_audience: "需补充事件关键词后判断。",
        trend_comments_conflict: "需补充评论区摘要后判断。",
        trend_sources: flattenedSources,
        reasoning: "已提取视频关键词，但联网检索结果不足；已阻止模型编造事件脉络。"
      };
    }
    return {
      ...finalResult,
      confidence: finalResult.confidence || "medium",
      trend_keywords: finalResult.trend_keywords || keywordResult.keywords || queries,
      trend_sources: finalResult.trend_sources?.length ? finalResult.trend_sources : flattenedSources,
      reasoning: "已基于视频线索提取关键词，并结合联网检索结果整理事件脉络；请以来源链接为准复核。"
    };
  }
  app.get("/api/config", (_req, res) => {
    res.json({
      provider: getProvider(),
      hasModelKey: getProvider() === "gemini" ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.LLM_API_KEY),
      model: getProvider() === "gemini" ? (process.env.GEMINI_MODEL || "gemini-2.0-flash") : (process.env.LLM_MODEL || "qwen-vl-plus"),
      realAnalysisReady: getProvider() === "gemini" ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.LLM_API_KEY)
    });
  });

  async function downloadVideoFromLink(rawText: string) {
    const match = String(rawText || "").match(/https?:\/\/\S+/);
    if (!match) return null;
    const url = match[0];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contentops-video-"));
    const outputTemplate = path.join(tempDir, "source.%(ext)s");
    try {
      await execFileAsync("yt-dlp", [
        "--no-playlist",
        "--max-filesize", "80m",
        "-f", "mp4/best[ext=mp4]/best",
        "-o", outputTemplate,
        url
      ], { timeout: 120000, maxBuffer: 1024 * 1024 * 8 });
      const files = await fs.readdir(tempDir);
      const videoFile = files.find(file => /\.(mp4|mov|webm|mkv)$/i.test(file));
      if (!videoFile) throw new Error("未找到可用视频文件");
      const videoPath = path.join(tempDir, videoFile);
      const data = await fs.readFile(videoPath);
      await fs.rm(tempDir, { recursive: true, force: true });
      return { data: data.toString("base64"), mime: "video/mp4", sourceUrl: url };
    } catch (error) {
      await fs.rm(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  async function runVideoPreprocess(videoData: string, suffix = ".mp4") {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contentops-process-"));
    const videoPath = path.join(tempDir, `source${suffix}`);
    try {
      await fs.writeFile(videoPath, Buffer.from(videoData, "base64"));
      const outputDir = path.join(tempDir, "out");
      const scriptPath = path.join(process.cwd(), "scripts", "process_video.py");
      const { stdout } = await execFileAsync("python", [scriptPath, "--video", videoPath, "--out", outputDir, "--frames", "12"], { timeout: 120000, maxBuffer: 1024 * 1024 * 16 });
      const metadata = JSON.parse(stdout);
      const framePayloads = [];
      for (const framePath of metadata.frames || []) {
        const data = await fs.readFile(framePath);
        framePayloads.push({ data: data.toString("base64"), mimeType: "image/jpeg" });
      }
      return { metadata, framePayloads };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  function parseUploadMeta(req: express.Request) {
    const raw = req.header("X-ContentOps-Meta") || "";
    if (!raw) return {};
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return {};
    }
  }

  function videoSuffix(mime = "") {
    if (mime.includes("webm")) return ".webm";
    if (mime.includes("quicktime") || mime.includes("mov")) return ".mov";
    if (mime.includes("x-msvideo") || mime.includes("avi")) return ".avi";
    if (mime.includes("matroska") || mime.includes("mkv")) return ".mkv";
    return ".mp4";
  }
  function buildLocalAnalysis(videoMetadata: any, mode: string, geminiError?: unknown) {
    const geminiMessage = geminiError instanceof Error ? geminiError.message : String(geminiError || "");
    const quotaError = /quota|RESOURCE_EXHAUSTED|429/i.test(geminiMessage);
    const permissionError = /PERMISSION_DENIED|denied access|403/i.test(geminiMessage);
    const transcriptSegments = videoMetadata?.transcript?.segments || [];
    const scenes = Array.isArray(videoMetadata?.scenes) ? videoMetadata.scenes : [];
    const ocrFrames = videoMetadata?.ocr?.frames || [];
    const rawOcrMerged = videoMetadata?.ocr?.important_text?.length ? videoMetadata.ocr.important_text : videoMetadata?.ocr?.merged_text || [];
    const ocrMerged = rawOcrMerged
      .map((text: string) => String(text || "").trim())
      .filter((text: string) => text.length >= 3)
      .filter((text: string) => !/^(the|he|ne|ire|her|but|ways|provide)$/i.test(text))
      .slice(0, 30);
    const firstText = transcriptSegments.slice(0, 2).map((seg: any) => seg.text).join(" ").trim();
    const importantOcr = ocrMerged.filter((text: string) => /stop|giving|gift|photo|merch|candle|idea|what\s*if|birthday|another|turn|wanted/i.test(text));
    const firstOcr = (importantOcr.length ? importantOcr : ocrMerged).slice(0, 8).join(" / ");
    const hasSemanticSignal = Boolean(firstText || firstOcr);
    const lowerOcr = `${firstText} ${ocrMerged.join(" ")}`.toLowerCase();
    const duration = videoMetadata?.duration_seconds;
    const inferredTopic = lowerOcr.includes("photo") && (lowerOcr.includes("merch") || lowerOcr.includes("product") || lowerOcr.includes("relief"))
      ? "把用户照片生成可下单的定制商品"
      : lowerOcr.includes("gift") || lowerOcr.includes("candle")
        ? "礼物选择与差异化定制"
        : firstOcr || "视频主题待进一步识别";
    const inferredHook = lowerOcr.includes("stop giving")
      ? "Stop Giving the Same Gifts：用反常识否定开场制造停留"
      : lowerOcr.includes("what if")
        ? "What if their photo...：用假设句引出产品创意"
        : firstText || firstOcr || "前3秒未识别到清晰口播或画面文字，当前只能完成镜头节奏拆分。";
    const timelineSource = transcriptSegments.length ? transcriptSegments.slice(0, 8) : (ocrFrames.length ? ocrFrames.slice(0, 8) : scenes.slice(0, 8));
    const timeline = timelineSource.map((item: any, index: number) => {
      const scene = scenes[index];
      const frameTexts = ocrFrames[index]?.texts?.map((row: any) => row.text).filter(Boolean) || [];
      const frameOcr = frameTexts.slice(0, 6).join(" / ");
      const estimatedFrameTime = duration && ocrFrames.length ? (duration / ocrFrames.length) * index : index * 3;
      const start = item.start ?? scene?.start ?? estimatedFrameTime;
      const end = item.end ?? scene?.end ?? (duration && ocrFrames.length ? (duration / ocrFrames.length) * (index + 1) : start + 3);
      return {
        time: `${Number(start).toFixed(1)}-${Number(end).toFixed(1)}s`,
        voice: item.text || "该片段未识别到清晰口播",
        visual: frameOcr ? `关键画面文案：${frameOcr}` : "已抽取关键帧，但当前未识别到有效画面文字",
        editing: scene ? `镜头片段约 ${scene.duration}s` : "按关键帧和音频时间轴拆分",
        ocr: frameOcr || "未识别到明显画面文字",
        product_exposure: frameOcr ? "可结合画面文字判断产品露出/卖点表达" : "需在线多模态模型或人工复核产品露出位置"
      };
    });
    const sceneCount = scenes.length || timeline.length;
    const rhythm = duration && sceneCount ? `视频约 ${Math.round(duration)} 秒，识别到 ${sceneCount} 个镜头/片段，平均片段约 ${(duration / sceneCount).toFixed(1)} 秒。` : "已完成基础时间轴拆分。";
    const base = {
      competitor_timeline: timeline,
      competitor_hook: inferredHook,
      competitor_rhythm: rhythm,
      competitor_emotion: hasSemanticSignal ? "已从口播/画面文字提取到初步语义线索，情绪点仍需多模态模型进一步判断。" : "未识别到足够语义内容，无法可靠判断情绪触发点。",
      competitor_product_placement: hasSemanticSignal ? "可根据口播和画面文字初步判断卖点露出，产品实物露出仍需视觉模型复核。" : "当前未识别到产品露出信息。",
      competitor_core_selling_point: hasSemanticSignal ? `初步识别主题：${inferredTopic}。画面文字线索：${firstOcr || firstText}` : "未识别到足够内容，暂不能提炼核心卖点。",
      competitor_pain_points: hasSemanticSignal ? (lowerOcr.includes("same") || lowerOcr.includes("another") ? "用户痛点是礼物/商品同质化，想要更个性化、更有惊喜感的选择。" : "可从已识别口播/字幕中的问题句、对比句继续提炼。") : "未识别到口播或字幕，暂不能提炼用户痛点。",
      competitor_cta: lowerOcr.includes("$39") || lowerOcr.includes("dispatch") ? "后段出现价格优惠和快速发货信息，CTA可能偏向直接下单转化。" : "需检查结尾是否出现评论、私信、主页、下单等行动引导。",
      competitor_comments_focus: "建议补充评论区摘要后判断用户关注点。",
      direct_transfer: hasSemanticSignal ? ["否定式开场：先指出常规礼物太普通", "照片变成真实商品的创意转折", "用选择商品-生成预览-价格优惠-快速发货承接转化", "礼物场景下的个性化卖点表达"] : ["时间轴拆解结构", "前3秒Hook位置", "镜头节奏框架"],
      rewrite_transfer: ["把竞品的礼物表达改写成我方商品类型和生成能力", "把照片变商品的创意转折替换成我方真实下单路径", "CTA需要替换成我方可承接的评论/主页/下单入口"],
      no_transfer: ["不要迁移竞品品牌名、专属素材、未经授权画面或承诺"],
      reasoning: geminiError
        ? quotaError
          ? "已完成本地抽帧、镜头切分和OCR；Gemini 已连通，但当前 API key/项目没有可用配额，因此当前不是最终完整拆解。"
          : permissionError
            ? "已完成本地抽帧、镜头切分和OCR；Gemini 已连通，但当前 API key/项目没有该模型访问权限，因此当前不是最终完整拆解。"
            : "已完成本地抽帧、镜头切分和OCR；在线多模态模型调用失败，因此当前只是初步识别结果，不是完整竞品拆解。"
        : "已基于本地视频预处理生成初步识别结果。",
      trend_summary: hasSemanticSignal ? `初步识别主题：${inferredTopic}。核心画面文字：${firstOcr || firstText}` : "未识别到足够语义内容，暂不能总结事件主线。",
      trend_burst: "可从首帧冲突、口播开头、评论争议点中提炼爆点。",
      trend_emotion: "建议按惊讶、共鸣、争议、爽感、焦虑等情绪方向复核。",
      trend_audience: "需结合评论区和产品目标用户判断。",
      trend_comments_conflict: "建议补充评论区摘要后判断争议点。",
      trend_risk: "注意版权、肖像、平台敏感表达和过度蹭热点风险。",
      fit_judgement: "可初步结合，但需要看产品功能是否能自然承接热点情绪。",
      recommended_angle: "优先选择轻植入或评论互动角度，降低硬广感。",
      script_versions: []
    };
    return mode === "热点事件拆解" ? base : base;
  }

  async function analyzeImportedContent(payload: any) {
    let { text, video_data, video_mime, competitor_product, our_product, dimensions, mode, hot_event, pipeline } = payload;

    if (!video_data && text && /https?:\/\//.test(text)) {
      try {
        const downloaded = await downloadVideoFromLink(text);
        if (downloaded) {
          video_data = downloaded.data;
          video_mime = downloaded.mime;
          text = `${text}\n\n【链接视频下载状态】已成功下载并送入模型分析：${downloaded.sourceUrl}`;
        }
      } catch (downloadError: any) {
        console.warn("Video link download failed", downloadError?.message || downloadError);
        const error: any = new Error("链接视频解析失败。抖音/小红书短链经常会反爬，请切换到【视频上传】，上传本地视频后再拆解。");
        error.status = 422;
        error.code = "LINK_DOWNLOAD_FAILED";
        throw error;
      }
    }

    let videoMetadata: any = null;
    let framePayloads: any[] = [];
    if (video_data && video_mime) {
      try {
        const processed = await runVideoPreprocess(video_data, videoSuffix(video_mime));
        videoMetadata = processed.metadata;
        framePayloads = processed.framePayloads;
      } catch (processError: any) {
        const error: any = new Error("视频预处理失败，请换一个 mp4 视频上传。");
        error.status = 422;
        error.detail = processError?.message || String(processError);
        throw error;
      }
    }

    if ((mode || "").includes("热点")) {
      try {
        return await analyzeTrendEvent({ text: text || "", hot_event, videoMetadata, framePayloads });
      } catch (trendError) {
        console.error("Trend event analysis failed", trendError);
        if (videoMetadata) {
          return buildLocalAnalysis(videoMetadata, mode || "热点事件解析", trendError);
        }
        const error: any = new Error("热点事件联网解析失败，请补充更明确的事件关键词，或上传包含标题/字幕更清晰的视频。");
        error.status = 503;
        throw error;
      }
    }

    const prompt = `你是资深内容产品运营专家。请基于导入的竞品或热点内容，完成视频拆解分析。此步骤只输出竞品/热点拆解、可迁移点和风险点，不生成我方最终脚本。

【拆解类型】${mode || "竞品脚本拆解"}
【导入方式】${video_data ? "本地视频上传" : "公开视频链接/文本"}
【导入内容/链接】${text || "未提供"}
【竞品产品说明】${JSON.stringify(competitor_product || {})}
【我方产品说明】${JSON.stringify(our_product || {})}
【热点事件补充】${JSON.stringify(hot_event || {})}
【目标分发平台】${hot_event?.platform || "未指定"}
【已选分析维度】${dimensions ? dimensions.join(", ") : "脚本结构、Hook、画面、字幕、节奏、情绪点、卖点、产品露出、CTA、评论区"}
【视频预处理结果】${JSON.stringify(videoMetadata || {})}
【计划使用的开源处理管线】${JSON.stringify(pipeline || [])}

请优先依据上传视频本身、抽取的关键帧、OCR和视频预处理结果分析，不要根据用户给的链接文字猜测。
非常重要：不要输出泛泛评价；不要把“轻快、固定镜头、产品露出”这种空话当作拆解。你必须像短视频编导/产品运营复盘一样逐镜头拆。
如果口播无法确定，写“未识别到清晰口播”，不要编造；但必须根据画面、OCR、商品页信息拆出画面动作、产品路径、卖点和转化逻辑。

拆解标准：
1. 时间轴必须覆盖全视频，至少 6 段；每段写清楚画面发生了什么，而不是只写“静态画面”。
2. 每段必须包含：画面动作、画面文字/OCR、剪辑手法、情绪/注意力设计、卖点/产品露出、这一段在转化链路里的作用。
3. 必须总结完整内容结构：痛点开场 -> 创意转折 -> 产品操作 -> 效果预览 -> 价格/发货/CTA。
4. 必须输出可迁移点和不建议迁移点，且每条要说明为什么。
5. 重点识别：Stop Giving the Same Gifts、Turn their photo into real merch、I uploaded/picked/generated preview、3D Relief Photo、价格、折扣、Fast Dispatch 等转化信息。

请根据目标分发平台适配脚本：抖音偏强Hook和快节奏转化，小红书偏种草场景和收藏价值，TikTok偏前3秒视觉冲击和短句表达，Instagram偏视觉审美和Reels节奏，YouTube偏信息完整度和留存结构。
只返回合法 JSON，不要 markdown。JSON 字段包括：
{
  "competitor_timeline": [{"time": "0-3s", "voice": "口播/声音", "visual": "具体画面动作", "editing": "剪辑节奏/镜头手法", "ocr": "画面文字", "emotion": "情绪/注意力设计", "selling_point": "本段卖点", "conversion_role": "本段在转化链路中的作用", "product_exposure": "产品露出"}],
  "content_structure": ["痛点开场", "创意转折", "产品操作", "效果预览", "价格/发货/CTA"],
  "competitor_hook": "前3秒Hook",
  "competitor_rhythm": "整体剪辑节奏",
  "competitor_emotion": "情绪触发点",
  "competitor_product_placement": "产品植入点",
  "competitor_core_selling_point": "核心卖点",
  "competitor_pain_points": "用户痛点",
  "competitor_cta": "转化触发点",
  "competitor_comments_focus": "评论区关注点",
  "direct_transfer": ["可直接迁移点"],
  "rewrite_transfer": ["需要改写迁移点"],
  "no_transfer": ["不建议迁移点及原因"],
  "reasoning": "迁移判断依据",
  "trend_summary": "热点事件摘要",
  "trend_burst": "爆点来源",
  "trend_emotion": "情绪触发点",
  "trend_audience": "人群关注点",
  "trend_comments_conflict": "评论区争议点",
  "trend_risk": "风险点",
  "fit_judgement": "是否适合结合我方产品",
  "recommended_angle": "推荐植入角度",
  "script_versions": [{"type": "强关联版/轻植入版/评论互动版/转化版", "title": "标题", "hook": "Hook", "script": "脚本", "placement": "植入方式", "cta": "CTA"}]
}`;

    try {
      return await callJsonModel(prompt, framePayloads);
    } catch (geminiError) {
      console.error("Gemini analysis failed, returning local analysis fallback", geminiError);
      if (videoMetadata) {
        return buildLocalAnalysis(videoMetadata, mode || "竞品脚本拆解", geminiError);
      }
      const error: any = new Error("在线模型连接超时，请稍后重试或检查网络代理。已收到输入，但暂时无法完成语义拆解。");
      error.status = 503;
      error.detail = geminiError instanceof Error ? geminiError.message : String(geminiError);
      throw error;
    }
  }

  function escapeHtml(value: string) {
    return String(value || "").replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char] || char));
  }

  function safeDownloadName(value: string) {
    return encodeURIComponent(String(value || "导出文档").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80));
  }

  app.post("/api/export-word", (req, res) => {
    const title = String(req.body?.title || "导出文档");
    const body = String(req.body?.body || "");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.8;color:#111}h1{font-size:24px;border-bottom:2px solid #111;padding-bottom:8px}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre></body></html>`;
    res.setHeader("Content-Type", "application/msword; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeDownloadName(title)}.doc`);
    res.send(`\ufeff${html}`);
  });

  const scriptsDir = path.join(process.cwd(), "脚本");

  function safeScriptFileName(title: string) {
    return `${safeScriptBaseName(title)}.md`;
  }

  function safeScriptBaseName(title: string) {
    const cleaned = String(title || "未命名脚本")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    return cleaned || "未命名脚本";
  }

  function exportStamp() {
    return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  }

  function wordHtml(title: string, body: string) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.8;color:#111}h1{font-size:24px;border-bottom:2px solid #111;padding-bottom:8px}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre></body></html>`;
  }

  function parseScriptFile(content: string, fileName: string) {
    const meta: Record<string, string> = {};
    const bodyLines: string[] = [];
    let inMeta = true;
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([^：:]{1,20})[：:]\s*(.*)$/);
      if (inMeta && match) {
        meta[match[1].trim()] = match[2].trim();
      } else {
        inMeta = false;
        bodyLines.push(line);
      }
    }
    const title = meta["标题"] || fileName.replace(/\.(md|docx)$/i, "");
    const contentBody = bodyLines.join("\n").trim() || content;
    return {
      id: fileName,
      fileName,
      title,
      sourceType: (meta["来源"] as any) || "手动沉淀",
      platform: meta["平台"] || "未标注平台",
      product: meta["产品"] || "未标注产品",
      hook: meta["Hook"] || contentBody.split(/\r?\n/).find(Boolean) || "待提炼",
      cta: meta["CTA"] || "待提炼",
      tags: (meta["标签"] || "历史脚本").split(/[、,/]/).map(item => item.trim()).filter(Boolean),
      createdAt: meta["保存时间"] || "",
      content: contentBody
    };
  }

  async function readScriptFile(fileName: string) {
    const filePath = path.join(scriptsDir, fileName);
    if (/\.docx$/i.test(fileName)) {
      const result = await mammoth.extractRawText({ path: filePath });
      return parseScriptFile(result.value.trim(), fileName);
    }
    const content = await fs.readFile(filePath, "utf8");
    return parseScriptFile(content, fileName);
  }

  app.get("/api/scripts", async (_req, res) => {
    try {
      await fs.mkdir(scriptsDir, { recursive: true });
      const entries = await fs.readdir(scriptsDir, { withFileTypes: true });
      const scripts = [];
      for (const entry of entries) {
        if (!entry.isFile() || !/\.(md|docx)$/i.test(entry.name)) continue;
        scripts.push(await readScriptFile(entry.name));
      }
      res.json({ scripts });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "读取脚本文件夹失败" });
    }
  });

  app.post("/api/scripts", async (req, res) => {
    try {
      await fs.mkdir(scriptsDir, { recursive: true });
      const script = req.body || {};
      const fileName = safeScriptFileName(script.title);
      const body = [
        `标题：${script.title || "未命名脚本"}`,
        `来源：${script.sourceType || "手动沉淀"}`,
        `平台：${script.platform || "未标注平台"}`,
        `产品：${script.product || "未标注产品"}`,
        `Hook：${script.hook || "待提炼"}`,
        `CTA：${script.cta || "待提炼"}`,
        `标签：${Array.isArray(script.tags) ? script.tags.join("、") : "历史脚本"}`,
        `保存时间：${script.createdAt || new Date().toLocaleString()}`,
        "",
        script.content || ""
      ].join("\n");
      await fs.writeFile(path.join(scriptsDir, fileName), body, "utf8");
      res.json({ ok: true, fileName });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "保存脚本失败" });
    }
  });

  app.post("/api/export-word-to-library", async (req, res) => {
    try {
      await fs.mkdir(scriptsDir, { recursive: true });
      const payload = req.body || {};
      const title = String(payload.title || "导出文档");
      const body = String(payload.body || "");
      const baseName = `${safeScriptBaseName(title)}-${exportStamp()}`;
      const docFileName = `${baseName}.doc`;
      const mdFileName = `${baseName}.md`;
      const mdBody = [
        `标题：${title}`,
        `来源：${payload.sourceType || "手动沉淀"}`,
        `平台：${payload.platform || "未标注平台"}`,
        `产品：${payload.product || "未标注产品"}`,
        `Hook：${payload.hook || "待提炼"}`,
        `CTA：${payload.cta || "待提炼"}`,
        `标签：${Array.isArray(payload.tags) ? payload.tags.join("、") : "导出Word"}`,
        `保存时间：${payload.createdAt || new Date().toLocaleString()}`,
        `Word文件：${docFileName}`,
        "",
        body
      ].join("\n");
      await fs.writeFile(path.join(scriptsDir, docFileName), `\ufeff${wordHtml(title, body)}`, "utf8");
      await fs.writeFile(path.join(scriptsDir, mdFileName), mdBody, "utf8");
      res.json({ ok: true, docFileName, mdFileName });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "保存 Word 到脚本库失败" });
    }
  });

  app.delete("/api/scripts/:fileName", async (req, res) => {
    try {
      const fileName = path.basename(req.params.fileName || "");
      if (!/\.(md|docx)$/i.test(fileName)) throw new Error("无效脚本文件名");
      await fs.rm(path.join(scriptsDir, fileName), { force: true });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "删除脚本失败" });
    }
  });
  app.post("/api/analyze-competitor", async (req, res) => {
    try {
      res.json(await analyzeImportedContent(req.body));
    } catch (e: any) {
      console.error(e);
      res.status(e.status || 500).json({ error: e.message || "Failed to analyze content", code: e.code });
    }
  });

  app.post("/api/analyze-competitor-upload", rawVideoParser, async (req, res) => {
    try {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      if (!buffer.length) {
        res.status(400).json({ error: "没有收到视频文件，请重新选择视频上传。" });
        return;
      }
      const meta = parseUploadMeta(req);
      const videoMime = req.header("content-type") || "video/mp4";
      res.json(await analyzeImportedContent({
        ...meta,
        import_type: "upload",
        video_data: buffer.toString("base64"),
        video_mime: videoMime,
      }));
    } catch (e: any) {
      console.error(e);
      res.status(e.status || 500).json({ error: e.message || "Failed to analyze uploaded video", code: e.code });
    }
  });

  app.post("/api/generate-script", async (req, res) => {
    try {
      const { analysis, our_product, hot_event, mode } = req.body;
      const prompt = `你是资深短视频内容策略专家。你的任务不是自由创作，而是做“竞品脚本迁移”：必须以【视频拆解结果】里的竞品脚本结构为母版，再结合【我方产品信息】生成我方最终创作脚本。

【模式】${mode || "竞品脚本迁移"}
【视频拆解结果】${JSON.stringify(analysis || {})}
【我方产品信息】${JSON.stringify(our_product || {})}
【热点/平台补充】${JSON.stringify(hot_event || {})}

硬性要求：
1. 不允许脱离竞品脚本另起炉灶；最终脚本必须按【视频拆解结果】里的 competitor_timeline 逐段迁移。
2. 每一段都必须先写“原片段依据”，引用竞品该段的时间、画面/OCR/口播/卖点/转化作用，再写“我方改写”。
3. 不能把我方产品信息当成一个新选题自由发挥；只能把我方产品功能填入竞品原脚本的结构位置里。
4. 但必须区分“结构迁移”和“场景迁移”：如果竞品场景与我方产品不一致，只迁移脚本结构、情绪钩子、镜头节奏和转化位置，不要照搬竞品场景。
5. 例如竞品是毕业礼物/送礼/实体周边，而我方是P图、AI换装、图片编辑、修图、海报生成等软件时，禁止继续写毕业礼物、女朋友送礼、钥匙扣、下单发货；应转译成图片处理软件的真实使用场景，如证件照/头像/穿搭试衣/社媒发图/照片变精修/一键换背景/批量出图。
6. 创意可以加，但只能作为“基于原脚本结构的增强”，不能改变原脚本主节奏，不能新增与我方产品无关的剧情。
7. 我方产品信息优先级最高：产品名称、我方想呈现的功能、目标用户必须进入脚本；竞品的具体品类、礼物场景、价格、发货承诺只有在与我方产品一致时才可迁移。
8. 输出结构必须清晰，有大标题、小标题、分段编号，不能堆成一整坨文字。
9. 最终脚本必须是可拍摄版本：时间、画面、口播、字幕、产品植入、用户心理、转化目的都要写。
10. 如果竞品拆解信息不足，明确写“该段依据不足”，只能按已识别的“开场-转折-操作-结果-转化”链路谨慎补齐，不能编造具体竞品内容。

最终输出不要写成长篇方案文档，要像“脚本拆解结果”一样输出可拍摄脚本表。
请按 competitor_timeline 的真实时间段逐段生成 our_script，不要强行固定 0-3s、3-6s。
每个脚本段必须包含：
- time：沿用或贴近竞品原时间段
- source_basis：这一段依据竞品哪段内容，引用原时间、画面/OCR/口播/卖点/转化作用
- visual：我方这一段具体拍什么画面
- voiceover：口播怎么说
- subtitle：屏幕字幕怎么写
- editing：剪辑/节奏怎么处理
- placement：我方产品功能怎样露出
- purpose：这一段负责停留、解释、证明、转化还是评论互动

输出原则：
1. 最终脚本只呈现脚本，不要输出“迁移总思路、映射表、拍摄素材清单”等大段论证。
2. 可以有创意，但必须写进对应脚本段里，不能额外发散成多个独立方案。
3. 每段的 source_basis 写“借鉴原片的什么结构”，不要写成“照搬原片的什么场景”。
4. 如果检测到竞品场景与我方产品冲突，标题、Hook、CTA、口播、字幕必须全部围绕我方产品真实场景重写。
5. 最后只额外给一组评论引导话术：兴趣、咨询、质疑、求链接四类。

只返回合法 JSON，不要 markdown。JSON 字段：
{
  "our_title": "主脚本标题",
  "our_hook": "最推荐的前3秒Hook，必须来自竞品结构迁移+我方产品功能",
  "our_placement": "产品植入策略，说明对应竞品哪一段、我方第几秒露出、为什么此处露出",
  "our_cta": "主CTA",
  "script_document": "可选。不要输出长篇方案；如输出，仅用一句话概括脚本策略",
  "our_script": [{"time": "时间段", "source_basis": "对应竞品原片段依据", "visual": "我方画面", "voiceover": "口播", "subtitle": "屏幕字幕", "editing": "剪辑/节奏", "placement": "产品植入", "purpose": "停留/解释/证明/转化/评论互动目的"}],
  "comment_interest": "兴趣型评论引导",
  "comment_consult": "咨询型评论回复",
  "comment_doubt": "质疑型评论回复",
  "comment_buy": "求链接/求同款回复"
}`;
      try {
        res.json(await callJsonModel(prompt));
      } catch (geminiError) {
        console.error("Gemini script generation failed, returning local script fallback", geminiError);
        const firstTimeline = analysis?.competitor_timeline?.[0];
        const title = our_product?.name ? `${our_product.name}内容脚本初版` : "我方创作脚本初版";
        res.json({
          our_title: title,
          our_hook: firstTimeline?.voice || analysis?.competitor_hook || "用一个强结果画面开场，先让用户停下来。",
          our_placement: "沿用拆解视频的节奏位置，把我方产品放在用户问题被提出后的第一个解决方案节点。",
          our_cta: "评论关键词或进入主页体验。",
          script_document: `标题：${title}\n\n核心策略：基于已完成的竞品/热点拆解，保留其Hook位置、镜头节奏和转化承接方式，但把卖点替换为我方产品真实功能。\n\n完整脚本：\n0-3秒：用结果画面或痛点问题开场。口播/字幕：${firstTimeline?.voice || analysis?.competitor_hook || "别再用普通方式解决这个问题。"}\n3-8秒：展示用户当前痛点或竞品视频中的高停留结构。\n8-15秒：切入我方产品功能：${our_product?.features || hot_event?.product_feature || "展示核心功能"}。\n15-22秒：展示使用前后对比、操作路径或效果结果。\n22-30秒：给出行动入口，引导评论或主页体验。\n\n产品植入：在用户痛点被明确之后出现，不抢开头注意力。\n\nCTA：${our_product?.name ? `想试试${our_product.name}，可以评论关键词或进入主页。` : "评论关键词，我整理一版使用模板。"}`,
          our_script: [
            { scene: "结果/痛点开场", text: firstTimeline?.voice || analysis?.competitor_hook || "用一句强Hook留住用户。", placement: "先不硬露产品" },
            { scene: "展示我方功能", text: our_product?.features || hot_event?.product_feature || "展示核心功能和操作路径。", placement: "承接痛点后自然露出" },
            { scene: "结果对比和CTA", text: "展示效果并引导评论/主页体验。", placement: "完成转化承接" }
          ],
          comment_interest: "可以先告诉我你的使用场景，我帮你判断适合哪种做法。",
          comment_consult: "流程是先明确需求，再用产品功能生成/优化内容，最后根据效果复盘。",
          comment_doubt: "效果会受素材质量和产品信息完整度影响，可以先用一个小样本测试。",
          comment_buy: "想体验可以评论关键词或进入主页入口。"
        });
      }
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to generate script" });
    }
  });



  app.post("/api/generate-trend-ideas", async (req, res) => {
    try {
      const { analysis, product } = req.body;
      const prompt = `你是内容策略产品里的热点迁移分析 Agent。你的任务不是自由想选题，而是基于“刚刚解析出来的热点事件/视频脚本结构”，判断我方产品功能可以怎样自然接入。

热点解析结果 JSON：
${JSON.stringify(analysis || {})}

我方产品信息 JSON：
${JSON.stringify(product || {})}

硬性要求：
1. 每个建议都必须引用热点解析里的具体依据：trend_summary、trend_process、trend_people、trend_relationships、trend_burst、trend_emotion、trend_comments_conflict、competitor_timeline 中至少一类。
2. 每个建议都必须明确使用我方 product_name、product_feature、target_user、platform；如果 product_feature 为空，要先写“需要补充产品功能后才能生成高质量结合建议”。
3. 不要把热点原视频内容原样搬到我方产品上。要迁移的是：开场结构、情绪触发、争议点、反转方式、评论讨论点、镜头节奏。
4. 不允许凭空说我方产品有“送礼、下单、发货、3D手办、P图”等功能，除非产品信息里明确写了。
5. 如果热点和产品功能关联弱，可以只给 1 个轻植入/评论互动建议，并说明不建议强蹭。
6. 只输出 1-3 个建议，不要生成完整脚本。

返回合法 JSON，不要 markdown：
{
  "trend_ideas": [
    {
      "id": "idea-1",
      "title": "建议标题",
      "core_angle": "把热点里的哪种情绪/结构迁移到我方产品",
      "event_hook": "引用热点解析中的具体依据，例如某个时间段、事件节点、争议点或情绪点",
      "product_connection": "我方产品功能如何自然接住这个热点，不要只写品牌名",
      "suitable_platform": "适合的平台及原因",
      "why_fit": "为什么这个热点结构和产品功能能结合",
      "risk": "哪些表达不要碰，如何规避硬蹭/事实错误/版权风险",
      "script_potential": "后续如果生成脚本，应沿用的脚本结构，例如：热点开场 - 情绪转折 - 产品功能承接 - 结果展示 - 评论互动"
    }
  ]
}`;
      res.json(await callJsonModel(prompt));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to generate trend ideas" });
    }
  });

  app.post("/api/generate-trend-script", async (req, res) => {
    try {
      const { analysis, product, idea } = req.body;
      const prompt = `你是短视频脚本迁移 Agent。请根据“热点解析结果 + 用户选择的结合建议 + 我方产品信息”生成最终创作脚本。

热点解析结果 JSON：
${JSON.stringify(analysis || {})}

我方产品信息 JSON：
${JSON.stringify(product || {})}

用户选择的结合建议 JSON：
${JSON.stringify(idea || {})}

硬性要求：
1. 必须先从 analysis.competitor_timeline / trend_process / trend_burst / trend_emotion 中抽象出热点脚本结构，再把 product.product_feature 映射进去。
2. 不能继续讲热点原本的话题，除非它和产品功能天然一致。你要借用“结构和情绪”，不是复制“内容主题”。例如原片是英语词汇教学，我方是 AI P图/商品设计工具，就不要继续教英语单词；应迁移“熟悉场景提问-揭示痛点-演示功能-结果对比-评论互动”的结构。
3. 每一段 source_basis 都要写清楚依据热点解析的哪一段：时间段、画面/OCR/口播、事件节点、情绪点或争议点。
4. 每一段 placement 都必须写我方具体功能如何露出，不能只写品牌名或泛泛 CTA。
5. 如果产品功能信息不足，脚本里要用“待补充功能点”占位，不要编造功能。
6. 输出要像拆解脚本表一样清晰，不要写成长篇方案。
7. 结尾给评论引导话术，评论话术要围绕产品功能和热点讨论点。

返回合法 JSON，不要 markdown：
{
  "our_title": "我方视频标题",
  "our_hook": "前3秒Hook",
  "our_cta": "主CTA",
  "our_script": [
    {
      "time": "时间段，尽量贴近热点原视频节奏",
      "source_basis": "依据热点解析的哪一段/哪种情绪/哪条视频线索",
      "visual": "我方这一段具体拍什么画面",
      "voiceover": "口播怎么说",
      "subtitle": "屏幕字幕",
      "editing": "剪辑节奏/镜头手法",
      "placement": "我方产品功能如何露出",
      "purpose": "这一段承担的作用：停留/解释/证明/转化/评论互动"
    }
  ],
  "comment_interest": "兴趣型评论引导",
  "comment_consult": "咨询型评论回复",
  "comment_doubt": "质疑型评论回复",
  "comment_buy": "求入口/求教程回复"
}`;
      res.json(await callJsonModel(prompt));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to generate trend script" });
    }
  });

  app.post("/api/generate-topics", async (req, res) => {
    try {
      const { brief, pool, count } = req.body;
      res.json(await callJsonModel(`你是内容产品运营专家。请结合产品说明和内容素材池，生成 ${count || 10} 个高转化选题。\n\n【产品说明】\n${JSON.stringify(brief || {})}\n\n【素材池】\n${JSON.stringify(pool || [])}\n\n只返回合法 JSON 数组。每个对象包含 title、hook、structure、product_placement、suitable_metric、reason。`));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to generate topics" });
    }
  });

  app.post("/api/review-assets", async (req, res) => {
    try {
      const { items } = req.body;
      res.json(await callJsonModel(`你是内容产品运营专家。下面是一组内容投放/运营数据，请分析整体表现并给出下周优化建议。\n\n【数据内容】\n${JSON.stringify(items || [])}\n\n只返回合法 JSON。对象包含 best_hook、best_angle、templates(string[])、additions(string[])、avoidances(string[])。`));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to review assets" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();






















