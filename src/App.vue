<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'

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

type MapLngLat = {
  lng: number
  lat: number
}

type AMapConstructor = {
  Map: new (container: string | HTMLElement, options: Record<string, unknown>) => AMapMap
  Marker: new (options: Record<string, unknown>) => AMapMarker
  LngLat: new (lng: number, lat: number) => unknown
}

type AMapMap = {
  on: (event: string, handler: (event: { lnglat: { getLng: () => number; getLat: () => number } }) => void) => void
  setCenter: (center: [number, number]) => void
}

type AMapMarker = {
  setMap: (map: AMapMap) => void
  setPosition: (position: unknown) => void
}

declare global {
  interface Window {
    AMap?: AMapConstructor
  }
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

const visitTypes = ['正餐', '下午茶', '朋友聚会', '约会', '亲子', '独自探店']
const feelings = ['超预期', '还不错', '中规中矩', '有惊喜也有不足', '不太满意']
const likeOptions = ['味道', '环境', '服务', '性价比', '出片', '位置方便', '菜品创意']
const weakOptions = ['没有', '排队久', '上菜慢', '偏贵', '服务一般', '环境吵', '分量少']
const sceneOptions = ['朋友聚会', '约会', '家庭聚餐', '下午茶', '商务', '一个人吃']

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
const searchError = ref('')
const generateError = ref('')
const selectedLocation = ref<MapLngLat | null>({ lng: 113.93089, lat: 22.525796 })
const mapReady = ref(false)
const mapLoading = ref(false)
const mapError = ref('')
let mapInstance: AMapMap | null = null
let mapMarker: AMapMarker | null = null
let mapLoaderPromise: Promise<AMapConstructor> | null = null

const experience = reactive({
  visitType: '下午茶',
  orderedItems: '',
  price: '',
  overallFeeling: '还不错',
  likedPoints: ['环境', '出片'],
  weakPoints: ['没有'],
  suitableScenes: ['下午茶'],
  extra: '',
  style: '真实自然',
  length: '中等',
  contentType: 'both' as ContentType,
})

const currentStepIndex = computed(() => steps.findIndex((step) => step.key === currentStep.value))

const imageSummary = computed(() => {
  if (!images.value.length) return '暂未上传图片'
  return images.value.map((image) => image.analysis).join('；')
})

const canGenerate = computed(() => Boolean(selectedMerchant.value && experience.orderedItems.trim() && !generating.value))
const analyzingImageCount = computed(() => images.value.filter((image) => image.analyzing).length)
const hasAnalyzedImages = computed(() => images.value.some((image) => image.analysis && !image.analyzing))

const fallbackTitle = computed(() => {
  if (!selectedMerchant.value) return ''
  const scene = experience.suitableScenes[0] || experience.visitType
  return `${scene}可以收藏的${selectedMerchant.value.category}：${selectedMerchant.value.name}`
})

const fallbackReview = computed(() => {
  if (!selectedMerchant.value) return ''
  const merchant = selectedMerchant.value
  const weakText = experience.weakPoints.includes('没有') ? '没有特别明显的槽点' : `小不足是${experience.weakPoints.join('、')}`
  const extraText = experience.extra.trim() ? `另外，${experience.extra.trim()}` : ''
  const priceText = experience.price.trim() ? `这次实际消费大概 ¥${experience.price.trim()}。` : ''
  return `这次去的是${merchant.name}，位置在${merchant.address}，属于${merchant.category}${merchant.avgPrice ? `，参考人均大概 ¥${merchant.avgPrice}` : ''}。本次是${experience.visitType}，点了${experience.orderedItems || '几样店里的单品'}。${priceText}整体感觉${experience.overallFeeling}。比较喜欢的是${experience.likedPoints.join('、')}。从上传的图片看，${imageSummary.value}。${weakText}。${extraText}整体来说，比较适合${experience.suitableScenes.join('、')}，如果刚好在附近，可以作为一个参考选择。`
})

const fallbackNote = computed(() => {
  if (!selectedMerchant.value) return ''
  const merchant = selectedMerchant.value
  const weakText = experience.weakPoints.includes('没有') ? '整体体验比较顺，没有特别影响感受的地方。' : `需要注意的是：${experience.weakPoints.join('、')}。`
  const extraText = experience.extra.trim() ? `\n\n个人补充：${experience.extra.trim()}` : ''
  const priceText = experience.price.trim() ? `这次实际消费大概 ¥${experience.price.trim()}。` : ''
  return `今天分享一家${merchant.category}：${merchant.name}。\n\n店在${merchant.address}，这次是${experience.visitType}场景去的，点了${experience.orderedItems || '几样比较感兴趣的单品'}。${priceText}整体感受是${experience.overallFeeling}。\n\n我比较喜欢它的${experience.likedPoints.join('、')}。图片里能看到：${imageSummary.value}，写笔记时可以重点突出现场感和细节。\n\n${weakText}\n\n适合场景：${experience.suitableScenes.join('、')}。如果你也在附近，想找一家${merchant.category}，可以把它加入备选。${extraText}\n\n#${merchant.category} #${experience.visitType} #探店 #真实体验 #${merchant.name}`
})

function goTo(step: StepKey) {
  currentStep.value = step
  copied.value = false
  if (step === 'merchant') initMap()
}

function chooseMerchant(merchant: Merchant) {
  selectedMerchant.value = merchant
  if (!merchant.location) return
  const [lng, lat] = merchant.location.split(',').map(Number)
  if (Number.isFinite(lng) && Number.isFinite(lat)) updateMapLocation({ lng, lat })
}

function loadAmapScript() {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (mapLoaderPromise) return mapLoaderPromise
  const key = import.meta.env.VITE_AMAP_JS_KEY
  if (!key) return Promise.reject(new Error('缺少高德 JS API Key'))

  mapLoaderPromise = new Promise((resolveLoad, reject) => {
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`
    script.async = true
    script.onload = () => {
      if (window.AMap) resolveLoad(window.AMap)
      else reject(new Error('高德地图加载失败'))
    }
    script.onerror = () => reject(new Error('高德地图脚本加载失败'))
    document.head.appendChild(script)
  })

  return mapLoaderPromise
}

function updateMapLocation(location: MapLngLat) {
  selectedLocation.value = location
  if (!window.AMap || !mapInstance || !mapMarker) return
  const position = new window.AMap.LngLat(location.lng, location.lat)
  mapMarker.setPosition(position)
  mapInstance.setCenter([location.lng, location.lat])
}

async function initMap() {
  if (mapReady.value || mapLoading.value) return
  mapLoading.value = true
  mapError.value = ''
  try {
    await nextTick()
    const AMap = await loadAmapScript()
    const center = selectedLocation.value || { lng: 113.93089, lat: 22.525796 }
    mapInstance = new AMap.Map('merchant-map', {
      zoom: 14,
      center: [center.lng, center.lat],
      viewMode: '2D',
    })
    mapMarker = new AMap.Marker({
      position: new AMap.LngLat(center.lng, center.lat),
      anchor: 'bottom-center',
    })
    mapMarker.setMap(mapInstance)
    mapInstance.on('click', (event) => {
      updateMapLocation({
        lng: Number(event.lnglat.getLng().toFixed(6)),
        lat: Number(event.lnglat.getLat().toFixed(6)),
      })
    })
    mapReady.value = true
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : '地图初始化失败'
  } finally {
    mapLoading.value = false
  }
}

function useBrowserLocation() {
  if (!navigator.geolocation) {
    mapError.value = '当前浏览器不支持定位'
    return
  }
  mapLoading.value = true
  navigator.geolocation.getCurrentPosition(
    (position) => {
      updateMapLocation({
        lng: Number(position.coords.longitude.toFixed(6)),
        lat: Number(position.coords.latitude.toFixed(6)),
      })
      mapLoading.value = false
    },
    () => {
      mapError.value = '定位失败，请手动点击地图选点'
      mapLoading.value = false
    },
    { enableHighAccuracy: true, timeout: 8000 },
  )
}

function toggle(list: string[], value: string) {
  const index = list.indexOf(value)
  if (index >= 0) {
    if (list.length > 1) list.splice(index, 1)
    return
  }
  if (value === '没有' && list === experience.weakPoints) {
    list.splice(0, list.length, value)
    return
  }
  if (list === experience.weakPoints) {
    const noneIndex = list.indexOf('没有')
    if (noneIndex >= 0) list.splice(noneIndex, 1)
  }
  list.push(value)
}

async function searchMerchants(useMapLocation = false) {
  const keyword = searchKeyword.value.trim()
  if (!keyword) return
  searching.value = true
  searchError.value = ''
  try {
    const params = new URLSearchParams({ keyword, city: city.value.trim() || '全国' })
    if (useMapLocation && selectedLocation.value) {
      params.set('location', `${selectedLocation.value.lng},${selectedLocation.value.lat}`)
    }
    const response = await fetch(`/api/poi/search?${params}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || '门店搜索失败')
    merchants.value = data.merchants?.length ? data.merchants : []
    selectedMerchant.value = merchants.value[0] || selectedMerchant.value
    if (selectedMerchant.value?.location) {
      const [lng, lat] = selectedMerchant.value.location.split(',').map(Number)
      if (Number.isFinite(lng) && Number.isFinite(lat)) updateMapLocation({ lng, lat })
    }
    if (!merchants.value.length) searchError.value = '没有搜索到门店，可以换个关键词试试。'
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : '门店搜索失败，已保留模拟数据。'
    merchants.value = fallbackMerchants
  } finally {
    searching.value = false
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

async function analyzeUploadedImage(image: UploadedImage, file: File) {
  try {
    const compressedImage = await compressImage(file)
    const response = await fetch('/api/images/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, image: compressedImage }),
    })
    const data = await response.json() as { analysis?: string; message?: string }
    if (!response.ok) throw new Error(data.message || '图片识别失败')
    image.analysis = data.analysis || '图片已上传，但未识别到明确内容。'
  } catch (error) {
    image.error = error instanceof Error ? error.message : '图片识别失败'
    image.analysis = '图片已上传，但识别失败。你可以在补充体验里手动描述这张图。'
  } finally {
    image.analyzing = false
  }
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
      analysis: '正在调用大模型识别图片内容...',
      analyzing: true,
    }
    images.value.push(image)
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
  generating.value = true
  generateError.value = ''
  try {
    const response = await fetch('/api/content/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant: selectedMerchant.value,
        images: images.value.map((image) => ({ name: image.name, analysis: image.analysis, status: image.error ? '识别失败' : '已识别' })),
        imageSummary: imageSummary.value,
        experience,
      }),
    })
    const data = await response.json() as GenerateResponse & { message?: string }
    if (!response.ok) throw new Error(data.message || '大模型生成失败')
    titleDraft.value = data.title || fallbackTitle.value
    reviewDraft.value = data.review || fallbackReview.value
    noteDraft.value = data.note || fallbackNote.value
    generatedTags.value = data.tags || []
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : '大模型生成失败，已使用本地兜底草稿。'
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
  await navigator.clipboard.writeText(text)
  copied.value = true
}

onMounted(() => {
  if (currentStep.value === 'merchant') initMap()
})
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
        :class="['step-item', { active: currentStep === step.key, done: index < currentStepIndex }]"
        @click="goTo(step.key)"
      >
        <span>{{ index + 1 }}</span>
        {{ step.label }}
      </button>
    </nav>

    <section v-if="currentStep === 'home'" class="panel">
      <h2>第一版流程</h2>
      <div class="feature-grid">
        <article>
          <strong>1. 选择门店</strong>
          <p>通过后端代理调用高德 Web 服务搜索真实 POI，前端不会暴露地图 Key。</p>
        </article>
        <article>
          <strong>2. 上传图片</strong>
          <p>当前先做本地预览和简单素材摘要，后续可接入多模态识图。</p>
        </article>
        <article>
          <strong>3. 填写体验</strong>
          <p>用真实感受、消费项目、优缺点约束生成内容，减少空泛和虚构。</p>
        </article>
        <article>
          <strong>4. AI 生成</strong>
          <p>通过本地后端代理调用 ChatGPT 兼容接口，生成可编辑草稿。</p>
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
        <input v-model="searchKeyword" class="text-input" placeholder="搜索门店、品类或关键词，比如 阿姨炒粉" @keyup.enter="searchMerchants(false)" />
        <button class="primary-btn" :disabled="searching" @click="searchMerchants(false)">{{ searching ? '搜索中' : '搜索' }}</button>
      </div>
      <div class="map-card compact-map-card">
        <div class="map-toolbar">
          <div>
            <strong>地图选址</strong>
            <p>默认定位到深圳阿姨炒粉，可点击地图微调位置。</p>
          </div>
          <div class="map-actions">
            <button class="secondary-light-btn" :disabled="mapLoading" @click="initMap">{{ mapReady ? '已加载地图' : '加载地图' }}</button>
            <button class="secondary-light-btn" :disabled="mapLoading" @click="searchMerchants(true)">搜附近</button>
          </div>
        </div>
        <div id="merchant-map" class="map-container compact-map">
          <span v-if="!mapReady && !mapLoading">默认：阿姨炒粉附近，点此区域上方按钮加载地图</span>
          <span v-if="mapLoading">地图加载中...</span>
        </div>
        <div class="location-row compact-location-row">
          <span v-if="selectedLocation">{{ selectedLocation.lng }}, {{ selectedLocation.lat }}</span>
          <button class="text-btn" :disabled="mapLoading" @click="useBrowserLocation">用当前位置</button>
        </div>
      </div>
      <p v-if="mapError" class="error-tip">{{ mapError }}</p>
      <p v-if="searchError" class="error-tip">{{ searchError }}</p>
      <div class="merchant-section-header">
        <strong>备选门店</strong>
        <span>{{ merchants.length }} 个结果，已默认选择第一项</span>
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
      <div class="sticky-confirm-bar">
        <div>
          <strong>{{ selectedMerchant?.name || '还未选择门店' }}</strong>
          <span>{{ selectedMerchant?.address || '请选择一个备选门店' }}</span>
        </div>
        <button class="primary-btn" :disabled="!selectedMerchant" @click="goTo('images')">确认门店</button>
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
        <span>点击上传图片，上传后会立即调用大模型识别图片内容</span>
      </label>
      <div v-if="images.length" class="image-grid">
        <article v-for="image in images" :key="image.id" class="image-card">
          <img :src="image.url" :alt="image.name" />
          <div>
            <strong>{{ image.name }}</strong>
            <p :class="{ 'analyzing-text': image.analyzing }">{{ image.analysis }}</p>
            <p v-if="image.error" class="image-error-tip">{{ image.error }}</p>
            <button class="text-btn" @click="removeImage(image.id)">删除</button>
          </div>
        </article>
      </div>
      <div v-if="images.length" class="image-material-summary">
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
          点了什么 *
          <input v-model="experience.orderedItems" class="text-input" placeholder="例如：拿铁、巴斯克蛋糕" />
        </label>
        <label>
          实际消费
          <input v-model="experience.price" class="text-input" placeholder="例如：86" />
        </label>
      </div>

      <div class="choice-block">
        <h3>重点想写</h3>
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
        <h3>适合场景</h3>
        <div class="chip-row">
          <button v-for="item in sceneOptions" :key="item" :class="['chip', { active: experience.suitableScenes.includes(item) }]" @click="toggle(experience.suitableScenes, item)">{{ item }}</button>
        </div>
      </div>

      <label>
        其他补充
        <textarea v-model="experience.extra" class="text-area" placeholder="比如排队情况、服务、停车、口味偏好等"></textarea>
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

      <button class="primary-btn full" :disabled="!canGenerate" @click="generate">{{ generating ? '生成中...' : '调用大模型生成草稿' }}</button>
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
      <div class="safe-tip">本工具仅用于整理真实探店体验，生成内容为草稿，请用户确认后发布。</div>
    </section>
  </main>
</template>
