# Empirical Experiments Analysis Summary

* Generated at: 7/29/2026, 11:15:53 PM
* Total Runs: 60 (Success: 60, Failed: 0)

## Acoustic Duration Comparisons by Condition

| Condition | Successful Clips | Average Clip Duration (s) | Key Observations |
|---|---|---|---|
| **Baseline (Plain Text)** | 15 | 16.26s | Rushed, reads like modern prose, flat 1:1 syllable length, Visargas neglected |
| **Format A (Plain Instructions)** | 15 | 23.99s | Slower, respects general poetic templates but occasionally pauses inside compound bounds |
| **Format B (Inline Markup)** | 15 | 27.49s | Extremely choppy; model frequently mispronounces or reads inline bracket characters literally |
| **Format C (Combined Hybrid)** | 15 | 21.96s | **Optimal outcome.** Highly steady, monotone chant, respects 2:1 durations and protects compound bounds with hyphens |
