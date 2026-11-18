# Science Quest — Question Import Format

Import from **Teacher Panel → Question Bank → Import CSV / JSON**. Every question is checked; problems are listed by question ID and nothing invalid is saved.

## JSON (supports every question type)

```json
{
  "schema": "science-quest/v1",
  "name": "Year 9 — Class B",
  "description": "optional",
  "questions": [ { ...question... } ],
  "presets": {
    "default24": {
      "name": "24 challenges",
      "rounds": [ { "title": "Round 1: Biology Lab", "lab": "biology", "subtitle": "Carbon cycle", "questionIds": ["B01", "B02"] } ]
    }
  }
}
```

A bare array of questions is also accepted.

### Fields for every question

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique within the bank (e.g. `B01`). The characters `. # $ [ ] /` are replaced. |
| `type` | yes | `mcq`, `truefalse`, `fill`, `numeric`, `matching`, `dragdrop`, `atom`, `density` |
| `lab` | yes | `biology`, `physics` or `chemistry` |
| `topic` | – | e.g. `Carbon cycle` (used for filtering and reports) |
| `difficulty` | – | `easy`, `medium` (default) or `hard` (shown as “challenging”) |
| `prompt` | yes* | Question text on the projector (*for `fill` it is the heading) |
| `explanation` | – | Shown with the correction |
| `timeLimit` | – | Seconds. Defaults: MCQ 30, T/F 20, fill 60, numeric 60, matching 60, drag & drop 90, atom 60 |
| `points` | – | Maximum points. Defaults: 100 (MCQ, T/F, numeric), 300 (fill, matching, atom), 400 (drag & drop) |
| `speedBonus` | – | Extra points for fast correct answers (single-answer types only; default 30) |
| `image` | – | Web address of a picture for the projector |
| `diagram` | – | Built-in diagram, see below |
| `adapted` | – | Simpler version for selected students, see below |

### Type-specific fields

- **mcq**: `options`: 2–6 strings; `answer`: letter `"C"` or index `2`.
- **truefalse**: `answer`: `true` / `false` (A = True, B = False on phones).
- **fill**: `text`: sentences with each blank written as `___`, one sentence per line (`\n`). `blanks`: one entry per blank, in order: `{ "accepted": ["decomposers", "bacteria and fungi"], "rejected": ["producers"] }`. Capitals, extra spaces and `³` vs `3` are ignored. Close misspellings are never accepted automatically; the teacher reviews them.
- **numeric**: `answer` (number, may be negative or decimal), `tolerance`, `toleranceType` (`absolute` or `percent`), `unit` (shown on the projector).
- **matching**: `pairs`: `[{ "left": "Mass", "right": "Amount of matter" }, ...]` (2–8 pairs).
- **dragdrop**: `diagram` (required), `zones`: `[{ "id": "z1", "x": 15, "y": 25, "w": 24, "h": 11, "answer": "Photosynthesis", "label": "1" }]`. `x/y` give the top-left corner and `w/h` the size, all as **% of the diagram** (0–100). Optional `distractors`: extra wrong labels.
- **atom**: `element`, `symbol`, `atomicNumber` (1–20), `shells` (e.g. `[2, 8, 1]`; must add up to the atomic number), `maxShells` (default 4).
- **density**: `object`, `mass` (g), `waterBefore`, `waterAfter` (mL), `tolerance` (g/cm³). Correct answer = mass ÷ (after − before).

### Diagrams

| `diagram` | Use |
|---|---|
| `{ "kind": "carbon-cycle" }` | Built-in scientifically accurate carbon cycle (air, plant, rabbit, dead material, decomposers) |
| `{ "kind": "sequence" }` | Row of boxes joined by arrows, for ordering tasks |
| `{ "kind": "balance-cylinder", "mass": 120, "volume": 40, "object": "rock" }` | Balance + measuring cylinder (`object`: `rock` or `block`) |
| `{ "kind": "image", "src": "https://…", "aspect": 1.78 }` | Your own picture (aspect = width ÷ height) |

### Adapted version

```json
"adapted": { "type": "mcq", "prompt": "Which process takes in CO₂?", "options": ["Respiration", "Photosynthesis", "Feeding", "Decomposition"], "answer": 1 }
```

`type` is `mcq` or `truefalse` (`answer` 0 = True, 1 = False). Tick “Adapted” next to a student in the lobby. That student sees this version on their phone, with its text, in the same room.

## CSV (one question per row)

Header row, using the columns you need:

`id,type,lab,topic,difficulty,prompt,optionA,optionB,optionC,optionD,answer,text,accepted,rejected,unit,tolerance,toleranceType,pairs,atomicNumber,element,symbol,shells,object,mass,waterBefore,waterAfter,diagram,zones,distractors,adapted,image,explanation,timeLimit,points,speedBonus`

- `answer`: letter for MCQ, `true`/`false` for T/F, a number for numeric.
- `accepted`: blanks separated by `|`, alternatives within a blank separated by `;`. For example, `carbon|respiration;aerobic respiration|decomposers`.
- `pairs`: `Mass=Amount of matter|Volume=Space occupied`
- `shells`: `2,8,1`
- `diagram`, `zones`, `adapted`: the same JSON as above, inside the cell.

**Export JSON** / **Export CSV** in the Question Bank produce exactly this format, so an export can always be re-imported.
