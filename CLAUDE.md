# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**학습관리 시스템 (Learning Management System)** - A Korean vacation study program management system for teachers and students with AI-powered analytics.

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: Firebase (Authentication, Firestore)
- **Charting**: Chart.js (CDN)
- **Architecture**: Single-page application with view switching
- **Language**: Korean UI, Korean variable names in some places

## File Structure

```
├── index.html        # Main HTML with all view templates
├── script.js         # All JavaScript logic (ES6 module)
├── styles.css        # All CSS styles
└── index.html.backup # Backup of original monolithic HTML
```

## Running the Application

This is a static web application that connects to Firebase:

1. Open `index.html` in a web browser
2. No build step or dev server required
3. Must be served over HTTP/HTTPS (not file://) for Firebase to work properly

**Local development:**
```bash
# Use any static file server, e.g.:
python -m http.server 8000
# or
npx serve
```

## Architecture

### User Roles & Views

The application has three main views controlled by `onAuthStateChanged`:

1. **Login/Signup View** (`loginView`, `signupView`)
   - Role selection: student or admin (teacher)
   - Students must select grade (중1-중3, 고1-고3)

2. **Student Dashboard** (`studentView`)
   - View switching via segment buttons (오늘, 주간 통계, 📊 주간 AI, 📊 월간 AI, 🏆 랭킹)
   - Study timer that saves to Firestore every 10 seconds
   - Task management with subject filtering
   - Test result tracking

3. **Admin Dashboard** (`adminView`)
   - Three tabs: 학생 관리, 전체 비교, 위험군
   - Modal for individual student management
   - Teacher evaluation system (집중력, 숙제 완성도, 태도, 이해도)
   - Counseling memo system

### Data Model (Firestore)

**Users Collection:**
```
users/{userId}/
  - role: "student" | "admin"
  - name, nickname, grade, email, parentEmail
  - daily/{YYYY-MM-DD}/
    - progress, timerSeconds, totalTasks, completedTasks, lastUpdated
    - tasks/{taskId}/
      - subject, title, completed, createdAt, assignedBy
    - testResults/{testId}/
      - subject, score, wrongCount, createdAt
  - evaluations/{evalId}/
    - date, focus, homework, attitude, understanding, memo
    - evaluatedBy, evaluatedAt
  - counseling/{counselId}/
    - memo, counseledBy, counseledAt
```

### Key Functions & Their Purposes

**View Management:**
- `setScope(scope)` - Main view switcher for students
  - "today" → `todayWrap` (current day tasks/tests)
  - "week" → `aggWrap` + `renderAggregate(7)` (basic stats only)
  - "report" → `reportWrap` + `renderWeeklyReport()` (AI analysis)
  - "month" → `reportWrap` + `renderMonthlyReport()` (AI analysis)
  - "ranking" → `rankingWrap` + `renderRanking()`

**AI Report Functions:**
- `renderWeeklyReport()` - Lines 1044+
  - Analyzes 7 days (Monday-Sunday of current week)
  - Generates AI summary, weaknesses, subject achievements, routine analysis
  - Teacher evaluation summary, learning plan, suggestions, strengths

- `renderMonthlyReport()` - Lines 1387+
  - Analyzes 30 days (rolling month)
  - Weekly breakdown (4 weeks)
  - Long-term weakness detection (70%+ low scores = persistent weakness)
  - Month-over-month trends (first week vs last week comparison)
  - Attendance rate calculation
  - Burnout detection (progress drop >15% between weeks)

**Timer System:**
- `startTimer()`, `pauseTimer()`, `resetTimer()` - Lines 293-317
- Auto-saves to Firestore every 10 seconds (inline in `startTimer()`)
- Uses `setInterval` stored in `timerId`
- Timer state synced with `dailyRef()` document's `timerSeconds` field

**Task Management:**
- `addTask()` - Student adds own tasks (prompts for subject if "모든 과목" selected)
- `addTaskToStudent()` - Admin assigns tasks to students from modal
- `loadTasks(subj)` - Real-time listener using `onSnapshot` for specific subject
- `recalcProgressAndSave()` - Recalculates progress percentage after task changes
- Tasks filtered by `currentSubject` ("모든 과목" shows all)

**Admin Functions:**
- `openStudentModal(uid, userData)` - Opens modal with evaluation/counseling forms
- `loadCounselingHistory(uid)` - Loads past counseling memos for student
- `saveEvaluation()` - Saves teacher's daily evaluation (focus, homework, attitude, understanding)
- `saveCounseling()` - Saves counseling memo with timestamp

### Critical Implementation Details

1. **Global State Variables** (Lines 24-34):
   ```javascript
   let me = null;              // Current authenticated user
   let myData = null;          // Current user's Firestore data
   let currentSubject = "모든 과목";  // Currently selected subject filter
   const subjects = new Set(["모든 과목", "국어", "영어", "수학", "과학", "사회"]);
   let timerSeconds = 0;       // Current timer value in seconds
   let timerId = null;         // setInterval ID for timer
   let unsubTasks = null;      // Firestore unsubscribe function for tasks
   let currentScope = "today"; // Current view scope
   let currentStudentId = null; // Student ID in admin modal
   ```
   Note: `subjects` is a Set that can be dynamically expanded when users add custom subjects via the "+ 과목 추가" button

2. **Date Keys**: All daily data uses `YYYY-MM-DD` format in Asia/Seoul timezone
   ```javascript
   const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
   ```

3. **Firestore References**: Helper functions for common paths
   - `dailyRef(uid, key)` - Single day document
   - `dailiesCol(uid)` - Collection of all days
   - `tasksCol(uid, key)` - Tasks for specific day
   - `testsCol(uid, key)` - Test results for specific day
   - `evalsCol(uid)` - Evaluations (not nested by date, but filterable by date field)
   - `counselCol(uid)` - Counseling records (not nested by date, but have date field)

4. **Progress Calculation**:
   ```javascript
   progress = Math.round((completedTasks / totalTasks) * 100)
   ```
   Saved to daily document whenever tasks change

5. **Ranking Algorithm**:
   ```javascript
   score = studyMinutes + (progress * 10)
   ```
   Grouped by grade (중1-중3, 고1-고3)

6. **Admin Tab Switching**:
   Uses `data-tab` attributes and shows/hides `.admin-tab-content` divs

7. **Modal Management**:
   - `openStudentModal(uid, userData)` - Opens student detail modal with pre-filled data
   - `closeModal()` - Closes modal and resets `currentStudentId`
   - Modal uses fixed positioning with backdrop (`studentModal` div)

8. **Chart.js Memory Management**:
   - Always destroy existing chart before creating new one: `if (chart) chart.destroy()`
   - Global chart variables: `scoreChart`, `window.chartAgg1`, `window.chartAgg2`, `window.chartCompare1`, `window.chartCompare2`
   - Prevents memory leaks when re-rendering charts on view switches

### AI Analysis Logic

**Weekly Report Rules:**
- Excellent: avgProgress ≥80% AND studyDays ≥6
- Good: avgProgress ≥80%
- Moderate: 60% ≤ avgProgress < 80%
- Needs improvement: avgProgress < 60%

**Monthly Report Enhancements:**
- Attendance rate: studyDays / 30
- Persistent weakness: 70%+ of tests < 70 points
- Burnout detection: week4.avgProgress < week1.avgProgress - 15
- Irregularity detection: avg weekly progress difference > 20%

**Teacher Evaluation Grades:**
- 상/중/하 → 3/2/1 (numeric conversion for averaging)
- Average ≥2.5 → 상
- Average ≥1.5 → 중
- Average <1.5 → 하

### Common Modification Patterns

**Adding a new view:**
1. Add HTML section with unique ID to `index.html`
2. Add button with `id="seg-{name}"` in segment div
3. Add event listener: `document.getElementById("seg-{name}").onclick = () => setScope("{name}")`
4. Add case in `setScope()` function to show the view

**Adding a new AI analysis metric:**
1. Collect additional data in `renderWeeklyReport()` or `renderMonthlyReport()`
2. Add calculation logic
3. Add new section to `reportWrap` div in HTML if needed
4. Update innerHTML of target div with analysis results

**Modifying Firestore schema:**
- Update helper functions (dailyRef, etc.) if paths change
- Update save/load functions for affected features
- Consider migration path for existing data

## Important Considerations

- **No build process**: Direct browser execution of ES6 modules
- **Real-time updates**: Extensive use of Firestore `onSnapshot` listeners
- **Memory management**: Remember to unsubscribe listeners (see `unsubTasks`)
- **Korean text**: UI is in Korean; maintain consistency
- **Date handling**: Always use Asia/Seoul timezone for consistency
- **Firebase security**: API key is exposed in code (expected for web apps, but ensure Firestore rules are properly configured)
- **Authentication flow**: `onAuthStateChanged` (line 166) is the single entry point that routes users to correct dashboard based on role
- **Logout cleanup**: Timer interval must be cleared before logout to prevent orphaned intervals
- **Task deletion**: Uses hard delete (`deleteDoc()`), but code defensively checks for `__deleted` flag in rendering

## Testing

No automated tests. Manual testing workflow:
1. Create student and admin accounts
2. Test student: add tasks, start timer, record test results
3. Test admin: evaluate students, assign tasks, check rankings
4. Test AI reports: Wait for data accumulation or manipulate Firestore directly
5. Test edge cases: 0 tasks, no test results, missing evaluations
