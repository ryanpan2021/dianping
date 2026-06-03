<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

type StepKey = 'home' | 'merchant' | 'images' | 'experience' | 'result'
type ContentType = 'review' | 'note' | 'both'

type Merchant = {
  id: number
  sourceId?: string
  name: string
  address: string
  category: string
  avgPrice: number
  distance: string
  tags: string[]
  location?: string
}

type UploadedImage = {
  id: number
  name: string
  url: string
  file: File
  analysis: string
  analyzing: boolean
  error?: string
}

type GenerateResponse = {
  title?: string
  review?: string
  note?: string
  tags?: string[]
}

type ImageAnalyzeResponse = {
  analysis?: string
  result?: string
  text?: string
  content?: string
  message?: string
}

type MerchantInsightResponse = {
  summary?: string
  highlights?: string[]
  recommendedScenes?: string[]
}

const fallbackMerchants: Merchant[] = [
  {
    id: 1,
    sourceId: 'B0FFHQBRZP',
    name: '阿姨炒粉(厚德品园店)',
    address: '深圳市南山区桂庙新村23栋104',
    category: '小吃快餐',
    avgPrice: 33,
    distance: '默认定位',
    tags: ['大排档', '米粉', '夜宵'],
    location: '113.930890,22.525796',
  },
  {
    id: 2,
    name: '潮汕砂锅粥',
    address: '深圳市南山区桂庙路附近',
    category: '粥店',
    avgPrice: 55,
    distance: '附近',
    tags: ['夜宵', '朋友聚餐', '热闹'],
  },
  {
    id: 3,
    name: '社区糖水铺',
    address: '深圳市南山区桂庙新村附近',
    category: '甜品',
    avgPrice: 28,
    distance: '附近',
    tags: ['糖水', '饭后甜品', '轻松'],
  },
]

const steps: { key: StepKey; label: string }[] = [
  { key: 'home', label: '开始' },
  { key: 'merchant', label: '选店' },
  { key: 'images', label: '图片' },
  { key: 'experience', label: '体验' },
  { key: 'result', label: '结果' },
]

const visitTypes = ['晚餐', '午餐', '宵夜', '下午茶', '玩乐放松', '生活体验', '景区游览', '表演演出', '朋友聚会', '约会', '亲子', '独自体验']
const feelings = ['超预期', '还不错', '中规中矩', '有惊喜也有不足', '不太满意']
const likeOptions = ['味道', '环境', '服务', '性价比', '出片', '位置方便', '项目体验', '现场氛围', '动线安排', '互动感']
const weakOptions = ['没有', '排队久', '等待久', '偏贵', '服务一般', '环境吵', '体验时长短', '人太多', '指引不清晰']
const sceneOptions = ['朋友聚会', '约会', '家庭亲子', '下午茶', '商务休闲', '一个人放松', '周末玩乐', '旅行打卡', '演出观赏', '生活体验']

const currentStep = ref<StepKey>('home')
const searchKeyword = ref('阿姨炒粉')
const city = ref('深圳')
const merchants = ref<Merchant[]>(fallbackMerchants)
const selectedMerchant = ref<Merchant | null>(fallbackMerchants[0])
const images = ref<UploadedImage[]>([])
const copied = ref(false)
const generatedAt = ref('')
const titleDraft = ref('')
const reviewDraft = ref('')
const noteDraft = ref('')
const generatedTags = ref<string[]>([])
const searching = ref(false)
const generating = ref(false)
const fetchingMerchantInsights = ref(false)
const searchError = ref('')
const generateError = ref('')
const copyError = ref('')
const merchantInsightError = ref('')
const merchantInsightSummary = ref('')
const merchantInsightHighlights = ref<string[]>([])
let merchantInsightRequestId = 0
let merchantInsightPromise: Promise<void> | null = null

const experience = reactive({
  visitType: '',
  orderedItems: '',
  price: '',
  overallFeeling: '还不错',
  likedPoints: ['环境', '出片'],
  weakPoints: ['没有'],
  suitableScenes: [] as string[],
  extra: '',
  style: '真实自然',
  length: '中等',
  contentType: 'both' as ContentType,
})

const recommendedScenes = ref<string[]>([])

const currentStepIndex = computed(() => steps.findIndex((step) => step.key === currentStep.value))
const stepBlockTip = ref('')

const stepReady = computed<Record<StepKey, boolean>>(() => ({
  home: true,
  merchant: true,
  images: Boolean(selectedMerchant.value),
  experience: Boolean(selectedMerchant.value),
  result: Boolean(selectedMerchant.value && experience.orderedItems.trim()),
}))

const stepBlockReason: Record<StepKey, string> = {
  home: '',
  merchant: '',
  images: '请先选择并确认门店',
  experience: '请先选择并确认门店',
  result: '请先选择门店并填写体验内容',
}

const imageSummary = computed(() => {
  if (!images.value.length) return '暂未上传图片'
  return images.value.map((image) => image.analysis).join('；')
})

const canGenerate = computed(() => Boolean(selectedMerchant.value && experience.orderedItems.trim() && !generating.value))
const analyzingImageCount = computed(() => images.value.filter((image) => image.analyzing).length)
const hasAnalyzedImages = computed(() => images.value.some((image) => image.analysis && !image.analyzing))

const fallbackTitle = computed(() => {
  if (!selectedMerchant.value) return ''
  const merchant = selectedMerchant.value
  const scene = experience.suitableScenes[0] || experience.visitType
  const like = experience.likedPoints[0] || ''
  if (scene && like) return `${scene}藏了家${like}在线的${merchant.category}`
  if (like) return `这家${merchant.category}的${like}真的可以`
  if (scene) return `${scene}被这家${merchant.category}惊喜到了`
  return `悄悄分享一家好逛的${merchant.category}`
})

const fallbackReview = computed(() => {
  if (!selectedMerchant.value) return ''
  const merchant = selectedMerchant.value
  const weakText = experience.weakPoints.includes('没有') ? '没有特别明显的槽点' : `小不足是${experience.weakPoints.join('、')}`
  const extraText = experience.extra.trim() ? `另外，${experience.extra.trim()}` : ''
  const priceText = experience.price.trim() ? `这次实际消费大概 ¥${experience.price.trim()}。` : ''
  const insightText = merchantInsightSummary.value ? `${merchantInsightSummary.value}。` : ''
  const visitText = experience.visitType ? `这次是${experience.visitType}过来的，` : ''
  const sceneText = experience.suitableScenes.length ? `个人觉得挺适合${experience.suitableScenes.join('、')}，` : ''
  const imageText = imageSummary.value ? `现场${imageSummary.value}。` : ''
  return `${visitText}去了${merchant.name}，在${merchant.address}，属于${merchant.category}${merchant.avgPrice ? `，人均大概 ¥${merchant.avgPrice}` : ''}。点了${experience.orderedItems || '几样想试的'}。${priceText}整体感觉${experience.overallFeeling}，最喜欢的是${experience.likedPoints.join('、')}。${insightText}${imageText}${weakText}。${extraText}${sceneText}如果刚好在附近，可以去试试。`
})

const fallbackNote = computed(() => {
  if (!selectedMerchant.value) return ''
  const merchant = selectedMerchant.value
  const weakText = experience.weakPoints.includes('没有') ? '整体体验比较顺，没有特别影响感受的地方。' : `需要注意的是：${experience.weakPoints.join('、')}。`
  const extraText = experience.extra.trim() ? `\n\n个人补充：${experience.extra.trim()}` : ''
  const priceText = experience.price.trim() ? `这次实际消费大概 ¥${experience.price.trim()}。` : ''
  const insightText = merchantInsightSummary.value ? `\n\n${merchantInsightSummary.value}。` : ''
  const visitText = experience.visitType ? `这次是${experience.visitType}过来的，` : ''
  const sceneText = experience.suitableScenes.length ? `\n\n适合场景：${experience.suitableScenes.join('、')}。` : ''
  const visitTag = experience.visitType ? ` #${experience.visitType}` : ''
  const imageText = imageSummary.value ? `现场${imageSummary.value}。` : ''
  return `${visitText}去了${merchant.name}，在${merchant.address}。点了${experience.orderedItems || '几样想试的'}，${priceText}整体感受是${experience.overallFeeling}。${insightText}\n\n最喜欢的是它的${experience.likedPoints.join('、')}。${imageText}\n\n${weakText}${sceneText}\n\n要是你也在附近，想找一家${merchant.category}，可以把它加进备选。${extraText}\n\n#${merchant.category}${visitTag} #探店 #真实体验 #${merchant.name}`
})

function goTo(step: StepKey) {
  if (!stepReady.value[step]) {
    stepBlockTip.value = stepBlockReason[step]
    return
  }
  stepBlockTip.value = ''
  currentStep.value = step
  copied.value = false
}

function chooseMerchant(merchant: Merchant) {
  selectedMerchant.value = merchant
  merchantInsightPromise = fetchMerchantInsights(merchant)
}

async function fetchMerchantInsights(merchant: Merchant) {
  const requestId = ++merchantInsightRequestId
  fetchingMerchantInsights.value = true
  merchantInsightError.value = ''
  merchantInsightSummary.value = ''
  merchantInsightHighlights.value = []
  recommendedScenes.value = []
  try {
    const response = await fetch('/api/merchant/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, city: city.value.trim() || '全国', sceneOptions }),
    })
    const data = await response.json() as MerchantInsightResponse & { message?: string }
    if (requestId !== merchantInsightRequestId) return
    if (!response.ok) throw new Error(data.message || '门店体验素材检索失败')
    merchantInsightSummary.value = data.summary || ''
    merchantInsightHighlights.value = data.highlights || []
    recommendedScenes.value = (data.recommendedScenes || []).filter((scene) => sceneOptions.includes(scene))
    applyRecommendedScenes()
  } catch (error) {
    if (requestId !== merchantInsightRequestId) return
    merchantInsightError.value = error instanceof Error ? error.message : '门店体验素材检索失败，已忽略。'
  } finally {
    if (requestId === merchantInsightRequestId) fetchingMerchantInsights.value = false
  }
}

function applyRecommendedScenes() {
  if (!recommendedScenes.value.length) return
  if (experience.suitableScenes.length) return
  experience.suitableScenes = recommendedScenes.value.slice(0, MAX_MULTI_SELECT)
}

function confirmMerchant() {
  goTo('images')
}

const MAX_MULTI_SELECT = 4
const multiSelectTip = ref('')

function toggle(list: string[], value: string) {
  const index = list.indexOf(value)
  if (index >= 0) {
    if (list.length > 1) list.splice(index, 1)
    return
  }
  if (value === '没有' && list === experience.weakPoints) {
    list.splice(0, list.length, value)
    multiSelectTip.value = ''
    return
  }
  if (list === experience.weakPoints) {
    const noneIndex = list.indexOf('没有')
    if (noneIndex >= 0) list.splice(noneIndex, 1)
  }
  if (list.length >= MAX_MULTI_SELECT) {
    multiSelectTip.value = `最多选择 ${MAX_MULTI_SELECT} 项，请先取消一项再选`
    return
  }
  multiSelectTip.value = ''
  list.push(value)
}

async function searchMerchants() {
  const keyword = searchKeyword.value.trim()
  if (!keyword) return
  searching.value = true
  searchError.value = ''
  try {
    const params = new URLSearchParams({ keyword, city: city.value.trim() || '全国' })
    const response = await fetch(`/api/poi/search?${params}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || '门店搜索失败')
    merchants.value = data.merchants?.length ? data.merchants : []
    selectedMerchant.value = null
    merchantInsightSummary.value = ''
    merchantInsightHighlights.value = []
    recommendedScenes.value = []
    merchantInsightPromise = null
    if (!merchants.value.length) searchError.value = '没有搜索到门店，可以换个关键词试试。'
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : '门店搜索失败，已保留模拟数据。'
    merchants.value = fallbackMerchants
  } finally {
    searching.value = false
  }
}

async function fetchJsonWithTimeout<T>(url: string, options: RequestInit, timeout = 70000): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const data = await response.json() as T & { message?: string }
    if (!response.ok) throw new Error(data.message || '请求失败')
    return data
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI 识别超时，请稍后重试或换一张更小的图片。')
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

async function compressImage(file: File) {
  const dataUrl = await new Promise<string>((resolveRead, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolveRead(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolveImage, reject) => {
    const img = new Image()
    img.onload = () => resolveImage(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })

  const maxSize = 1280
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('图片压缩失败')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.78)
}

function updateImage(id: number, patch: Partial<UploadedImage>) {
  images.value = images.value.map((image) => (image.id === id ? { ...image, ...patch } : image))
}

async function analyzeUploadedImage(image: UploadedImage, file: File) {
  updateImage(image.id, { analyzing: true, error: undefined, analysis: '正在压缩图片...' })
  try {
    const compressedImage = await compressImage(file)
    updateImage(image.id, { analysis: 'AI 智能识图中...' })
    const data = await fetchJsonWithTimeout<ImageAnalyzeResponse>('/api/images/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, image: compressedImage }),
    }, 70000)
    updateImage(image.id, { analysis: data.analysis || data.result || data.text || data.content || '图片已上传，但未识别到明确内容。' })
  } catch (error) {
    updateImage(image.id, {
      error: error instanceof Error ? error.message : '图片识别失败',
      analysis: '图片已上传，但识别失败。你可以在补充体验里手动描述这张图。',
    })
  } finally {
    updateImage(image.id, { analyzing: false })
  }
}

function retryAnalyzeImage(id: number) {
  const image = images.value.find((item) => item.id === id)
  if (image) analyzeUploadedImage(image, image.file)
}

function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  files.forEach((file) => {
    const url = URL.createObjectURL(file)
    const image: UploadedImage = {
      id: Date.now() + Math.random(),
      name: file.name,
      url,
      file,
      analysis: '等待识别...',
      analyzing: true,
    }
    images.value = [...images.value, image]
    analyzeUploadedImage(image, file)
  })
  input.value = ''
}

function removeImage(id: number) {
  const image = images.value.find((item) => item.id === id)
  if (image) URL.revokeObjectURL(image.url)
  images.value = images.value.filter((item) => item.id !== id)
}

async function generate() {
  if (!selectedMerchant.value) return
  if (merchantInsightPromise) await merchantInsightPromise
  generating.value = true
  generateError.value = ''
  try {
    const response = await fetch('/api/content/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant: selectedMerchant.value,
        images: images.value
          .filter((image) => !image.error && image.analysis)
          .map((image) => ({ name: image.name, analysis: image.analysis })),
        imageSummary: imageSummary.value,
        merchantInsights: {
          summary: merchantInsightSummary.value,
          highlights: merchantInsightHighlights.value,
        },
        experience,
      }),
    })
    const data = await response.json() as GenerateResponse & { message?: string }
    if (!response.ok) throw new Error(data.message || 'AI 智能创作失败')
    titleDraft.value = data.title || fallbackTitle.value
    reviewDraft.value = data.review || fallbackReview.value
    noteDraft.value = data.note || fallbackNote.value
    generatedTags.value = data.tags || []
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : 'AI 智能创作失败，已使用本地兜底草稿。'
    titleDraft.value = fallbackTitle.value
    reviewDraft.value = fallbackReview.value
    noteDraft.value = fallbackNote.value
    generatedTags.value = selectedMerchant.value.tags
  } finally {
    generatedAt.value = new Date().toLocaleString('zh-CN')
    generating.value = false
    goTo('result')
  }
}

async function copyText(text: string) {
  copyError.value = ''
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const success = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (!success) throw new Error('复制失败')
    }
    copied.value = true
  } catch {
    copyError.value = '复制失败，请手动选中文本复制。'
  }
}

</script>

<template>
  <main class="app-shell">
    <section class="hero-card">
      <div>
        <p class="eyebrow">真实探店 · 草稿生成</p>
        <h1>探店文案助手</h1>
        <p class="hero-desc">选门店、传图片、填体验，一键整理成大众点评评价和探店笔记草稿。</p>
      </div>
      <button class="primary-btn" @click="goTo('merchant')">开始写一篇</button>
    </section>

    <nav class="stepper" aria-label="生成步骤">
      <button
        v-for="(step, index) in steps"
        :key="step.key"
        :class="['step-item', { active: currentStep === step.key, done: index < currentStepIndex, locked: !stepReady[step.key] }]"
        :disabled="!stepReady[step.key]"
        @click="goTo(step.key)"
      >
        <span>{{ index + 1 }}</span>
        {{ step.label }}
      </button>
    </nav>
    <p v-if="stepBlockTip" class="error-tip step-block-tip">{{ stepBlockTip }}</p>

    <section v-if="currentStep === 'home'" class="panel">
      <h2>四步生成走心点评</h2>
      <div class="feature-grid">
        <article>
          <strong>1. 选择门店</strong>
          <p>搜索真实门店信息，自动补充门店亮点作为创作素材。</p>
        </article>
        <article>
          <strong>2. 上传图片</strong>
          <p>上传后 AI 智能识图，提取项目、环境、菜单、现场氛围等可写素材。</p>
        </article>
        <article>
          <strong>3. 填写体验</strong>
          <p>用真实感受、消费项目、优缺点约束生成内容，减少空泛和虚构。</p>
        </article>
        <article>
          <strong>4. AI 智能创作</strong>
          <p>结合门店与图片素材，一键生成可编辑的点评和笔记草稿。</p>
        </article>
      </div>
    </section>

    <section v-if="currentStep === 'merchant'" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Step 1</p>
          <h2>选择门店</h2>
        </div>
        <span class="hint">高德 POI 搜索</span>
      </div>
      <div class="search-row">
        <input v-model="city" class="text-input city-input" placeholder="城市" />
        <input v-model="searchKeyword" class="text-input" placeholder="搜索门店、品类或关键词，比如 阿姨炒粉" @keyup.enter="searchMerchants" />
        <button class="primary-btn" :disabled="searching" @click="searchMerchants">{{ searching ? '搜索中' : '搜索' }}</button>
      </div>
      <p v-if="searchError" class="error-tip">{{ searchError }}</p>
      <div class="merchant-section-header">
        <strong>备选门店</strong>
        <span>{{ merchants.length }} 个结果，请点击选择一个</span>
      </div>
      <div class="merchant-list compact-merchant-list">
        <button
          v-for="merchant in merchants"
          :key="merchant.sourceId || merchant.id"
          :class="['merchant-card', { selected: selectedMerchant?.sourceId === merchant.sourceId && selectedMerchant?.id === merchant.id }]"
          @click="chooseMerchant(merchant)"
        >
          <div class="merchant-main">
            <div>
              <h3>{{ merchant.name }}</h3>
              <p class="merchant-address">{{ merchant.address }}</p>
              <p class="merchant-meta">{{ merchant.category }}<template v-if="merchant.avgPrice"> · ¥{{ merchant.avgPrice }}</template><template v-if="merchant.distance"> · {{ merchant.distance }}</template></p>
            </div>
            <span v-if="selectedMerchant?.sourceId === merchant.sourceId && selectedMerchant?.id === merchant.id" class="selected-badge">已选</span>
          </div>
          <div class="tag-row compact-tags">
            <span v-for="tag in merchant.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
          </div>
        </button>
      </div>
      <p v-if="fetchingMerchantInsights" class="hint-line">正在后台提取公开体验素材，请稍等（不影响继续下一步）</p>
      <p v-if="merchantInsightError" class="error-tip">{{ merchantInsightError }}</p>
      <div v-if="merchantInsightSummary" class="material-summary">
        <strong>已提取公开体验素材</strong>
        <p>{{ merchantInsightSummary }}</p>
        <div v-if="merchantInsightHighlights.length" class="tag-row compact-tags">
          <span v-for="item in merchantInsightHighlights" :key="item">{{ item }}</span>
        </div>
      </div>
      <div class="sticky-confirm-bar">
        <div>
          <strong>{{ selectedMerchant?.name || '还未选择门店' }}</strong>
          <span>{{ selectedMerchant?.address || '请选择一个备选门店' }}</span>
        </div>
        <button class="primary-btn" :disabled="!selectedMerchant" @click="confirmMerchant">确认门店</button>
      </div>
    </section>

    <section v-if="currentStep === 'images'" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Step 2</p>
          <h2>上传图片素材</h2>
        </div>
        <span class="hint">{{ analyzingImageCount ? `识别中 ${analyzingImageCount} 张` : hasAnalyzedImages ? '已生成图片素材' : '最多建议 9 张' }}</span>
      </div>
      <label class="upload-box">
        <input type="file" multiple accept="image/*" @change="handleImageUpload" />
        <span>点击上传图片，上传后会自动进行 AI 智能识图</span>
      </label>
      <div v-if="images.length" class="image-grid">
        <article v-for="image in images" :key="image.id" class="image-card">
          <img :src="image.url" :alt="image.name" />
          <div>
            <strong>{{ image.name }}</strong>
            <p :class="{ 'analyzing-text': image.analyzing }">{{ image.analysis }}</p>
            <p v-if="image.error" class="image-error-tip">{{ image.error }}</p>
            <button class="text-btn" @click="removeImage(image.id)">删除</button>
            <button v-if="image.error" class="text-btn" @click="retryAnalyzeImage(image.id)">重新识别</button>
          </div>
        </article>
      </div>
      <div v-if="images.length" class="material-summary">
        <strong>图片素材摘要</strong>
        <p>{{ imageSummary }}</p>
      </div>
      <button class="primary-btn full" @click="goTo('experience')">继续填写体验</button>
    </section>

    <section v-if="currentStep === 'experience'" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Step 3</p>
          <h2>补充真实体验</h2>
        </div>
        <span class="hint">带 * 的建议填写</span>
      </div>
      <div class="form-grid">
        <label>
          本次场景
          <select v-model="experience.visitType" class="text-input">
            <option value="">不指定（可留空）</option>
            <option v-for="item in visitTypes" :key="item">{{ item }}</option>
          </select>
        </label>
        <label>
          整体感受
          <select v-model="experience.overallFeeling" class="text-input">
            <option v-for="item in feelings" :key="item">{{ item }}</option>
          </select>
        </label>
        <label>
          体验了什么 *
          <input v-model="experience.orderedItems" class="text-input" placeholder="例如：拿铁、巴斯克蛋糕、密室主题、景区路线、演出曲目" />
        </label>
        <label>
          实际消费
          <input v-model="experience.price" class="text-input" placeholder="例如：86" />
        </label>
      </div>

      <div class="choice-block">
        <h3>重点想写<span class="choice-hint">最多 4 项</span></h3>
        <div class="chip-row">
          <button v-for="item in likeOptions" :key="item" :class="['chip', { active: experience.likedPoints.includes(item) }]" @click="toggle(experience.likedPoints, item)">{{ item }}</button>
        </div>
      </div>

      <div class="choice-block">
        <h3>不足之处</h3>
        <div class="chip-row">
          <button v-for="item in weakOptions" :key="item" :class="['chip', { active: experience.weakPoints.includes(item) }]" @click="toggle(experience.weakPoints, item)">{{ item }}</button>
        </div>
      </div>

      <div class="choice-block">
        <h3>适合场景<span class="choice-hint">最多 4 项</span></h3>
        <p v-if="recommendedScenes.length" class="recommend-line">
          AI 推荐：
          <button
            v-for="item in recommendedScenes"
            :key="item"
            :class="['recommend-chip', { active: experience.suitableScenes.includes(item) }]"
            @click="toggle(experience.suitableScenes, item)"
          >{{ item }}</button>
        </p>
        <div class="chip-row">
          <button v-for="item in sceneOptions" :key="item" :class="['chip', { active: experience.suitableScenes.includes(item) }]" @click="toggle(experience.suitableScenes, item)">{{ item }}</button>
        </div>
      </div>

      <p v-if="multiSelectTip" class="error-tip">{{ multiSelectTip }}</p>

      <label>
        其他补充
        <textarea v-model="experience.extra" class="text-area" placeholder="比如排队情况、服务、停车、口味偏好、游玩动线、演出视角、项目时长等"></textarea>
      </label>

      <div class="form-grid settings-grid">
        <label>
          内容类型
          <select v-model="experience.contentType" class="text-input">
            <option value="both">点评 + 笔记</option>
            <option value="review">只生成点评</option>
            <option value="note">只生成笔记</option>
          </select>
        </label>
        <label>
          文风
          <select v-model="experience.style" class="text-input">
            <option>真实自然</option>
            <option>种草推荐</option>
            <option>简短实用</option>
            <option>口语幽默</option>
          </select>
        </label>
      </div>

      <button class="primary-btn full" :disabled="!canGenerate" @click="generate">{{ generating ? 'AI 智能创作中...' : 'AI 智能创作' }}</button>
    </section>

    <section v-if="currentStep === 'result'" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Step 4</p>
          <h2>生成结果</h2>
        </div>
        <span class="hint">{{ generatedAt }}</span>
      </div>
      <p v-if="generateError" class="error-tip">{{ generateError }}</p>
      <div class="result-toolbar">
        <button class="secondary-btn" :disabled="generating" @click="goTo('experience')">返回修改</button>
        <button class="primary-btn" :disabled="generating" @click="generate">{{ generating ? '重新生成中...' : '重新生成' }}</button>
      </div>
      <div class="result-summary" v-if="selectedMerchant">
        <strong>{{ selectedMerchant.name }}</strong>
        <span>{{ selectedMerchant.category }} · {{ selectedMerchant.address }}</span>
      </div>
      <article v-if="experience.contentType !== 'review'" class="result-card">
        <input v-model="titleDraft" class="result-title-input" />
        <textarea v-model="noteDraft" class="result-text"></textarea>
        <div v-if="generatedTags.length" class="tag-row">
          <span v-for="tag in generatedTags" :key="tag">#{{ tag }}</span>
        </div>
        <button class="secondary-btn" @click="copyText(`${titleDraft}\n\n${noteDraft}`)">复制探店笔记</button>
      </article>
      <article v-if="experience.contentType !== 'note'" class="result-card">
        <h3>大众点评评价草稿</h3>
        <textarea v-model="reviewDraft" class="result-text"></textarea>
        <button class="secondary-btn" @click="copyText(reviewDraft)">复制点评</button>
      </article>
      <p v-if="copied" class="success-tip">已复制到剪贴板，请确认内容真实准确后再发布。</p>
      <p v-if="copyError" class="error-tip">{{ copyError }}</p>
      <div class="safe-tip">本工具仅用于整理真实探店体验，生成内容为草稿，请用户确认后发布。</div>
    </section>
  </main>
</template>
