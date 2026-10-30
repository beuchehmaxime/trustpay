# TrustPay

**AI dispute mediation for mobile-money escrow in Central Africa.**

Built for the Meta Global AI Developer Hackathon, 27 Oct - 4 Nov 2026.

---

## The problem

In Cameroon and the wider CEMAC region, peer-to-peer trade happens on WhatsApp
and Facebook Marketplace and settles over MTN Mobile Money and Orange Money.
Escrow fixes *where the money sits*. It does not fix what happens when a buyer
says the goods were wrong and the seller says they were fine.

That argument arrives in a shape nothing off the shelf handles:

- **It is spoken, not typed.** Voice notes are the dominant medium. A dispute is
  often four minutes of audio, not a paragraph.
- **It code-switches mid-sentence.** French, English and Cameroonian Pidgin, in
  one breath, sometimes in one clause.
- **The proof is photographic and contested.** "You sent me five, not ten."
  "That scratch was there already."

So mediation is manual, slow, and does not scale. Every disputed deal costs an
operator twenty minutes of listening, translating and squinting at photos, and
the parties wait days for money that is sitting still.

## What TrustPay does

TrustPay is a mediation pipeline that turns that mess into a structured,
reviewable case file - and then stops.

1. **Listen.** Voice notes and chat logs go in; a transcript comes out that
   preserves the code-switching rather than flattening it to one language.
2. **Look.** Delivery photos are segmented against the listing photos and the
   agreed terms: how many items, which one, what visible damage.
3. **Reason.** The transcript, the terms, the timeline and the visual findings
   are assembled into a recommendation with a confidence score, a rationale in
   both parties' languages, and a citation for every claim it makes.
4. **Hand over.** A human mediator approves, edits or rejects it.

### The rule that shapes the whole design

**No model outcome moves money. Ever.**

TrustPay produces a *recommendation*. A human with the `disputes.resolve`
permission approves it before a single franc moves. Low confidence, high value,
and any disagreement between the audio and the visual evidence all escalate
automatically rather than resolving quietly.

This is not a safety disclaimer bolted on at the end, and it is not scaffolding
built to impress judges. Bizik's mediator console has shipped that approval step
to real mediators since before this hackathon - evidence feed, mandatory
rationale, RBAC, and a recommendation panel carrying a
`source: 'model' | 'heuristic'` discriminator and an **AI** badge that has never
once been lit, because nothing has ever filled it.

TrustPay fills it. The pipeline has no write path to the ledger, and the demo
shows a mediator overruling the model in the console that was already running.

## What may be sent, and why that shaped the build

TrustPay reasons about disputes between Cameroonian traders. Two constraints
decide what can actually leave the country, and both are external:

**Meta's data commitments.** On Discounted Services - which is where $150 of
free hackathon credits puts you - *"Meta may use your Content, including
Inputs and Outputs, to train, develop, evaluate, and improve Meta's AI
models."* On Standard Services, *"Meta does not use your Content from Standard
Services to train Meta Models."* The billing dashboard says the same thing in
plainer words: while using free credits your content may be used for product
improvement.

**Cameroon's Law No. 2024/017 on personal data protection**, enforceable since
23 June 2026, restricts transferring personal data abroad without an adequacy
finding or prior authorisation. The supervisory authority it creates was not
yet operational at the time of writing, which is not a safe harbour - the
obligation exists whether or not anyone is currently administering it.

Taken together: **real dispute evidence is unsendable on this tier.** Not
inadvisable. Unsendable. So the corpus in this repository is synthetic, the
demo runs on it, and no real voice note, photo or chat log is sent to a model
API at any point.

That is a constraint, and it made the architecture better:

- the **PII scrubber** exists and is tested from the attacker's end, because
  redaction had to be load-bearing rather than tidy
- TrustPay receives **opaque party ids**, never names, numbers or KYC data
- there is **one outbound door** (`src/meta/client.ts`) that refuses to send
  anything still identifying, so the rule is enforced in one place rather than
  remembered in a dozen
- `/health` reports the tier, and the service says it on every boot

**The lawful production path is the open-weight one.** Running Muse Spark Open
on infrastructure we control means the evidence never crosses a border at all,
which answers both constraints at once rather than negotiating with either.
That is why the open-weight path is wired here, and it is a better reason than
the bonus prize.

## Meta models used

| Capability | Model | Why this one |
|---|---|---|
| Voice note transcription | **Muse Voice Transcribe** | The disputes are audio first. This is the step that makes the rest possible. |
| Code-switched reasoning, recommendation, bilingual rationale | **Muse Spark** | Multimodal and multilingual in one pass, so the transcript and the photo findings are reasoned over together rather than stitched. |
| Delivery-photo segmentation, counting, defect localisation | **SAM 3.1** | Turns "it looks wrong" into "4 items, not 10, and the segment at top-left has a tear". |
| Offline / self-hosted evaluation runs | **Muse Spark Open** | Lets the whole pipeline be re-run and scored without per-call cost. |

Model access is through the Meta Model API, behind a single adapter
(`src/meta/`) so the open-weight path and the hosted path are swappable.

---

## What is new, and what was already there

The hackathon rules require this to be unambiguous, so it gets its own section
rather than a footnote.

**TrustPay is a new, standalone, public repository** that builds on Bizik, a
live escrow platform. The hackathon rules allow exactly this - "Startups may
build on existing products or codebases, but you must clearly identify what was
newly developed during the Hackathon" - so what follows is that identification,
file by file.

### Reused from Bizik (pre-existing, NOT hackathon work)

**`bizik/` is pre-existing production software.** It is the live escrow
platform this is built on, vendored so judges can run the stack and see the new
work in its real setting rather than in a mock. None of it was written during
the hackathon.

**These files inside it were CHANGED during the hackathon**, and they are named
here rather than left to be discovered:

| File | The hackathon change |
|---|---|
| `backend/src/whatsapp/whatsapp-ai.ts` | The assistant's brain swapped from Anthropic/OpenAI to **Muse Spark**: `authToken` for Bearer auth, Meta's base host, and a raised token ceiling. |
| `backend/src/config/env.ts` | The model, base URL, key and token budget behind that swap. |
| `backend/src/index.ts` | Three lines mounting the new in-app assistant route. |
| `web/user/src/app/(app)/layout.tsx` | Mounts the assistant launcher on the app shell. |
| `web/user/src/lib/api/endpoints.ts` | The assistant's endpoint paths. |
| `web/user/src/lib/i18n/locales/{en,fr}.json` | The assistant's user-facing strings, EN and FR. |
| `docker-compose.yml` | Wiring the above into the stack. |

**These directories inside it are NEW**, written during the hackathon:

| Directory | What it is |
|---|---|
| `backend/src/assistant/` | The in-app agent: session, reasoning loop, service, HTTP surface, and the test suite that attacks the money rule. |
| `web/user/src/components/assistant/` | The chat panel, the approval card and the launcher. |
| `web/user/src/lib/api/assistant.api.ts` | The client for the above. |

Everything else under `bizik/` is untouched. The model swap is a base URL and an
auth header, not a rewrite - Meta's Messages API is Anthropic-compatible, so the
existing SDK, the `MessageParam` types, the `tool_use` blocks and the multi-hop
tool loop all keep working as they were.

What that includes: the escrow lifecycle, wallets and ledger, MTN MoMo and
Orange Money rails through Fapshi, KYC, AML screening, RBAC, the audit log,
the user PWA and the admin console, and the WhatsApp channel - the assistant,
the WaSender client, the admin inbox and outreach.

Three parts of it matter most to this project:

| What | Where | Why it matters here |
|---|---|---|
| **The mediator console** | `bizik/web/admin` - `/disputes/[id]` | Already ships the approval step: evidence feed, binding-ruling form with a mandatory rationale, RBAC on `disputes.resolve`, and a recommendation panel with a confidence bar. It carries a `suggestion.source === 'model' \| 'heuristic'` discriminator and an **AI** badge that has never once been lit, because nothing has ever filled it. |
| **The heuristic** | `bizik/backend/src/lib/dispute-ai.ts` | The reason-based lookup filling `AiRecommendation` today. Its own docstring says a real deployment would call a model. It is the benchmark baseline. |
| **The WhatsApp channel** | `bizik/backend/src/whatsapp*` | How disputes actually arrive here. Already handles the thread, the media and the service window. |

Excluded from this repository: the mobile app (not used for the competition),
and every credential - the stack runs on `PAYMENTS_MODE=simulated` with no real
payment keys, and no `.env` is tracked.

### Built during the hackathon (everything outside `bizik/`)

- **The in-app agent** (`bizik/backend/src/assistant/`, `bizik/web/user/src/components/assistant/`) -
  a chat panel inside the app where a user starts a deal, invites the other
  party, funds a milestone, sends money or opens a dispute by asking for it.
  It runs on **Muse Spark** and reuses the existing tool layer, which turned
  out to be channel-agnostic already: `ToolContext` is `{ userId, locale }` and
  nothing more. The money rule is the same one as everywhere else here, and it
  is structural rather than prompted - the agent can propose and the proposal
  carries an id, but execution is a separate authenticated call that needs the
  user's PIN. `assistant.service.test.ts` is written to break that separation
  rather than to confirm it: approving an id that was never proposed, approving
  twice, approving without a PIN, approving after the conversation moved on
- `src/` - the mediation pipeline: Meta model adapters, the voice and visual
  evidence analysers, the agent that reasons over them, the escalation policy
  and the case-file format
- `src/middleware/pii-scrubber.ts` - strips phone numbers, national IDs and
  names before any payload leaves the process. Built first, on day one, so no
  real evidence ever reaches a model API unredacted
- The transcript, SAM overlay and citation panels **added to** the existing
  mediator console - the approval flow underneath them is Bizik's
- The synthetic CEMAC dispute corpus (FR / EN / Pidgin, voice and photo) and
  the evaluation harness scoring TrustPay against the existing heuristic
- `Dockerfile` and `docker-compose.yml` - TrustPay runs as its own container
  with no database handle and no payment credential, so "the model cannot move
  money" is enforced by the deployment, not promised in a README

The split is visible in the tree: everything under `bizik/` predates the
hackathon, everything else was written inside it.

---

## Running it

TrustPay runs standalone against the bundled demo corpus - no Bizik instance and
no production credentials needed.

```bash
cp .env.example .env            # add your Meta Model API key
docker compose up -d --build
```

| | |
|---|---|
| User PWA | http://localhost:3000 |
| **Mediator console** | **http://localhost:3001** - where the demo lives |
| Bizik API | http://localhost:4000 |
| TrustPay API | http://localhost:4100 |

The stack boots with `PAYMENTS_MODE=simulated` and no payment credentials. It
cannot move real money, and it is not meant to.

### How the pieces fit

Evidence arrives as WhatsApp voice notes, chat text and delivery photos.
**Muse Voice Transcribe** turns the audio into a transcript that keeps its
code-switching and its timestamps. **SAM 3.1** turns the photos into countable
facts - how many items, which listing region has no match, where the damage is.
**Muse Spark** reasons over the transcript, the agreed terms, the timeline and
the visual findings together, and returns a ruling, a split, a confidence and a
rationale in both languages where every factual claim cites the timestamp or
segment it rests on. An uncited claim is a bug.

Then it stops. The escalation policy sends a case to a human instead of showing
a recommendation whenever confidence is low, the amount is large, the audio and
the photos disagree, or anything inside the pipeline fails. Escalation is the
default on error, because a model mistake should cost an operator twenty
minutes rather than cost a user their money.

The boundary with Bizik is narrow by construction. TrustPay receives only what
a mediator would see, by opaque party id - no phone numbers, no KYC documents,
no wallet balances. It returns a recommendation that writes one suggestion row.
It holds no database handle and no payment credential, and the compose file is
what makes that true rather than a promise.

## Licence

MIT. The demo corpus is synthetic: no real user data, no real disputes, no real
phone numbers.
