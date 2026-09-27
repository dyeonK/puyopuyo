# 🍮 Puyo Puyo Neon Pop Remake

HTML5 Canvas, Web Audio API, Node.js, Express, Socket.io 기반의 실시간 대전 뿌요뿌요 리메이크 게임입니다.

---

## 🚀 빠른 시작 (로컬 실행)

```bash
# 1. 의존성 설치 (이미 완료됨)
npm install

# 2. 서버 실행
npm start
```
웹 브라우저에서 `http://localhost:3000`으로 접속합니다.

---

## 🌐 배포 계획 및 가이드 (Deployment Guide)

이 프로젝트는 **실시간 양방향 통신(WebSocket / Socket.io)**을 사용하므로, 지속적인 소켓 연결을 지원하는 플랫폼에 배포해야 합니다.

### 방법 1. 24시간 상시 무료 호스팅: Render.com (가장 추천 ⭐⭐⭐)
Render는 Node.js와 WebSocket(Socket.io)을 무료 플랜에서 완벽하게 지원하며, HTTPS 및 WSS 보안 프로토콜을 자동 제공합니다.

1. **GitHub 저장소 생성 및 푸시**:
   ```bash
   git remote add origin https://github.com/<내계정>/<저장소이름>.git
   git branch -M main
   git push -u origin main
   ```
2. **[Render.com](https://render.com) 접속 및 로그인** (GitHub 계정으로 1초 로그인).
3. **New + > Web Service** 선택 후 생성한 GitHub 저장소 연결.
4. 설정값 확인:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`
5. **Create Web Service** 클릭! 약 1~2분 후 `https://puyopuyo-xxxx.onrender.com` 형태의 전용 도메인이 발급되며 즉시 전 세계 어디서든 친구와 플레이할 수 있습니다.
*(프로젝트 내에 `render.yaml` 설정 파일이 이미 동봉되어 있어 원클릭 배포도 가능합니다.)*

---

### 방법 2. 즉시 친구와 테스트: Cloudflare Tunnel or ngrok (1분 컷 ⚡)
GitHub에 올리거나 클라우드에 가입할 필요 없이, 현재 내 PC에서 실행 중인 서버를 즉시 외부 임시 URL로 열어 친구에게 보낼 수 있습니다.

#### Cloudflare Tunnel (무료 & 회원가입 불필요):
```bash
npx untun tunnel http://localhost:3000
```
터미널에 출력되는 `https://xxxx.trycloudflare.com` 링크를 친구에게 공유하면 즉시 접속 가능합니다.

---

### 방법 3. Railway.app or Fly.io
- **Railway.app**: GitHub 저장소 연결 후 배포 클릭 한 번으로 배포 완료 (매월 무료 체험 크레딧 제공)
- **Fly.io**: 초저지연 글로벌 엣지 컨테이너 호스팅

> ⚠️ **주의 (Vercel / Netlify 배포 시)**:
> Vercel과 Netlify의 기본 무료 플랜은 **서버리스(Serverless Function)** 방식이므로, 대전 중 지속적인 WebSocket 소켓 연결이 끊어질 수 있습니다. 따라서 **Render**나 **Railway** 같은 상시 구동형 Node.js 호스팅을 사용하는 것이 가장 안정적입니다.
