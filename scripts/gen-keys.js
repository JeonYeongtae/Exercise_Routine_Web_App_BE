import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import webpush from 'web-push'

// VAPID 키 쌍을 생성해 .env에 채워 넣는다 (기존 키가 있으면 교체).
const ENV = fileURLToPath(new URL('../.env', import.meta.url))
const { publicKey, privateKey } = webpush.generateVAPIDKeys()

let lines = []
if (existsSync(ENV)) {
  lines = readFileSync(ENV, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !/^VAPID_(PUBLIC|PRIVATE)_KEY=/.test(l))
}
lines.push(`VAPID_PUBLIC_KEY=${publicKey}`)
lines.push(`VAPID_PRIVATE_KEY=${privateKey}`)
writeFileSync(ENV, lines.join('\n') + '\n')

console.log('✅ VAPID 키를 생성해 .env에 저장했습니다.')
console.log('   공개 키(프론트는 서버 /vapidPublicKey 로 자동 수신):')
console.log('   ' + publicKey)
