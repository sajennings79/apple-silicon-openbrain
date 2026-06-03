# Agent prompt evals

Recorded fixtures and rubrics for evaluating the prompts in `agents/prompts/`
**without live services**. The goal is to iterate on prompt quality offline —
no openbrain REST API, and (optionally) no mlx-lm server.

## Layout

```
tests/agents/
  fixtures/<agent>.json        recorded input: memories that mock fetchMemories(),
                               plus an optional llmResponse that mocks callLLM()
  rubrics/<agent>.rubric.md     structural checks a passing output must satisfy
```

## Fixture shape

```jsonc
{
  "search": { ... },              // echoes the prompt frontmatter, for reference
  "memories": [ /* Memory[] */ ], // mocks fetchMemories() — matches the Memory
                                  //   interface in agents/run-agent.ts
  "llmResponse": "..."            // optional: mocks callLLM() for fully offline replay
}
```

Each entry in `memories` must match the `Memory` interface in
`agents/run-agent.ts` (`id`, `content`, `summary`, `source`, `memoryType`,
`tags`, `effectiveDate`).

## Running evals (planned — harness not yet built)

The runner does not yet read fixtures. The intended interface, once
`agents/run-agent.ts` grows a `--fixtures` flag (see the plan / prompt-system
notes), is:

```bash
# Offline against frozen input. With llmResponse present in the fixture, no
# services at all are needed. Without it, only mlx-lm (port 8000) is needed —
# openbrain is still bypassed — so this evaluates the *current prompt* against
# fixed input.
bun run agents/run-agent.ts agents/prompts/newsletter-digest.md \
  --fixtures tests/agents/fixtures/newsletter-digest.json
```

The output is then checked by hand (or, later, by a small scorer) against the
matching `rubrics/<agent>.rubric.md`. Rubrics are **structural**, not
exact-string: they describe what a passing output must contain, so they survive
the model rewording things between runs.

## Adding a fixture

1. Capture or hand-write 3–5 representative memories into
   `fixtures/<agent>.json`, covering the cases the prompt must handle (and at
   least one piece of content the prompt is supposed to *drop*).
2. Write the structural checks into `rubrics/<agent>.rubric.md`.
3. Run the prompt against the fixture and confirm the output satisfies every
   MUST in the rubric.
