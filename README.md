# SCIENCE QUEST — THE THREE LABS

A real-time multiplayer Year 9 Science revision game for Biology, Physics and Chemistry.
**Created by Mrs Sarra Ben Amara.**

- **Teacher Panel** (laptop): log in, create a room, manage question banks, start, pause, close, reveal and advance, then export reports.
- **Projector** (classroom screen, 16:9, full screen): questions, diagrams, timer, submission progress, corrections, leaderboards and the final podium.
- **Student phones**: room code + name (no account), then A–D pads, typed blanks, drag-and-drop, matching, Build an Atom, numerical answers and the virtual density lab.

---

## 1. How it works (and why it is secure on the free Firebase plan)

There is no paid server. **The teacher's browser is the game's referee**:

| Data | Who can read | Who can write |
|---|---|---|
| `teachers/{uid}/banks` — question banks **with answer keys** | that teacher only | that teacher only |
| `rooms/{code}/hostPrivate` — prepared questions + answer keys, timing, review decisions | host teacher only | host teacher only |
| `rooms/{code}/state, question, teams, scores, reveal, plan, settings` — public game data | signed-in players | host teacher only |
| `rooms/{code}/players/{uid}` | players | the student **once** (name only; no team, no score), then the host |
| `rooms/{code}/submissions/{q}/{uid}` | that student + host | that student, **once**, **only while that question is open**, with a server timestamp |
| `rooms/{code}/results/{q}/{uid}` | that student + host | host only |

All of this is enforced by `database.rules.json`, not by the app. Students never receive an answer key before the correction, because the public question (`toPublicQuestion`) contains no answers. The phone shows only A–D, never the option text. When submissions close (everyone answered, the teacher pressed **Close**, or the optional timeout), the rules reject any late write. The teacher's laptop then grades, and publishes the correction, results and scores in **one atomic update**. Scores are always recomputed from all results, so a double reveal cannot double-count points.

**Keep the Teacher Panel open during the game.** It grades the answers.

### Game states
`LOBBY → TEAM_ASSIGNMENT → ROUND_INTRO → QUESTION_OPEN → SUBMISSIONS_CLOSED → CORRECTION_REVEALED → LEADERBOARD → … → ROUND_COMPLETE → … → GAME_COMPLETE` (with `PAUSED` at any point). Illegal transitions are refused (`src/lib/game.ts`).

### Scoring
- MCQ / True-False / Numerical: 100 points for a correct answer, plus a speed bonus of up to 30 that falls linearly to 0 at the time limit. Paused time is excluded and server timestamps are used.
- Fill in the blanks, matching, drag & drop, Build an Atom: partial credit for each correct part (defaults 300 / 300 / 400 / 300).
- Each question's points and time can be edited. Team score = sum of its members' scores.
- Ties are broken by points, then correct answers, then faster total response time, then earlier join.

---

## 2. Connect Firebase (one time, about 15 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** → name it (e.g. `science-quest`). Google Analytics is not needed. The free **Spark** plan is enough.
2. **Build → Authentication → Get started**:
   - Enable **Email/Password** and **Anonymous**.
   - **Users → Add user**: your email and a strong password. This is your Teacher Panel login.
   - **Settings → Authorized domains → Add domain**: `YOUR-GITHUB-NAME.github.io`.
3. **Build → Realtime Database → Create database** (choose the region closest to you, e.g. `europe-west1`) → start in **locked mode**.
4. **Rules** tab: delete everything, paste the whole content of `database.rules.json`, then **Publish**.
5. **Teacher allow-list** (only accounts on this list can use the Teacher Panel): the first time you sign in to the Teacher Panel, it shows your account ID (UID) with a Copy button and these steps. In **Realtime Database → Data**, add a key `teacherAllowlist`, and under it a child whose key is your UID and whose value is `true`. Add colleagues the same way.
6. **Project settings (⚙) → General → Your apps → Web (`</>`)** → register an app (no hosting). Copy the values from `firebaseConfig`.

The Firebase *web* config (apiKey, etc.) identifies your project; it is not a password. It ends up in the website's JavaScript as with every Firebase site. Security comes from the rules in step 4. It is kept out of the source code and supplied through environment variables / GitHub secrets.

## 3. Put it online with GitHub Pages

1. Create a GitHub repository (e.g. `science-quest`) and upload this project. **Do not upload the `question-banks/` folder.** It contains the answer keys, and `.gitignore` already excludes it. You import those files from your own computer in the Teacher Panel.
2. Repository → **Settings → Secrets and variables → Actions → New repository secret**. Add these five secrets, with values from step 2.6:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`
   (the database URL looks like `https://science-quest-default-rtdb.europe-west1.firebasedatabase.app`).
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push to `main` (or **Actions → Test and deploy → Run workflow**). The workflow runs all tests, including the security rules on the official Firebase emulator, then publishes the site:
   `https://YOUR-GITHUB-NAME.github.io/science-quest/`

## 4. Run a lesson

1. Open the site → **TEACHER PANEL** → sign in.
2. **Question Bank → Import CSV / JSON** → choose `question-banks/science-quest-50.json` (do this once; it is saved in Firebase). A game room with the default 24-question game is created automatically.
3. **Open projector** → move that window to the classroom screen → press ⛶ for full screen.
4. Students scan the QR code or open the site → **PLAY** → enter the room code and their name.
5. **Start Game** (random balanced teams) → **Begin Round 1** → for each question the correction appears when everyone has answered. Use **Close submissions** / **Reveal correction** if someone is absent. Only you can press **Next**.
6. After the podium, go to **Export Results → Download CSV**.

Game Settings let you change the number of teams (2–5), team names, rankings frequency, time limits, option shuffling, automatic reveal/timeout, late joining, and exactly which questions go into which round (ready-made games, a quick builder by lab, difficulty and type, or a manual round builder).

## 5. Develop and test on your own computer

```bash
npm install
npm test                 # game logic, scoring, import/export, security-rule tests
npm run test:rules       # security rules on the official Firebase emulator (needs Java 17+)
```

**Offline mode**: the whole game runs on a laptop without Firebase, and the same rules are enforced by a small local server:

```bash
npm run local-server     # terminal 1  (teacher login: teacher@sciencequest.local / science123)
npm run dev:local        # terminal 2  → http://localhost:5173  (phones on the same Wi-Fi: http://<laptop-ip>:5173)
SQ_ALLOW_DUMP=1 npm run local-server && npm run e2e   # full automated multiplayer test (needs Chrome)
```

With Firebase: copy `.env.example` to `.env.local`, fill in the values, then `npm run dev`.

## 6. Project layout

```
src/lib/          types, grading, game state machine, teams, leaderboards, import/export, report (pure, unit-tested)
src/game/         host engine (teacher = referee), player join/submit, question-bank storage
src/backend/      Firebase adapter + offline adapter (same interface)
src/components/   brand (logo, Mrs Sarra), neon UI kit, diagrams, every question component
src/screens/      Landing, Student phone, Projector, Teacher Panel (lobby, live control, bank manager, editor, settings, results)
database.rules.json   security rules     devserver/   offline server + rules evaluator
tests/            unit tests, rules tests (local + emulator), end-to-end multiplayer test
docs/IMPORT_SCHEMA.md  JSON / CSV import format for all question types
question-banks/   science-quest-50.json (your 50 questions) + science-quest-extras.json — keep private
```
