# Rubric — newsletter-digest

Structural checks a **passing** digest must satisfy when run against
`tests/agents/fixtures/newsletter-digest.json`. These are not an exact-string
match — the model's wording will vary. A passing output satisfies every MUST
below; the SHOULD items describe a great (vs. merely acceptable) digest.

## Pass/fail (MUST)

1. **Theme line.** Output begins with exactly one sentence summarizing the day's
   theme, before any section heading.
2. **Section count.** Between 3 and 6 named sections. With this 3-memory fixture,
   the natural sections are roughly "AI", "Markets", and "Tooling" — but any
   grouping is acceptable **as long as every section maps to content actually in
   the input.** No invented sections.
3. **Bullet count.** Each section has between 2 and 6 bullets. (With only one item
   per topic in this fixture, sections may legitimately fold related facts into 2+
   bullets; a single-bullet section is a soft fail — see SHOULD.)
4. **Source attribution.** Every bullet names its source publication —
   "Stratechery", "The Daily Upside", or "Console". A bullet with no named source
   fails.
5. **Worth reading in full.** A "Worth reading in full" list is present with 1–3
   items, and every listed item corresponds to content that has an actual link in
   the input. In this fixture only Stratechery and Console carry links; a
   "worth reading" entry pointing at the link-less Daily Upside item fails.
6. **No hedging.** None of these tokens appear anywhere: "it seems", "may",
   "could", "might", "possibly".
7. **No junk.** No sponsor/ad content (the "Acme Vector DB" line), no "in this
   issue" table-of-contents, and no housekeeping/mailbag content survives into a
   bullet.
8. **No false consensus.** A claim present in only one newsletter is not presented
   as agreed-upon across sources. (The Nvidia/in-house-silicon thread appears in
   both Daily Upside and, thematically, Stratechery — corroboration here is fine,
   but inventing agreement is not.)
9. **Valid Markdown.** Parses as Markdown: headings for sections, bullet lists,
   no unclosed code fences.

## Empty / near-empty case

10. If the fixture is swapped for one with fewer memories than `minMemories` (2),
    the output is exactly `(no newsletters in the last 24 hours)` and nothing else.

## Quality signals (SHOULD — great vs. acceptable)

- Bullets carry concrete, checkable facts (numbers, dates, named models/products)
  rather than vague summaries — e.g. "May CPI 3.4% YoY, 10-year yield 4.62%"
  beats "markets reacted to inflation data".
- The cross-cutting on-device-inference / in-house-silicon thread (Stratechery +
  Daily Upside's Nvidia note) is recognized rather than siloed.
- "Worth reading in full" picks the item with the most original analysis
  (Stratechery) over a routine release note.
- No section contains only a single thin bullet where two were available in the
  source.
