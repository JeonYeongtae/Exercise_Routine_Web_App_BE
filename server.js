import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import webpush from 'web-push'
import { readSubs, writeSubs } from './lib/store.js'

// ── 운동 루틴 PWA 푸시 알림 서버 ──────────────────────────────────
// 역할: ① 클라이언트 구독 저장  ② 매분 cron으로 예약된 운동 알림 발송
// 외부 가입/DB 없이 web-push(VAPID) + JSON 파일만으로 동작.

const PORT = process.env.PORT || 4000
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:liminal.yeongtae@gmail.com'

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('❌ VAPID 키가 없습니다. `npm run gen-keys` 실행 후 다시 시작하세요.')
  process.exit(1)
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const app = express()
app.use(cors())
app.use(express.json())

const DEFAULT_WEEKDAYS = [1, 2, 4, 5] // 월·화·목·금 (프론트 TRAINING_WEEKDAYS와 동일)
const DEFAULT_TZ = 'Asia/Seoul'

/** 특정 IANA 타임존 기준의 현재 시(hour)/분(minute)/요일(weekday 0=일)을 반환.
 *  Render 등 UTC 서버에서도 사용자 현지 시각으로 알림을 판정하기 위함. */
function nowInTz(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(new Date())
    const get = (t) => parts.find((p) => p.type === t)?.value
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    return {
      hour: Number(get('hour')) % 24,
      minute: Number(get('minute')),
      weekday: weekdayMap[get('weekday')] ?? 0,
    }
  } catch {
    const d = new Date() // 잘못된 tz면 서버 로컬로 폴백
    return { hour: d.getHours(), minute: d.getMinutes(), weekday: d.getDay() }
  }
}

/** 한 구독에 알림을 발송한다. 만료(404/410)면 'gone' 반환. */
async function sendTo(record, payload) {
  try {
    await webpush.sendNotification(record.subscription, JSON.stringify(payload))
    return 'sent'
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) return 'gone'
    console.error('푸시 발송 실패:', err.statusCode, err.body || err.message)
    return 'error'
  }
}

/** 만료된 구독들을 저장소에서 제거한다. */
async function pruneGone(goneEndpoints) {
  if (!goneEndpoints.length) return
  const subs = await readSubs()
  await writeSubs(subs.filter((s) => !goneEndpoints.includes(s.subscription.endpoint)))
}

// ── 라우트 ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))

// 프론트가 구독 시 필요한 VAPID 공개 키를 받아간다 (하드코딩 불필요)
app.get('/vapidPublicKey', (_req, res) => res.type('text/plain').send(VAPID_PUBLIC_KEY))

// 구독 등록/갱신 (같은 endpoint면 덮어씀)
app.post('/subscribe', async (req, res) => {
  const {
    subscription,
    hour = 20,
    minute = 0,
    weekdays = DEFAULT_WEEKDAYS,
    timezone = DEFAULT_TZ,
  } = req.body || {}
  if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription이 필요합니다.' })

  const subs = await readSubs()
  const record = {
    subscription,
    hour: Math.min(23, Math.max(0, Number(hour) || 0)),
    minute: Math.min(59, Math.max(0, Number(minute) || 0)),
    weekdays: Array.isArray(weekdays) ? weekdays : DEFAULT_WEEKDAYS,
    timezone: typeof timezone === 'string' ? timezone : DEFAULT_TZ,
    updatedAt: Date.now(),
  }
  const idx = subs.findIndex((s) => s.subscription.endpoint === subscription.endpoint)
  if (idx >= 0) subs[idx] = record
  else subs.push(record)
  await writeSubs(subs)
  res.json({ ok: true, count: subs.length, hour: record.hour, minute: record.minute })
})

// 구독 해제
app.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body || {}
  if (!endpoint) return res.status(400).json({ error: 'endpoint가 필요합니다.' })
  const subs = await readSubs()
  await writeSubs(subs.filter((s) => s.subscription.endpoint !== endpoint))
  res.json({ ok: true })
})

// 테스트 알림 즉시 발송 (endpoint 주면 해당 구독만, 없으면 전체)
app.post('/test', async (req, res) => {
  const { endpoint } = req.body || {}
  const subs = await readSubs()
  const targets = endpoint ? subs.filter((s) => s.subscription.endpoint === endpoint) : subs
  if (!targets.length) return res.status(404).json({ error: '대상 구독이 없습니다.' })

  const payload = { title: '테스트 알림 🔔', body: '푸시가 정상 동작합니다!', url: '/' }
  const gone = []
  let sent = 0
  for (const r of targets) {
    const result = await sendTo(r, payload)
    if (result === 'sent') sent++
    else if (result === 'gone') gone.push(r.subscription.endpoint)
  }
  await pruneGone(gone)
  res.json({ ok: true, sent, removed: gone.length })
})

// ── 예약 알림 cron: 매분 검사 (구독별 타임존 기준) ──────────────
cron.schedule('* * * * *', async () => {
  const subs = await readSubs()
  if (!subs.length) return

  const payload = {
    title: '운동할 시간이에요 💪',
    body: '오늘의 루틴을 PT처럼 함께 진행해요. 탭해서 시작!',
    url: '/',
  }
  const gone = []
  let sent = 0
  for (const r of subs) {
    const { hour, minute, weekday } = nowInTz(r.timezone || DEFAULT_TZ)
    const due = r.hour === hour && r.minute === minute && (r.weekdays?.includes(weekday) ?? true)
    if (!due) continue
    const result = await sendTo(r, payload)
    if (result === 'gone') gone.push(r.subscription.endpoint)
    else if (result === 'sent') sent++
  }
  await pruneGone(gone)
  if (sent || gone.length) console.log(`[cron] 알림 ${sent}건 발송, 만료 ${gone.length}건 제거`)
})

app.listen(PORT, () => {
  console.log(`🚀 푸시 서버 실행 중: http://localhost:${PORT}`)
  console.log(`   예약 알림 cron 활성화 (매분 검사)`)
})
