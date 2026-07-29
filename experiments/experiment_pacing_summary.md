# Empirical Experiments Analysis Summary

* Generated at: 7/29/2026, 11:07:28 PM
* Total Runs: 60 (Success: 52, Failed: 8)

## Acoustic Duration Comparisons by Condition

| Condition | Successful Clips | Average Clip Duration (s) | Key Observations |
|---|---|---|---|
| **Baseline (Plain Text)** | 15 | 16.26s | Rushed, reads like modern prose, flat 1:1 syllable length, Visargas neglected |
| **Format A (Plain Instructions)** | 14 | 24.61s | Slower, respects general poetic templates but occasionally pauses inside compound bounds |
| **Format B (Inline Markup)** | 10 | 28.12s | Extremely choppy; model frequently mispronounces or reads inline bracket characters literally |
| **Format C (Combined Hybrid)** | 13 | 20.93s | **Optimal outcome.** Highly steady, monotone chant, respects 2:1 durations and protects compound bounds with hyphens |
