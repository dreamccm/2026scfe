# 항공보안 히어로 미션 — 배포 가이드

2026 서울진로직업박람회(7.14~7.17, aT센터) 부스용 모바일 이벤트 웹앱.
참가자용(`index.html`) + 관리자용(`admin.html`) 2개 페이지로 구성.

---

## 1. 구성 요약

| 구분 | 내용 |
|---|---|
| 프론트엔드 호스팅 | GitHub Pages (정적) |
| 데이터/실시간 리더보드 | Firebase Firestore |
| 관리자 인증 | Firebase Authentication (이메일/비밀번호) |
| 수집 정보 | 닉네임만 (개인정보 미수집) |
| 예상 규모 | 일 평균 150~300명 (작년 4일 852명 기준) — Firebase 무료(Spark) 티어로 충분 |
| 서드파티 라이브러리 | `js/html2canvas.min.js` — [html2canvas](https://github.com/niklasvh/html2canvas) v1.4.1 (npm 레지스트리에서 받아 저장소에 포함, 인증서 이미지 캡처용). 외부 CDN 미사용. 업데이트 시 검토 후 교체할 것 |

---

## 2. Firebase 프로젝트 생성

1. https://console.firebase.google.com 접속 → 구글 계정으로 로그인
2. "프로젝트 추가" → 프로젝트 이름 입력(예: `avsec-hero-2026`) → Google Analytics는 "사용 안 함" 선택해도 무방
3. 프로젝트 생성 완료 후 콘솔 좌측 메뉴에서 두 가지 기능을 켭니다.

### 2-1. Firestore Database 활성화
- 좌측 메뉴 "Firestore Database" → "데이터베이스 만들기"
- 위치: `asia-northeast3 (서울)` 선택 (국내 지연시간 최소화)
- 모드: "프로덕션 모드"로 시작 (규칙은 4단계에서 별도 적용)

### 2-2. Authentication 활성화
- 좌측 메뉴 "Authentication" → "시작하기"
- 로그인 방법에서 "이메일/비밀번호" 활성화
- "Users" 탭 → "사용자 추가" → 관리자용 이메일/비밀번호 등록
  - ⚠ 확인 필요: 현장 운영 인원이 여러 명이면 인원별로 계정을 추가해 둘 것

### 2-3. 웹 앱 등록 및 설정값(config) 발급
- 프로젝트 개요 화면 → `</>` (웹) 아이콘 클릭 → 앱 닉네임 입력 → 등록
- 표시되는 `firebaseConfig` 객체 값을 복사

---

## 3. 코드에 설정값 반영

`js/firebase-config.js` 파일을 열고 아래 값을 2-3단계에서 복사한 값으로 교체:

```js
export const firebaseConfig = {
  apiKey: "여기에 발급받은 값",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

> apiKey는 클라이언트(브라우저)에 노출되는 값으로, Firebase에서는 이를 비밀키로 취급하지 않습니다.
> 실제 접근 제어는 4단계의 Firestore 보안 규칙이 담당합니다.

---

## 4. Firestore 보안 규칙 적용

1. Firebase 콘솔 → Firestore Database → "규칙" 탭
2. 이 저장소의 `firestore.rules` 파일 내용을 전체 복사해 붙여넣기 → "게시"
3. ⚠ 확인 필요: 게시 전 "규칙 플레이그라운드"에서 아래 3가지를 직접 시뮬레이션해 의도대로 동작하는지 확인
   - 비로그인 상태로 `participants` 문서 생성(create) → 허용되는지
   - 비로그인 상태로 `rewardGiven` 필드 수정 시도(update) → 거부되는지
   - 로그인 상태로 동일 문서 수정 → 허용되는지

---

## 5. 로컬에서 미리 테스트

별도 서버 설치 없이 아래 중 한 가지 방법으로 로컬 확인 가능합니다.

```bash
# 프로젝트 폴더에서 실행
python3 -m http.server 8080
```
브라우저에서 `http://localhost:8080` (참가자용) / `http://localhost:8080/admin.html` (관리자용) 접속.

체크리스트:
- [ ] 닉네임 입력 후 미션 메뉴 진입
- [ ] 미션 1·2·3 각각 정상 진행 및 점수 산정
- [ ] 3개 완료 시 인증서 화면 노출
- [ ] 리더보드에 실시간 반영
- [ ] 관리자 페이지 로그인 → 참가자 목록/통계 표시
- [ ] 관리자 페이지에서 기념품 지급 토글 동작
- [ ] CSV 다운로드 정상

---

## 6. GitHub 저장소 업로드 & GitHub Pages 배포

기존 저장소가 있다고 하셨으므로, 해당 저장소 루트(또는 하위 폴더)에 이 폴더 전체를 그대로 업로드합니다.

```bash
# 기존 저장소를 클론한 폴더 기준
cp -r aviation-security-event/* /path/to/your-repo/
cd /path/to/your-repo
git add .
git commit -m "feat: 2026 서울진로직업박람회 이벤트 웹앱 추가"
git push origin main
```

GitHub Pages 활성화:
1. 저장소 → Settings → Pages
2. Source: "Deploy from a branch" 선택
3. Branch: `main` / 폴더: `/ (root)` (하위 폴더에 올렸다면 해당 경로) 선택 → Save
4. 1~2분 후 상단에 표시되는 배포 URL 확인 (예: `https://아이디.github.io/저장소명/`)

> ⚠ 확인 필요: 기존 저장소에 이미 다른 콘텐츠(예: 기존 GitHub Pages 사이트)가 있다면
> 루트에 그대로 덮어쓰지 말고 하위 폴더(`/avsec-event/` 등)에 업로드한 뒤
> 해당 경로로 접속 URL이 구성되는지 확인할 것

배포 후 `admin.html`의 "QR / 접속 링크" 영역에 위 URL을 입력하면 현장 게시용 QR코드를 생성할 수 있습니다.

---

## 7. 현장 운영 체크리스트

| 항목 | 확인 |
|---|---|
| 행사장 와이파이 SSID/접속 정보 사전 확보 | 확인 필요 |
| 부스 게시용 QR코드 인쇄(접속 URL) | 출력 필요 |
| 관리자 페이지 로그인 정보 현장 인력에 공유 | 확인 필요 |
| 행사 시작 전 테스트 데이터 초기화(`admin.html` 하단 "전체 삭제") | 시행 필요 |
| 동시 접속 다수 발생 시 Firestore 사용량(Firebase 콘솔 "사용량" 탭) 모니터링 | 권장 |

---

## 8. 알려진 한계 / 확인 필요 항목 (요약)

- Firestore 복합 색인: 리더보드 쿼리(`totalScore desc + totalTimeMs asc`) 최초 실행 시
  브라우저 콘솔에 색인 생성 링크가 표시될 수 있음 → 해당 링크 클릭해 색인 생성 필요 (확인 필요)
- 보안 규칙은 기본 시나리오만 검증된 상태이며, 악의적 클라이언트의 점수 조작(예: 직접 매우 높은 score 값으로 update)을
  완전히 막지는 못함 — 행사 성격(체험형, 경품 가치 낮음)을 고려해 허용 가능한 수준으로 판단했으나,
  보다 엄격한 검증이 필요하면 score 값 범위(0~100) 제한 규칙 추가 검토 필요 (확인 필요)
- 미션 게임 자체는 외부 서버 통신 없이 클라이언트에서만 동작하므로 와이파이가 일시적으로 끊겨도
  게임 진행은 가능하나, 완료 시점의 Firestore 저장은 재접속 후 재시도됨(자동 재시도 로직 미구현) (확인 필요)
