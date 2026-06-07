# 운동 루틴 PWA — 푸시 알림 백엔드

프론트엔드([Exercise_Routine_Web_App_FE](../Exercise_Routine_Web_App_FE))에 "앱을 열지 않아도 오는 예약 운동 알림"을 붙여주는 작은 Node 서버입니다. 외부 가입·DB 없이 **Web Push(VAPID) + node-cron + JSON 파일**만으로 동작합니다.

## 빠른 시작 (로컬)

```bash
npm install
npm run gen-keys     # VAPID 키 생성 → .env 자동 작성
npm run dev          # http://localhost:4000
```

서버가 뜨면 프론트엔드 **설정 → 운동 알림**에서 서버 주소(`http://localhost:4000`)를 넣고 알림을 켜면 됩니다.

> ⚠️ 푸시는 **HTTPS(또는 localhost)** 에서만 동작합니다. 실제 폰 테스트는 아래 배포가 필요합니다.

## 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 상태 확인 |
| GET | `/vapidPublicKey` | 구독에 필요한 공개 키 (프론트가 자동 수신) |
| POST | `/subscribe` | 구독 등록/갱신 `{ subscription, hour, minute, weekdays }` |
| POST | `/unsubscribe` | 구독 해제 `{ endpoint }` |
| POST | `/test` | 테스트 알림 즉시 발송 `{ endpoint? }` |

예약 알림은 `node-cron`이 **매분** 검사해, 구독에 저장된 `hour:minute`이고 `weekdays`에 해당하는 요일이면 발송합니다.

## 배포 (무료 호스팅 예: Render)

1. 이 폴더를 GitHub 레포로 푸시 (예: `Exercise_Routine_Web_App_BE`).
2. [Render](https://render.com) → New **Web Service** → 레포 연결.
   - Build Command: `npm install`
   - Start Command: `npm start`
3. **Environment**에 `.env`의 키들을 등록:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   - (`PORT`는 Render가 자동 주입하므로 생략 가능)
4. 배포된 URL(예: `https://xxx.onrender.com`)을 프론트 **설정**의 서버 주소에 입력.

> 무료 플랜은 유휴 시 잠들 수 있어 cron이 끊길 수 있습니다. 정시 알림이 중요하면 항상 켜진 플랜을 쓰거나, [cron-job.org](https://cron-job.org) 등으로 `/health`를 주기적으로 깨워주세요. 구독 정보는 `data/subscriptions.json`에 저장되므로, 영구 디스크가 없는 호스팅에서는 재배포 시 초기화될 수 있습니다.

## 구조

```
server.js          Express + 라우트 + cron
lib/store.js       구독 JSON 파일 입출력
scripts/gen-keys.js VAPID 키 생성기
data/              구독 저장 (gitignore)
```
