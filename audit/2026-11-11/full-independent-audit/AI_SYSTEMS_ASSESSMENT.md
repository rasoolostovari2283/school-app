# EduConnect AI Systems Assessment — Independent Investigation

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Scope:** Paper-to-Digital AI pipeline — architecture, data flows, privacy, safety, reliability, governance

---

## Executive Summary

**AI Maturity:** **PROTOTYPE** — Functional pipeline with critical safety and privacy gaps  
**Architecture:** Dual-engine (Google Gemini + deterministic fallback)  
**Risk Level:** **CRITICAL** — PII sent to third-party, fabricated data, review bypass, no transaction safety  
**Governance:** **ABSENT** — No DPA, no consent, no audit trail, no human-in-the-loop enforcement

---

## AI System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI PIPELINE ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     Upload      ┌──────────────────┐     Extract      ┌─────────────────┐
  │   FRONTEND   │ ──────────────► │  AI EXTRACTION   │ ──────────────► │  REVIEW UI      │
  │  (Upload)    │  Image/Base64   │  paperToDigital  │  Structured     │  (Human Review) │
  └──────────────┘                 │  .service.js     │    JSON Items   └────────┬────────┘
                                   │                  │                      │
                                   │  ┌─────────────┐ │                      │
                                   │  │  ENGINE 1   │ │                      │
                                   │  │  Gemini     │ │                      │
                                   │  │  3.8 Flash  │ │                      │
                                   │  └─────────────┘ │                      │
                                   │  ┌─────────────┐ │                      │
                                   │  │  ENGINE 2   │ │                      │
                                   │  │ Deterministic│ │                      │
                                   │  │  Parser     │ │                      │
                                   │  └─────────────┘ │                      │
                                   └────────┬─────────┘                      │
                                            │                                │
                                            ▼                                │
                                   ┌─────────────────────┐                  │
                                   │  COMMIT PIPELINE    │                  │
                                   │  commitExtractedData()                 │
                                   │  • roster → sidaService.importRoster() │
                                   │  • gradesheet → gradebook_scores       │
                                   │  • exam → quizService.create()         │
                                   └─────────────────────┘                  │
```

---

## Dual-Engine Architecture

### Engine 1: Google Gemini (Cloud)
**Location:** `paperToDigital.service.js:101-185` (`callGeminiVisionExtractor`)

**Configuration:**
```javascript
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
});
model: 'gemini-3.8-flash'
responseMimeType: 'application/json'
responseSchema: // Structured schema per mode (roster/gradesheet/exam)
```

**Input:** Base64 image + optional raw OCR text  
**Output:** Structured JSON per schema (roster/gradesheet/exam)  
**Fallback:** Automatic switch to deterministic parser on any error

**Privacy Violation (P0):**
- **Student PII sent to Google:** Names, national codes, father names, grades, class names, parent phones
- **Academic data sent:** Student names, codes, scores, teacher comments
- **Exam content sent:** Questions, options, correct answers
- **No Data Processing Agreement (DPA)** visible
- **No consent mechanism** for parents/students
- **No pseudonymization** before sending

### Engine 2: Deterministic Persian Parser (Fallback)
**Location:** `paperToDigital.service.js:187-390` (`parseDeterministically`)

**Modes:**
1. **Roster** — Parses Persian text lines for student data
2. **Gradesheet** — Parses scores, student codes, comments
3. **Exam** — Parses questions, options, correct answers

**Critical Failure (P0): Fabrication on Empty Input**
```javascript
// Lines 195-224 (roster)
if (lines.length === 0) {
  return [
    { full_name: 'امیرحسین رضایی', national_code: '0024567893', ... },
    { full_name: 'سارا محمدی', national_code: '0012345679', ... },
    { full_name: 'کیانوش کریمی', national_code: '1234567890', ... },
  ];
}

// Lines 265-288 (gradesheet)
if (lines.length === 0) {
  return [
    { student_name: 'امیرحسین رضایی', student_code: '0024567893', score: 19.5, ... },
    { student_name: 'سارا محمدی', student_code: '0012345679', score: 18.25, ... },
  ];
}
```

**Impact:** Empty/poor OCR → 3 fake students with realistic national codes, high confidence (0.94-0.97) → committed to database if teacher clicks "Commit"

---

## Data Flow & Processing Pipeline

### 1. Extraction (`extractFromPaper`)
```
Input: { mode, raw_ocr_text, image_base64, default_grade, default_class_name }
    ↓
Try Gemini (if API key + image/text)
    ↓
On failure → Deterministic parser
    ↓
postProcessExtractedItems()
    → normalizePersianText, validateIranianNationalCode, normalizeIranianMobile
    → Adds: needs_review, review_reason, confidence
    ↓
Returns: { mode, engine, items[], feasibility_assessment }
```

### 2. Review UI (Frontend - not fully inspected)
**Expected Flow:** Items displayed with `needs_review` flags → Teacher reviews → Clicks "Commit"  
**Actual Backend Behavior:** **Ignores `needs_review` flag entirely**

### 3. Commit Pipeline (`commitExtractedData`)
```javascript
async commitExtractedData(currentUser, { mode, items, class_id, category_id, ... }) {
  if (mode === 'roster') {
    return sidaService.importRoster(currentUser, {
      rows: items,
      source_system: 'paper_to_digital',
      auto_create_classes: true,
      auto_link_parents: true,  // ⚠️ Creates parents without verification
    });
  }
  if (mode === 'gradesheet') {
    // Direct gradebook_scores INSERT/UPSERT loop
    // Creates category if missing
  }
  if (mode === 'exam') {
    return quizService.create(currentUser.id, class_id, {
      title: quiz_title,
      questions: items,
      ...
    }, currentUser);
  }
}
```

**Critical Gaps:**
1. **No transaction** — Writes to 3 domains (roster, gradebook, quiz) independently
2. **Ignores `needs_review`** — Line 523: `for (const item of items)` — no gate
3. **No audit trail** — No record of what AI extracted vs human reviewed
4. **Parent creation without consent** — `auto_link_parents: true` creates parent accounts

---

## Privacy & Data Protection Analysis

### Data Sent to Google Gemini (Per Request)

| Mode | Data Sent to Google |
|---|---|
| **Roster** | Student names, national codes, father names, grades, class names, parent phones |
| **Gradesheet** | Student names, student codes, scores (0-20), teacher comments |
| **Exam** | Question text, 4 options each, correct answers, points |

**Volume Estimate:** ~50-500 students per request → 50-500 national codes, names, grades per API call

### Data Protection Gaps

| Gap | Severity | Evidence |
|---|---|---|
| **No DPA with Google** | P0 | No contract visible |
| **No consent** | P0 | Parents/students not asked |
| **No pseudonymization** | P0 | Raw national codes in prompt |
| **No data minimization** | P1 | Sends full PII when only extraction needed |
| **No retention policy** | P1 | Google retains per their TOS |
| **No opt-out** | P1 | No alternative for privacy-conscious schools |
| **Cross-border transfer** | P0 | Iran → Google (US) — no SCCs visible |

### Deterministic Parser Privacy
- **No external calls** — Runs entirely on-server ✅
- **But fabricates data** on empty input ❌
- **Stores national codes in plaintext** in `users.settings` JSON

---

## Safety & Reliability Assessment

### Hallucination Risk
| Engine | Risk | Mitigation |
|---|---|---|
| **Gemini** | Medium — Structured output schema constrains, but hallucinations possible in OCR | `responseSchema` constrains structure |
| **Deterministic** | **Critical** — Fabricates data on empty input | **None** — returns fake data with high confidence |

### Fabrication Evidence
```javascript
// Deterministic roster (lines 195-224)
{ full_name: 'امیرحسین رضایی', national_code: '0024567893', confidence: 0.96 }

// Deterministic gradesheet (lines 266-288)
{ student_name: 'امیرحسین رضایی', student_code: '0024567893', score: 19.5, confidence: 0.97 }

// Deterministic exam (lines 335-356)
{ question_text: 'کدام گزینه در مورد مشتق...', options: [...], confidence: 0.96 }
```

**All fabricated entries have `confidence >= 0.78` and `needs_review: false` initially** (set to true only if validation fails).

### Reliability Gaps
| Gap | Impact |
|---|---|
| **No retry logic** on Gemini API failure | Silent fallback to deterministic |
| **No timeout config** on Gemini call | Can hang indefinitely |
| **No circuit breaker** | Repeated failures hammer API |
| **No request/response logging** | No audit of what was sent/received |
| **No cost monitoring** | Unbounded API costs |

---

## Human-in-the-Loop Assessment

### Claimed: "Mandatory Human-in-the-Loop"
**Evidence:** `feasibility_assessment.mandatory_human_in_the_loop: true` (line 47)

### Reality: **Review Gate Bypassed**
```javascript
// paperToDigital.service.js:523
for (const item of items) {
  // NO CHECK: if (item.needs_review) throw ...
  // Commits ALL items regardless of needs_review flag
}
```

**Items that should be blocked but aren't:**
- Invalid national codes (Modulo-11 check fails)
- Scores outside 0-20 range
- Handwritten digits with low confidence (< 0.85)
- Missing question text/options in exam mode

### Review UI (Frontend - Inferred)
- Displays items with `needs_review` badges
- Teacher can edit before commit
- **But backend accepts all items regardless**

---

## Data Integrity in Commit Pipeline

### Multi-Domain Writes Without Transaction

| Mode | Target Systems | Transaction |
|---|---|---|
| **Roster** | `users` + `class_members` + `parent_student_links` | ❌ None |
| **Gradesheet** | `gradebook_categories` + `gradebook_scores` | ❌ None |
| **Exam** | `quizzes` + `quiz_questions` + `quiz_attempts` | ❌ None |

**Failure Modes:**
- Roster: 50 students → 45 committed, then error → 45 students created, 5 missing
- Gradesheet: 20 scores → 15 committed, then error → partial grades
- Exam: Quiz created, 5/10 questions inserted → broken quiz

### Audit Trail Gaps
| Missing | Impact |
|---|---|
| **No `ai_import_review` table** | No record of who reviewed what, when |
| **No `needs_review` enforcement** | Unreviewed data committed |
| **No `source_confidence` tracking** | Can't audit AI vs human decisions |
| **No rollback capability** | Partial commits require manual cleanup |

---

## Integration Points

### AI → SIDA (Roster Import)
```javascript
// paperToDigital.service.js:471-482
const result = await sidaService.importRoster(currentUser, {
  rows: items,
  source_system: 'paper_to_digital',
  auto_create_classes: true,
  auto_link_parents: true,  // Creates parents without verification
});
```

### AI → Gradebook (Gradesheet)
```javascript
// paperToDigital.service.js:485-566
// Direct INSERT/UPSERT into gradebook_scores
// Creates category if missing
// No transaction
```

### AI → Quiz (Exam)
```javascript
// paperToDigital.service.js:569-593
const quiz = await quizService.create(currentUser.id, class_id, {
  title: quiz_title,
  questions: items,  // AI-extracted questions
  ...
}, currentUser);
```

---

## AI System Risk Register

| ID | Risk | Likelihood | Impact | Severity |
|---|---|---|---|---|
| **AI-001** | Student PII sent to Google without consent | High | Critical (legal, privacy) | **P0** |
| **AI-002** | Deterministic parser fabricates student data | High | Critical (data integrity) | **P0** |
| **AI-003** | Commit ignores `needs_review` flag | High | Critical (data integrity) | **P0** |
| **AI-004** | Multi-domain commit without transaction | Medium | High (partial commits) | **P1** |
| **AI-004** | Parent accounts created without verification | Medium | High (privacy) | **P1** |
| **AI-005** | No audit trail for AI decisions | Medium | Medium (audit) | **P2** |
| **AI-006** | Gemini API failure → silent fallback | Low | Medium (silent degradation) | **P2** |
| **AI-007** | No cost monitoring on Gemini API | Low | Low (cost) | **P3** |
| **AI-008** | Deterministic parser returns fake data with high confidence | High | Critical (trust) | **P0** |
| **AI-009** | No pseudonymization before AI call | High | Critical (privacy) | **P0** |
| **AI-010** | No data processing agreement with Google | High | Critical (legal) | **P0** |

---

## AI System Scorecard

| Dimension | Score | Notes |
|---|---|---|
| **Architecture** | 6/10 | Dual-engine clever, but review bypassed |
| **Privacy** | **1/10** | PII to Google, no consent, no DPA |
| **Safety** | **1/10** | Fabrication, review bypass, no transactions |
| **Reliability** | 3/10 | Fallback works, but silent degradation |
| **Governance** | **1/10** | No DPA, no consent, no audit trail |
| **Transparency** | 3/10 | Feasibility assessment honest, but review theater |
| **Human Control** | 2/10 | Review UI exists but backend ignores it |
| **Data Quality** | 2/10 | Fabrication, no validation gates |
| **Auditability** | 1/10 | No AI decision audit trail |

**Overall AI Score: 2.3/10** — **NOT PRODUCTION READY**

---

## Remediation Priority

### P0 (Immediate)
1. **Remove hardcoded fabrication** — Return empty on empty OCR
2. **Enforce `needs_review` gate** — Reject commit if any `needs_review: true`
3. **Add transaction to commit** — Wrap multi-domain writes
4. **Pseudonymize before AI call** — Hash national codes, redact names
5. **Remove auto_link_parents** — Require explicit parent consent flow
6. **Add DPA with Google** — Or switch to on-premise model

### P1 (Week 1-2)
1. **Add transaction wrapper** to `commitExtractedData`
2. **Add audit table** `ai_import_review` (who, when, what, outcome)
3. **Add validation gate** in commit: `if (item.needs_review) throw`
3. **Add request/response logging** for Gemini calls
4. **Add cost monitoring** on Gemini API
4. **Add circuit breaker** for Gemini failures

### P2 (Week 3-4)
1. **Implement pseudonymization** — Hash national codes before AI
2. **Add on-premise AI option** — Local LLM (llama.cpp, Ollama)
3. **Add consent flow** — Parent consent for AI processing
4. **Add cost alerts** — Budget alerts on Gemini usage
5. **Add evaluation framework** — Accuracy metrics per mode

---

## AI System Compliance Checklist (GDPR / Iran PDPL)

| Requirement | Status | Gap |
|---|---|---|
| **Lawful basis** | ❌ | No consent, no legitimate interest documented |
| **Data minimization** | ❌ | Sends full PII when extraction only needs image |
| **Purpose limitation** | ❌ | Google TOS allows model training on data |
| **Storage limitation** | ❌ | No retention policy for AI inputs/outputs |
| **Integrity/Confidentiality** | ❌ | Plaintext PII in transit to Google |
| **Accountability** | ❌ | No DPO, no DPIA, no records of processing |
| **Data subject rights** | ❌ | No access/rectification/erasure for AI data |
| **Breach notification** | ❌ | No 72-hour process for AI data breach |
| **DPA with processor** | ❌ | No contract with Google |
| **Cross-border transfer** | ❌ | Iran → US, no SCCs |

---

*AI Systems assessment based on static code analysis of commit `838b5b2`. No runtime testing or API calls performed.*