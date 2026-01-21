# 방학특강 관리프로그램

## 프로젝트 개요

학원 학생과 교사를 위한 종합 학습 관리 시스템입니다.

| 항목 | 내용 |
|------|------|
| **프로젝트명** | 방학특강 관리프로그램 |
| **웹사이트** | https://vacation-check-91a6b.web.app |
| **Firebase 프로젝트** | vacation-check-91a6b |
| **최종 업데이트** | 2026-01-21 |

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Frontend | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| Backend | Firebase (Auth, Firestore) |
| AI APIs | Gemini, GPT-4V, Claude (이미지 분석) |
| Charts | Chart.js |
| PDF | PDF.js |
| Hosting | Firebase Hosting |
| Testing | Playwright |

---

## 파일 구조

```
├── index.html          # 메인 HTML (모든 뷰 포함)
├── script.js           # 모든 JavaScript 로직 (~13,000줄)
├── styles.css          # 모든 CSS 스타일
├── firebase.json       # Firebase Hosting 설정
├── .firebaserc         # Firebase 프로젝트 설정
├── deploy.bat          # Windows 배포 스크립트
├── CLAUDE.md           # 이 파일 (개발 가이드)
└── .moai/              # MoAI-ADK 설정
    └── config/sections/
        ├── user.yaml       # 사용자 설정
        └── language.yaml   # 언어 설정
```

---

## 주요 기능

### 학생 기능
- 📚 **학습 타이머**: 실시간 공부 시간 측정
- ✅ **과제 관리**: 과목별 필터링, 완료 체크
- 📊 **성적 기록**: 시험 점수 입력 및 추적
- 📈 **AI 학습 리포트**: 주간/월간 분석 (Gemini/GPT/Claude)
- 🏆 **랭킹**: 학원 내/전국 랭킹 확인
- 📷 **오답 분석**: 채점된 시험지 이미지 업로드 → AI가 틀린 문제 해설

### 교사(관리자) 기능
- 👨‍🎓 **학생 관리**: 윈터/외부 구분, 정렬 (윈터→외부→진행률순)
- 📝 **평가 기록**: 집중력, 숙제, 태도, 이해도 (1-5점)
- 💬 **상담 메모**: 학생별 메모 기록
- ⚠️ **위험군 모니터링**: 경고 학생 알림
- 🔔 **토큰 관리**: 충전, 사용 내역, 잔액 확인
- 📊 **AI 해설 생성**: 문제 이미지 → AI 해설 생성

---

## 핵심 시스템

### 1. 학생 정렬 시스템 (renderStudentList)

```javascript
// 정렬 순서:
// 1. 윈터(winter) 학생 먼저
// 2. 외부(external) 학생 다음
// 3. 진행률(progress) 높은 순
// 4. 공부 시간(liveSeconds) 많은 순
// 5. 이름 가나다순

const normalizeType = (type) => (type || "").toString().trim().toLowerCase();
const typeRank = (type) => {
  const t = normalizeType(type);
  return t === "winter" ? 0 : t === "external" ? 1 : 2;
};
```

### 2. 토큰 요금 시스템

```javascript
// 이미지 개수 기반 단계별 요금
function calculateTokenCost(problem) {
  // 텍스트만: 1토큰
  // 이미지 1개: 2토큰
  // 이미지 2개 이상: 3토큰
}
```

### 3. AI 이미지 분석 (틀린 문제 인식)

```javascript
// 채점된 시험지 분석 프롬프트
// - X 표시 = 틀린 문제 (분석 대상)
// - O 표시 = 맞은 문제 (무시)
// 함수: analyzeImageWithGemini, analyzeImageWithGPT, analyzeImageWithClaude
```

### 4. 틀린 문제 확인 단계

```javascript
// AI 분석 후 사용자가 확인/수정 가능
// 1. extractWrongProblemNumbers() - 문제 번호 추출
// 2. showWrongProblemConfirmation() - 체크박스 UI 표시
// 3. confirmWrongProblems() - 확인 후 필터링 및 저장
```

---

## Firestore 컬렉션 구조

```
users/
  └── {uid}/
      ├── role: "student" | "teacher" | "admin"
      ├── academyId: string
      ├── managementType: "winter" | "external"
      └── name, email, grade...

academies/
  └── {academyId}/
      ├── tokenBalance: number
      ├── students/ (subcollection)
      ├── studentAnalysis/ (subcollection)
      └── tokenHistory/ (subcollection)

dailyRecords/
  └── {date}_{uid}/
      ├── progress: number (0-100)
      ├── timerRunning: boolean
      └── seconds: number
```

---

## 배포

### 방법 1: deploy.bat (권장)
```
deploy.bat 더블클릭
```

### 방법 2: CLI
```bash
firebase login
firebase deploy --only hosting
```

### 배포 후 확인
1. 사이트 접속: https://vacation-check-91a6b.web.app
2. 브라우저 강력 새로고침: `Ctrl + Shift + R`

---

## 디버깅

### 콘솔 로그 확인
- `F12` → Console 탭
- `📊 정렬 전:` / `📊 정렬 후:` - 학생 정렬 디버그
- `📊 분석 요청:` - AI 분석 디버그

### 자주 발생하는 문제

| 문제 | 해결 |
|------|------|
| 정렬 안됨 | 배포 확인 + Ctrl+Shift+R |
| API 키 오류 | 해설 보기 탭에서 API 키 재설정 |
| 토큰 부족 | 관리자 → 토큰 충전 |

---

## 최근 변경사항 (2026-01-21)

- ✅ 학생 정렬 기능 (윈터→외부→진행률순)
- ✅ 이미지 기반 토큰 요금제 (1/2/3 토큰)
- ✅ AI 틀린 문제 인식 개선 (X 표시 인식)
- ✅ 틀린 문제 확인 단계 추가 (체크박스 UI)
- ✅ 디버그 로그 추가

---

# AI 도구 활용 가이드

> 💡 구글시트, 엑셀은 사용하지 않습니다. 모든 데이터는 시스템 내에서 관리됩니다.

---

## 1. 문제풀이 점검 (Gemini / Claude / GPT)

### 시스템 내장 기능 사용
1. **해설 보기 탭** → API 키 설정 (Gemini, OpenAI, Claude 중 택1)
2. **문제 이미지 업로드** → AI가 자동으로 분석
3. **틀린 문제 확인** → 체크박스로 검토/수정
4. **해설 생성** → 각 문제별 상세 해설

### 직접 AI에게 질문하기

**Gemini (gemini.google.com)**
```
다음은 학생이 푼 수학 문제입니다.
[이미지 첨부]

1. 틀린 문제를 찾아주세요
2. 왜 틀렸는지 분석해주세요
3. 올바른 풀이 과정을 설명해주세요
4. 비슷한 유형의 연습 문제를 추천해주세요
```

**Claude (claude.ai)**
```
이 시험지를 분석해주세요.
[이미지 첨부]

- X 표시된 문제: 틀린 문제
- O 표시된 문제: 맞은 문제

틀린 문제에 대해:
1. 학생이 어디서 실수했는지
2. 올바른 개념 설명
3. 다시 풀어볼 수 있는 힌트
```

**GPT-4 (chat.openai.com)**
```
학생의 오답을 분석해주세요.
[이미지 첨부]

각 틀린 문제에 대해:
- 오답 원인 (계산 실수? 개념 오해?)
- 정답 해설
- 추가 학습 필요 단원
```

---

## 2. 누적 테스트 생성 (NotebookLM)

### NotebookLM 설정
1. **notebooklm.google.com** 접속
2. **새 노트북 생성**
3. **소스 추가**: 교재 PDF, 기출문제, 오답노트 업로드

### 누적 테스트 생성 프롬프트
```
업로드된 자료를 바탕으로 누적 테스트를 만들어주세요.

조건:
- 총 20문제
- 난이도: 쉬움 5개, 보통 10개, 어려움 5개
- 이전 테스트에서 틀린 유형 포함
- 새로운 단원 문제도 포함

형식:
1. 문제
2. 보기 (객관식인 경우)
3. 정답 (별도 페이지)
4. 해설 (별도 페이지)
```

### 단원별 누적 테스트
```
[단원명] 누적 테스트를 만들어주세요.

포함할 내용:
- 1주차 학습 내용: [내용]
- 2주차 학습 내용: [내용]
- 3주차 학습 내용: [내용]

이전 오답 유형:
- [유형1]
- [유형2]

비율: 복습 60% + 신규 40%
```

---

## 3. 취약 단원 자동파악 리포트

### 시스템 데이터 활용
1. **학생 카드** → **리포트 보기** 클릭
2. AI가 자동으로 분석:
   - 오답률 높은 단원
   - 반복적으로 틀리는 유형
   - 학습 시간 대비 성취도

### AI에게 직접 분석 요청

**취약 단원 파악 프롬프트**
```
다음은 학생의 최근 3주간 오답 기록입니다.

[오답 목록]
- 1주차: 이차방정식 3문제, 함수 2문제
- 2주차: 이차방정식 4문제, 도형 1문제
- 3주차: 이차방정식 2문제, 확률 3문제

분석해주세요:
1. 가장 취약한 단원
2. 오답 패턴 (계산 실수? 개념 부족?)
3. 우선 보충해야 할 내용
4. 권장 학습 계획 (1주일)
```

**종합 리포트 생성**
```
학생 [이름]의 학습 분석 리포트를 작성해주세요.

데이터:
- 총 학습 시간: [시간]
- 완료한 과제: [개수]
- 평균 진행률: [%]
- 주요 오답 단원: [목록]

리포트 포함 내용:
1. 강점 분석
2. 약점 분석
3. 개선 권장사항
4. 다음 주 학습 목표 제안
```

---

## 4. AI 도구 비교

| 기능 | Gemini | Claude | GPT-4 | NotebookLM |
|------|--------|--------|-------|------------|
| 이미지 분석 | ✅ | ✅ | ✅ | ❌ |
| 문서 분석 | ✅ | ✅ | ✅ | ✅ (특화) |
| 테스트 생성 | ✅ | ✅ | ✅ | ✅ (특화) |
| 무료 사용 | ✅ | ⚠️ 제한 | ⚠️ 제한 | ✅ |
| 한국어 | ✅ | ✅ | ✅ | ✅ |

### 추천 용도
- **일상 점검**: Gemini (무료, 빠름)
- **심층 분석**: Claude (정확한 분석)
- **테스트 생성**: NotebookLM (문서 기반 특화)
- **해설 생성**: GPT-4 (상세한 설명)

---

# Alfred 실행 지침

## 핵심 규칙

- [HARD] **한국어 응답**: conversation_language가 ko이므로 모든 응답은 한국어로
- [HARD] **변경 후 커밋**: 중요한 변경은 반드시 git commit (다른 작업으로 덮어쓰기 방지)
- [HARD] **배포 안내**: 코드 수정 후 deploy.bat 실행 안내

## 이 프로젝트 작업 시 주의사항

1. **script.js가 매우 큼** (~13,000줄) - 필요한 부분만 읽기
2. **Vanilla JS** - React/Vue 아님, DOM 직접 조작
3. **Firebase 실시간** - Firestore 리스너 사용
4. **다중 AI API** - Gemini, GPT, Claude 모두 지원

## 자주 수정하는 영역

| 기능 | 위치 (대략적인 줄 번호) |
|------|------------------------|
| 학생 정렬 | ~2500줄 (renderStudentList) |
| 토큰 계산 | ~400줄 (calculateTokenCost) |
| AI 이미지 분석 | ~12500줄 (analyzeImageWith*) |
| 틀린 문제 확인 | ~12930줄 (showWrongProblemConfirmation) |

---

## 설정 파일 참조

```yaml
# .moai/config/sections/user.yaml
user:
  name: "Lucy"

# .moai/config/sections/language.yaml
language:
  conversation_language: ko
```

---

Version: 11.1.0
Last Updated: 2026-01-21
