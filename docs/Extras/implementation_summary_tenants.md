# Tenant-Facing Features — Implementation Summary

## ✅ Status: All 6 endpoints implemented and verified

**25/25 tests pass** (15 new + 10 existing — zero regressions). All 6 endpoints smoke-tested live via uvicorn.

---

## New Endpoints

| # | Endpoint | Method | Status | Sample Response |
|---|----------|--------|--------|-----------------|
| 1 | `/chat/{pid}/{uid}` | POST | ✅ 503 w/o key, ready with key | Gemini + 7 tools |
| 2 | `/recommendations/{pid}/{uid}` | GET | ✅ 200 | 11 ranked actions, `narrative=null` w/o key |
| 3 | `/target/{pid}/{uid}` | POST | ✅ 200 | `projected=373.18€`, fallback narrative |
| 4 | `/today/{pid}/{uid}` | GET | ✅ 200 | `kwh_so_far=111.39`, `cost_eur_so_far=12.25` |
| 5 | `/peers/{pid}/{uid}` | GET | ✅ 200 | `badge="📈 Headroom to Save"`, equivalents |
| 6 | `/leaks/{pid}/{uid}` | GET | ✅ 200 | 3 signals (2 insulation, 1 spike) |

---

## Files Created (11 new)

| File | Purpose |
|------|---------|
| [llm/__init__.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/llm/__init__.py) | Package init |
| [llm/gemini.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/llm/gemini.py) | Lazy Gemini client + tool-call loop (max 6 iterations) |
| [llm/tools.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/llm/tools.py) | 7 tool declarations pre-bound to tenant context |
| [llm/prompts.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/llm/prompts.py) | 4 system prompts (chat, reco, target, leaks) |
| [models/today.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/models/today.py) | Diurnal-curve intra-day synthesis |
| [models/recommendations.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/models/recommendations.py) | 3-source savings engine (setpoint + behaviour + insulation) |
| [models/peers_extended.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/models/peers_extended.py) | Badges, equivalents, trends, aspirational targets |
| [models/leaks.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/models/leaks.py) | 4-signal anomaly detector (A–D) |
| [data/diurnal_curve.json](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/data/diurnal_curve.json) | 24-hour heating profile |
| [tests/test_tenant_endpoints.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/tests/test_tenant_endpoints.py) | 15 tests covering all endpoints + offline resilience |

## Files Modified (3)

| File | Change |
|------|--------|
| [serve/api.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/serve/api.py) | 6 new routes + enhanced `/peers` via `peers_extended` |
| [config.py](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/src/techem/config.py) | Added fun-equivalent constants + diurnal curve path |
| [requirements.txt](file:///d:/Projects/Hackathons/Hackathon_Futury_2026_Techem_Challange/requirements.txt) | Added `google-generativeai>=0.8` |

---

## Architecture Highlights

### Offline Resilience
Every endpoint works **without a Gemini API key**:
- `/today`, `/recommendations`, `/peers`, `/leaks` → return algorithmic data, `narrative=null`
- `/target` → returns structured fallback with projected/gap numbers
- `/chat` → 503 (requires key by design)

### LLM Tool-Calling
The chatbot has access to **7 internal tools** (Python function calls, not HTTP):
`get_forecast`, `get_drilldown`, `what_if`, `get_peers`, `get_today`, `get_leak_signals`, `get_recommendations`

All tools are **pre-bound to (property_id, unit_id)** — the LLM cannot query other tenants' data.

### Leak Detection (4 Signals)
| Signal | What it detects | Example finding |
|--------|----------------|-----------------|
| A — β_hdd z-score | Poor insulation | Room 5: z=2.12, Room 6: z=2.19 |
| B — Residual spikes | Unexplained consumption | 2020-12-07: +37.36 kWh residual |
| C — Room share drift | Room usage anomaly | Share changed vs historical norm |
| D — Sensor flatline | Stuck/dead meter | Identical readings or zero in cold |

---

## Next Steps

> [!TIP]
> To enable the LLM features, set `GEMINI_API_KEY` in your environment and restart the server:
> ```
> set GEMINI_API_KEY=your-key-here
> uvicorn techem.serve.api:app --reload
> ```
> Then test: `POST /chat/1/1 {"message": "Why did I use more heat this week?"}`
