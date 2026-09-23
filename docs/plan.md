# Plan

Written at 13:00 by the lead, from the task's ТЗ. Changed only by the lead; anyone may add to
**Requests**. Every agent reads this before starting work and again after every pull. The rules
for writing it are in `AGENTS.md`, under **Every plan is split into lanes**.

---

## Task

*(Which task, and the one line of the ТЗ that the evaluation turns on.)*

## Scenario

*(One sentence: who types what, and what they get back. The demo shows exactly this.)*

## Contract — frozen at 13:30

Schema: `src/server/<domain>/model/<domain>.schema.ts`

| Tool | Arguments | Returns | Writes data? | Owner |
| --- | --- | --- | --- | --- |
| | | | | |

| Repo function | Signature | Owner |
| --- | --- | --- |
| | | |

## Lanes

### Ораз — contract, interface, README

- **Paths:** the schema file, `src/views/**`, `src/app/page.tsx`, `README.md`, this file
- **Tasks, in order:**
  - [ ]
- **Depends on:**
- **Stubs while waiting:**
- **Done when:**

### Бекжан — tools, prompt, agent loop

- **Paths:** `src/server/<domain>/usecase/**`, `src/app/api/**`
- **Tasks, in order:**
  - [ ]
- **Depends on:**
- **Stubs while waiting:**
- **Done when:**

### Саян — data, repo, algorithm

- **Paths:** `src/server/<domain>/data/**`, `src/server/<domain>/repo/**`
- **Tasks, in order:**
  - [ ]
- **Depends on:**
- **Stubs while waiting:**
- **Done when:**

## Integration points

| What meets what | In which file | By |
| --- | --- | --- |
| | | |

## Hourly checkpoints

What each lane commits by each hour (§5.4.8).

| By | Ораз | Бекжан | Саян |
| --- | --- | --- | --- |
| 14:00 | | | |
| 15:00 | | | |
| 16:00 | | | |
| 17:00 | README frozen | | |
| 18:00 | Demo rehearsed | | |

## Requests

A change someone needs in a path they do not own. Newest last.

- *(14:10 — Саян → Бекжан: …, in `…`)*
