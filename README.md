# AMC Compass — Clinical Review Portal

The portal doctors use to build the question bank. It is a standalone React SPA
that talks to the existing AMC Compass FastAPI backend; it is deliberately a
separate app from the student site so it can be deployed, restricted and handed
to reviewers on its own.

Doctors can:

- **Write** questions by hand, one at a time.
- **Import** a CSV or JSON file, previewing and deselecting rows before anything is saved.
- **Generate with AI** — describe what is wanted, attach reference images, and get a batch of drafts.
- **Review** everything in one queue: read, edit, approve or reject.
- **Configure** the portal at runtime (admins only) — models, batch sizes, review rules, quality thresholds, import limits.

Nothing reaches students until the configured number of doctors approve it.

## Running it

```bash
cp .env.example .env     # set VITE_API_URL if the API is not on http://localhost:8000
npm install
npm run dev              # http://127.0.0.1:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on 5173 (strict port) |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the build on 4173 |
| `npm run typecheck` | `tsc --noEmit` |

The backend must allow this origin. In development it already allows 5173 and
4173; for any other origin set `ADMIN_PORTAL_URL` in the backend `.env` (comma
separated for more than one).

## Who can sign in

Only accounts that are an **active clinician** or an **admin**. Clinician access
is granted by an admin through `POST /api/admin/clinicians`, which creates the
account if the email is new. Students signing in are refused with a message
explaining why — their token is never stored.

Admins additionally get write access to Settings.

## How it is put together

```
src/
  main.tsx            providers: theme, react-query, auth, router
  App.tsx             routes, and the auth gate that swaps in the login page
  lib/
    api.ts            fetch wrapper, bearer token, error flattening
    auth.tsx          sign-in, session restore, clinician check
    theme.tsx         light/dark, remembered per browser
    types.ts          mirrors the API responses, plus the label maps
  components/
    Layout.tsx        header, navigation, theme and sign-out
    QuestionForm.tsx  the question editor — shared by Write and Review
    DepartmentPicker  department → sub-department
    ui.tsx            buttons, fields, cards, badges, modal, check lists
  pages/              Login, Overview, Write, Import, Generate,
                      RequestDetail, ReviewQueue, ReviewOne, Settings
```

Every page reads from `/api/clinician/*`. The Settings page renders itself from
the schema the server returns, so a new setting added to
`backend/services/portal_settings.py` appears here with no frontend change.

## Notes for whoever picks this up next

- **The token lives in `sessionStorage`, not `localStorage`,** on purpose: this
  portal publishes content to students, so a token that dies with the tab is a
  smaller blast radius. Do not "fix" this by moving it.
- **Request images are behind the bearer token**, so `<img src>` cannot fetch
  them — `AttachmentThumb` pulls the bytes and uses an object URL.
- **Owner-only actions are hidden, not just disabled**: the API restricts
  changing a request to its creator or an admin, and the UI mirrors that.
- The API is the authority on every rule (approval counts, self-approval,
  blocking checks, limits). Client-side validation is there to save a round
  trip, never as the enforcement point.

## Verifying a change

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

Then browser-check the pages you touched in light and dark at desktop and 375px.
The backend side is covered by `backend/tests/smoke_clinician_portal.py`, which
drives the real app in-process with the model faked.
