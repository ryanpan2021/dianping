import http from 'node:http'
import { URL } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index)
    const value = trimmed.slice(index + 1)
    process.env[key] = process.env[key] || value
  }
}

const port = Number(process.env.PORT || 8787)
const amapKey = process.env.AMAP_WEB_SERVICE_KEY
const openaiBaseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
const openaiApiKey = process.env.OPENAI_API_KEY
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 8 * 1024 * 1024) {
        req.destroy()
        reject(new Error('请求体过大'))
      }
    })
    req.on('end', () => {
      if (!body) return resolveBody({})
      try {
        resolveBody(JSON.parse(body))
      } catch {
        reject(new Error('JSON 格式错误'))
      }
    })
  })
}

function normalizePoi(poi, index) {
  const cost = poi.biz_ext?.cost || poi.biz_ext?.rating || ''
  const tags = String(poi.type || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
  return {
    id: Number(poi.id?.replace(/\D/g, '').slice(-8)) || index + 1,
    sourceId: poi.id,
    name: poi.name || '未命名门店',
    address: typeof poi.address === 'string' && poi.address ? poi.address : '暂无详细地址',
    category: tags[0] || '商户',
    avgPrice: Number(cost) || 0,
    distance: poi.distance ? `${poi.distance}m` : '距离未知',
    tags: tags.length ? tags : ['附近商户'],
    location: poi.location || '',
  }
}

function buildImagePrompt(fileName) {
  return `你是一个探店图片分析助手。请根据图片内容提取可用于真实探店评价和探店笔记的素材。

要求：
1. 只描述图片中能明确看到的内容。
2. 不要编造品牌、门店名、价格、口味、服务体验。
3. 如果无法判断具体名称，请用通用描述。
4. 输出一段 60 到 120 字的中文描述，口吻客观自然。
5. 可以包含：菜品/饮品/项目/环境/菜单/门头/氛围/演出现场/景区视角/适合写作角度。

图片文件名：${fileName || '未命名图片'}`
}

function buildMerchantInsightPrompt(payload) {
  return `你是一个门店/体验点评素材分析助手。请基于搜索工具返回的公开信息，提炼与该门店或体验相关的核心体验评价素材。

请输出严格 JSON，不要输出 Markdown，不要输出解释。JSON 格式如下：
{
  "summary": "一段 80 到 160 字的核心体验评价摘要，如果公开信息不足则为空字符串",
  "highlights": ["核心点1", "核心点2", "核心点3"]
}

要求：
1. 只保留体验、评价、氛围、服务、排队、项目特色、适合人群等可作为后续写作素材的信息。
2. 不要编造搜索结果中没有的信息。
3. 如果没有有效体验评价内容，summary 返回空字符串，highlights 返回空数组。
4. 内容要克制客观，不要直接生成最终点评。

素材：
${JSON.stringify(payload, null, 2)}`
}

function buildPrompt(payload) {
  return `你是一个真实、克制、自然的探店内容草稿助手。请基于用户真实输入生成内容，禁止虚构未提供的体验，禁止自动伪造好评，避免广告腔和绝对化表达。

请输出严格 JSON，不要输出 Markdown，不要输出解释。JSON 格式如下：
{
  "title": "探店笔记标题",
  "review": "大众点评评价草稿",
  "note": "探店笔记正文",
  "tags": ["标签1", "标签2"]
}

写作要求：
1. 只能使用素材中提供的信息。
2. 如果信息不足，表达要克制，不要编造服务、口味、排队、价格。
3. 用户选择的文风是：${payload.experience?.style || '真实自然'}。
4. 内容类型是：${payload.experience?.contentType || 'both'}。
5. 大众点评评价偏实用真实，探店笔记偏分享但不要过度营销。
6. 如果用户提供不足之处，要自然写入以增强真实感。
7. 生成内容为草稿，适合用户确认后发布。

素材：
${JSON.stringify(payload, null, 2)}`
}

async function callChatCompletion(messages, temperature = 0.3, timeout = 60000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        temperature,
        messages,
      }),
    })
    const text = await response.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { error: { message: text || '大模型返回格式异常' } }
    }
    return { response, data }
  } finally {
    clearTimeout(timer)
  }
}

function getMessageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item?.text === 'string') return item.text
        if (typeof item?.content === 'string') return item.content
        if (typeof item?.text?.value === 'string') return item.text.value
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof content?.text === 'string') return content.text
  if (typeof content?.text?.value === 'string') return content.text.value
  if (typeof message?.reasoning_content === 'string') return message.reasoning_content
  return ''
}

function getOutputText(output) {
  if (typeof output === 'string') return output
  if (!Array.isArray(output)) return ''
  return output
    .map((item) => {
      if (typeof item === 'string') return item
      if (typeof item?.content === 'string') return item.content
      if (Array.isArray(item?.content)) return getOutputText(item.content)
      if (typeof item?.text === 'string') return item.text
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function getChoiceText(data) {
  return getMessageText(data.choices?.[0]?.message) || data.choices?.[0]?.text || data.output_text || getOutputText(data.output) || getOutputText(data.content) || ''
}

async function searchPoi(req, res) {
  if (!amapKey) return sendJson(res, 500, { message: '缺少高德 Web 服务 Key' })
  const url = new URL(req.url, `http://${req.headers.host}`)
  const keyword = url.searchParams.get('keyword') || ''
  const city = url.searchParams.get('city') || '全国'
  const location = url.searchParams.get('location') || ''
  if (!keyword.trim()) return sendJson(res, 200, { merchants: [] })

  const amapUrl = new URL(location ? 'https://restapi.amap.com/v3/place/around' : 'https://restapi.amap.com/v3/place/text')
  amapUrl.searchParams.set('key', amapKey)
  amapUrl.searchParams.set('keywords', keyword)
  amapUrl.searchParams.set('children', '0')
  amapUrl.searchParams.set('offset', '20')
  amapUrl.searchParams.set('page', '1')
  amapUrl.searchParams.set('extensions', 'all')
  if (location) {
    amapUrl.searchParams.set('location', location)
    amapUrl.searchParams.set('radius', '3000')
    amapUrl.searchParams.set('sortrule', 'distance')
  } else {
    amapUrl.searchParams.set('city', city)
  }

  const response = await fetch(amapUrl)
  const data = await response.json()
  if (data.status !== '1') {
    return sendJson(res, 502, { message: data.info || '高德门店搜索失败', raw: data })
  }
  sendJson(res, 200, { merchants: (data.pois || []).map(normalizePoi) })
}

async function analyzeImage(req, res) {
  if (!openaiBaseUrl || !openaiApiKey) return sendJson(res, 500, { message: '缺少大模型接口配置' })
  const body = await readBody(req)
  const image = body.image || ''
  const fileName = body.fileName || ''
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return sendJson(res, 400, { message: '缺少有效图片数据' })
  }

  const { response, data } = await callChatCompletion([
    {
      role: 'system',
      content: '你是一个图片理解助手，请直接输出中文图片观察结果，不要输出 JSON。',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: buildImagePrompt(fileName) },
        { type: 'image_url', image_url: { url: image, detail: 'low' } },
      ],
    },
  ], 0.2, 60000)
  if (!response.ok) {
    return sendJson(res, response.status, { message: data.error?.message || '图片识别失败' })
  }

  const analysis = getChoiceText(data).trim() || '图片已上传，但未识别到明确内容。'
  sendJson(res, 200, { analysis })
}

async function analyzeMerchantInsights(req, res) {
  if (!amapKey) return sendJson(res, 500, { message: '缺少高德 Web 服务 Key' })
  if (!openaiBaseUrl || !openaiApiKey) return sendJson(res, 500, { message: '缺少大模型接口配置' })
  const body = await readBody(req)
  const merchant = body.merchant || {}
  const city = body.city || '全国'
  const keyword = [merchant.name, merchant.category, '评价 体验'].filter(Boolean).join(' ')
  if (!merchant.name) return sendJson(res, 200, { summary: '', highlights: [] })

  const amapUrl = new URL('https://restapi.amap.com/v3/place/text')
  amapUrl.searchParams.set('key', amapKey)
  amapUrl.searchParams.set('keywords', keyword)
  amapUrl.searchParams.set('children', '0')
  amapUrl.searchParams.set('offset', '10')
  amapUrl.searchParams.set('page', '1')
  amapUrl.searchParams.set('extensions', 'all')
  amapUrl.searchParams.set('city', city)

  const searchResponse = await fetch(amapUrl)
  const searchData = await searchResponse.json()
  if (searchData.status !== '1') {
    return sendJson(res, 200, { summary: '', highlights: [] })
  }

  const searchResults = (searchData.pois || []).slice(0, 8).map((poi) => ({
    name: poi.name || '',
    address: poi.address || '',
    type: poi.type || '',
    rating: poi.biz_ext?.rating || '',
    cost: poi.biz_ext?.cost || '',
    tag: poi.tag || '',
    photos: (poi.photos || []).slice(0, 3).map((photo) => ({ title: photo.title || '' })),
  }))

  const { response, data } = await callChatCompletion([
    {
      role: 'system',
      content: '你是一个帮助用户筛选公开体验评价素材的中文分析助手。你必须输出严格 JSON。',
    },
    {
      role: 'user',
      content: buildMerchantInsightPrompt({ merchant, searchResults }),
    },
  ], 0.2)

  if (!response.ok) {
    return sendJson(res, response.status, { message: data.error?.message || '门店体验素材分析失败' })
  }

  const content = getChoiceText(data)
  const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    sendJson(res, 200, {
      summary: parsed.summary || '',
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.filter(Boolean).slice(0, 6) : [],
    })
  } catch {
    sendJson(res, 200, { summary: '', highlights: [] })
  }
}

async function generateContent(req, res) {
  if (!openaiBaseUrl || !openaiApiKey) return sendJson(res, 500, { message: '缺少大模型接口配置' })
  const body = await readBody(req)
  const { response, data } = await callChatCompletion([
    {
      role: 'system',
      content: '你是一个帮助用户整理真实探店体验的中文写作助手。你必须输出严格 JSON。',
    },
    {
      role: 'user',
      content: buildPrompt(body),
    },
  ], 0.7)
  if (!response.ok) {
    return sendJson(res, response.status, { message: data.error?.message || '大模型生成失败' })
  }

  const content = getChoiceText(data)
  const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try {
    sendJson(res, 200, JSON.parse(cleaned))
  } catch {
    sendJson(res, 200, {
      title: '探店内容草稿',
      review: cleaned,
      note: cleaned,
      tags: [],
    })
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {})
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (req.method === 'GET' && url.pathname === '/api/poi/search') return searchPoi(req, res)
    if (req.method === 'POST' && url.pathname === '/api/merchant/insights') return analyzeMerchantInsights(req, res)
    if (req.method === 'POST' && url.pathname === '/api/images/analyze') return analyzeImage(req, res)
    if (req.method === 'POST' && url.pathname === '/api/content/generate') return generateContent(req, res)
    sendJson(res, 404, { message: '接口不存在' })
  } catch (error) {
    const message = error?.name === 'AbortError' ? '大模型响应超时，请稍后重试。' : error instanceof Error ? error.message : '服务异常'
    sendJson(res, 500, { message })
  }
})

server.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`)
})
