import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── 구독 정보 저장 (외부 DB 없이 JSON 파일 1개) ──────────────────
// 각 항목: { subscription, hour, minute, weekdays, updatedAt }

const FILE = fileURLToPath(new URL('../data/subscriptions.json', import.meta.url))

/** 저장된 구독 목록을 읽는다. 파일이 없으면 빈 배열. */
export async function readSubs() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

/** 구독 목록 전체를 저장한다. */
export async function writeSubs(subs) {
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(FILE, JSON.stringify(subs, null, 2))
}
