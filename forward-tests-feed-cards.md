# tinycloud-feed forward test: cards, answers, comments and replies

The coordinator gives each **fresh agent only the built `/feed` guide** (`_site/feed` from this branch) and an already-connected feed token. The agent has to post every card type, then handle the owner's answers, comments, followups and requests from the guide alone. A scripted owner answers on the feed. A grader checks the stored rows, and the feed lab renders them.

## Preconditions

- **Test identity:** a dedicated local-key owner (`tinycloud auth login --method local`, posture `local-owner-key`) in a private home folder. Never Sam's account or a shared QA passkey account. The owner self-grants the feed capabilities with `auth request --grant --yes`, the local-key equivalent of guide step 3b.
- **CLI:** `@tinycloud/cli@1.6.5` installed in that home. Agents get it as `TC_BIN`, a wrapper that sets `HOME` to that folder.
- **Per agent:** the coordinator runs guide §3c and §4 (`feed connect`, `auth import`) for token `<round>-<letter>`. The agent gets `<TOKEN>`, `<LABEL>` and the profile `feed-<TOKEN>`, in an empty working folder with no project instructions.
- **Model:** OMP with `anthropic/claude-sonnet-5-5`, full access, labelled `rocinante.team=Holden`.

## Sequence

1. **Post** (prompt: "post a decision, an update, and a page with an image and three questions: single choice, multiple choice, written"). Grader, per card:
   - `kind`, `needsResponse` and `choices` match the type.
   - `payload.summary` is 1–160 characters and not the title.
   - `payload.agent` has `kind`, `model`, `runsOn` and `job`, each a string of at most 80 characters.
   - `payload.render` is `post`, and there are no unknown payload keys.
   - `createdAt` is the real publish time.
   - Page: `page.image` is https, `imageAlt` is set, there are 1–5 questions with a unique `id`, `header` and `question`, at least one `multi` and one note-only question, option labels are unique, and at most one option is `recommended`.
2. **Owner, first visit:**
   - answers the decision;
   - answers the page's first question only, with a note;
   - comments on the decision ("what would the other option cost?");
   - comments on the update ("when will you next check?").
   
   Prompt: "The owner has been active on your feed. Check it and handle everything as the guide says." Grader:
   - Every response is acknowledged before any outcome, on the response's own `cardId`/`revision`/`issuanceId`.
   - Each answer has exactly one outcome with `detail.message`.
   - A comment has no outcome and exactly one reply whose `replyTo` is its `responseId`.
   - Every later revision passes tinychat's `isReplyOnlyRevision`.
3. **Owner, a day later:**
   - sends a `followup` that answers every page question (`supersedesResponseId` set);
   - comments on the decision: "please go ahead with what I picked, and post an update here when it's done."
   
   Same prompt and checks as step 2. In addition, a new `update` card is posted.
4. **Render:** export the token's rows (cards, every revision, responses, handling) and load them into the feed lab's lab-only JSON loader. Check each card in the compact and full views.

## Results

| Round | Guide | Agents | Post | First visit | Day later |
| --- | --- | --- | --- | --- | --- |
| 1 | source `creating-a-post.md` (unrendered `{{std:errors}}`, one-line JSON examples) | r1-a, r1-b, r1-c | 35/35 each | 22/22 each | r1-a 17/17, r1-c 17/17; r1-b acknowledged its followup after recording the outcome: its hand-written handling helper failed and it retried |
| 2 | built `_site/feed`: pretty JSON, handling and reply blocks, real `createdAt`, page-answer note format | r2-a, r2-b, r2-c | 38/38 each | 28/28, 28/28, 30/30 | r2-b 22/22, r2-c 24/24; r2-a 20/21: the owner had picked "wait", so "go ahead" was a no-op and it posted no update (a test-design issue: the scripted owner now picks the first choice) |
| 3 | + `urgency` scale, `runsOn` from the machine, `failed` when the agent can't do the work, comments that ask for work | r3-a, r3-b, r3-c | 38/38 each | 29/29, 28/28, 28/28 | 23/23, 21/21, 22/22 |
| 4 (confirmation, final text) | + where the label comes from | r4-a | 38/38 | 28/28 | 20/21: no update card because it couldn't place the order. This is the guide's rule ("if you can't do it, say so and post no card"), not a defect. |
| 5 (guide 0.4.0: watcher, brief, priority, deadline/expiry, Ask me later; CLI from js-sdk#936) | v2 sequence below | r5-a, r5-b, r5-c | 54/54, 54/54, 55/55 | 30/30 each | r5-b 25/25, r5-c 25/25; r5-a 24/25 on the old check: it couldn't book the venue, said so and posted no card, as the guide says. The check now accepts that. |
| 6 (+ the 5 s undo window: every line the watcher prints is final) | v2 sequence | r6-a, r6-b | 55/55 each | 30/30 each | 25/25 each: **both passed first try** |
| 7 (+ card actions Drop and Acknowledge; four cards with two decisions) | v2 sequence with Drop and Acknowledge | r7-a, r7-b | 68/68; r7-b 65/68: `urgency` 3 with priority 3, and no brief on the page | 38/38 each | 32/32 each |
| 8 (urgency spelled out as a table: 0→5 … 5→0; a brief required on decisions, optional on pages) | same | r8-a, r8-b | r8-b 65/65; r8-a 63/65: `urgency` 3 with priority 3 again. The publish block now sets `urgency` itself. | 38/38 each | 32/32 each |

### Watcher rounds (5 and later)

The agent gets the built guide and the CLI built from js-sdk#936 (`TC_BIN=/var/tmp/qa-testfeed-9GH1/bin/tinycloud-next`). The prompt sets a scene (a team offsite, with venue holds that lapse in two days), asks for a decision, an update and a three-question page, then: "wait for me on the feed and handle what I send, as the guide says. Stay on the feed until I tell you to stop."

After posting, the agent starts `feed watch --once` in the background and ends its turn. **Nobody prompts it again.** The scripted owner (`harness/owner2.mjs`) holds each send for 5 seconds, Home's undo window (Sam, 23:35Z), then stores it:

1. **phase2:** answers the decision, comments on it, taps "Ask me later" on the page (a `feed.snooze` message), and comments on the update. From round 7, it also taps "Drop this card" on a second decision (`feed.drop`).
2. **phase3:** answers the page's first question. From round 7, it also taps "Acknowledge" on the update (`feed.acknowledge`).
3. **phase3b, 40 s later:** sends a `followup` answering every question, and asks on the decision for the go-ahead and an update card.

The grader (`harness/grade2.mjs`) checks the round 1–4 rules, plus:
- **Every card:** `priority` is a whole number from 0 to 5, and `urgency = 5 − priority`. Updates are 4 or 5.
- **Decision and page:** each has a `brief` with `title` and `markdown` holding the five sections, under 600 words. The decision has `expiresAt`. Any `deadline` or `expiresAt` is a UTC time after `createdAt`.
- **Card actions** (Ask me later, Drop, Acknowledge): each is acknowledged, with no reply and no outcome. After a Drop or an Acknowledge, the card gets no more replies, and a dropped question isn't asked again in a new card.
- **Every response:** acknowledged within 120 s of being stored, with no prompt.

**Watcher timing:** "Received" (the agent's `acknowledged`) came 8–15 s after an answer was stored, in rounds 5 and 6. Responses stored back to back came 15–36 s after storage, because the agent handles them in order. Add Home's 5 s undo window, plus the time to save, to get the time from the owner's tap: 20–46 s in round 6. So "Not confirmed" at 30 s (the lab's `UNCONFIRMED_AFTER_MS`) is too tight for a burst; 60 s fits.

**Watcher defect found in round 5, fixed in js-sdk#936:** an idle `feed watch` exited with status 0 after about 60 s. The released 1.6.5 does this too, with `--runner`. The node closes an idle hooks stream after about 60 s. The hooks service then waits out its reconnect backoff on unref'd timers, so nothing holds Node's event loop and the process ends. The agents read the empty exit as the guide's "it stops without printing a line" and restarted the watcher each time. Nothing was missed, because the ledger delivers on restart. The CLI now holds the event loop for as long as the watch runs.

Every agent chose priority 2–3 for the decision and 4 for the update, and left the ledger, `--recipient` and restarts to the watcher.

### Weaker models (Sam, 11-13 ~00:10Z)

Same sequence, one fresh agent each on Claude Haiku 5.5 (`anthropic/claude-haiku-5-5`), GPT-6 Luna (`openai-codex/gpt-6-luna`), GPT-6.1 Terra (`openai-codex/gpt-6.1-terra`) and Claude Sonnet 5.5 (`anthropic/claude-sonnet-5-5`), all on OMP. Each must, from the guide alone: post a decision (×2), an update and a page with priority, a brief and dates; run the watcher; acknowledge everything; answer, reply to the right comment, and post updates; handle Drop, Acknowledge and Ask me later.

| Round | Guide change before it | Haiku | Luna | Terra | Sonnet |
| --- | --- | --- | --- | --- | --- |
| W1 | publish block sets `urgency` | 64/64, 39/40, 33/34: before any owner action it **edited its update card** (new title and body) once its decisions were posted | 65/65, 36/38, 32/32: **mistyped the comment's UUID** in `replyTo` when copying it into the reply block, so the reply hangs off nothing. Slow: the 5th item of a burst was acknowledged after 140 s. | 62/63, 38/38, 32/32: **no `expiresAt` or `deadline`** though the holds lapse in two days (dates were in an "optional" list) | 65/65, 38/38, 32/32 |

Fixes after W1, all in the guide:
- **Haiku:** "Publish a card once. The only later revision you ever publish is one that adds a reply."
- **Luna:** the reply block now takes the comment's `sequence` and copies `responseId` and `cardId` from `responses.jsonl`, like the handling block. No agent copies a UUID by hand any more.
- **Terra:** the dates moved out of the optional list into a rule: "Whenever what you know has a date … set `expiresAt` … and `deadline`." A one-line checklist before publishing names priority, summary, agent, the brief and dates.
- **Test prompt, not the guide:** W1 Haiku stopped to ask for venue names. The W2 prompt says there are none and to use placeholders.

| Round | Guide change before it | Haiku | Luna | Terra | Sonnet |
| --- | --- | --- | --- | --- | --- |
| W2 | the W1 fixes above | 67/67, 38/38, 32/32 (it declined the go-ahead, saying it can't book and won't post an update; the check now reads that phrasing) | 68/68, then **0 responses handled**: it ran the watcher in a separate Paseo terminal, which never woke it | 65/65, 38/38, 32/32: dates set this time | 65/65, 38/38, 32/32 |

Fix after W2: "Start it with your own shell or command tool, as a background command whose end your tool reports back to you … A separate terminal, a pane you have to look at, `&`, `nohup` or `screen` runs it but never wakes you." In W1, Luna had used a background job and been woken.

| Round | Guide change before it | Haiku | Luna | Terra | Sonnet |
| --- | --- | --- | --- | --- | --- |
| W3 (final text) | the W2 fix | 65/65, 38/38, 32/32 | 65/65, 36/36, 32/32 | 65/65, 38/38, 32/32 | 65/65, 38/38, 32/32 |

**W3: all four passed first try** on the final text, with no prompt after the first. On the go-ahead, Haiku couldn't place the order: it said why and posted no card, as the guide says. Luna is slow but complete: in a burst, "Received" came 86–99 s after storage, and one reply landed 27 s after the 120 s check. Every other model acknowledged within 8–60 s.

Round 1 also found:
- **`createdAt`:** every agent made up `createdAt` values, including future ones.
- **Long lines:** read tools cut long single-line JSON examples.
- **Reminders:** agents promised check-ins they can't keep.
- **Images:** agents spent turns checking whether the image URLs load.

Round 2 fixed all of these.

Rounds 2–3 left these guesses, and the guide now answers each:
- `runsOn`: agents copied the example;
- `urgency`;
- what outcome to record when the agent can't do the work;
- what to do with a comment that asks for work;
- where `<LABEL>` goes.

Still guessed, and harmless:
- `agent.kind` (OMP agents call themselves `claude-code`);
- whether a small result is "worth" an update card.

Not covered by the guide's own text: lines 11 and 53 are each longer than 800 characters (the CLI rule and §3b, unchanged here), and agents' read tools cut them.

**Lab render** (build 3dec7ee/1f17120, every round 1–3 row loaded via Load JSON):
- Working: compact rows use `payload.summary`, the platform chip shows, page cards show Done after the followup, and follow-up update cards appear.
- Broken: the loader attaches answers, comments and handling only by `cardId` + `issuanceId`. Every reply makes a new issuance, so an answered decision with a reply shows "Needs you" again, and comments are missing. Replies then show unthreaded, and also as quotes in the body because of `render: "thread"`. Reported to the feed builder.
- picsum images are blank only because the test host can't reach picsum.

## Fields the real feed does not support yet

`tinycloud feed publish` (CLI 1.6.5) stores `payload` as sent, so every field below survives publishing. What's missing is Home, which doesn't read or show them. Rows marked v2 are new in guide 0.4.0; the lab names come from the lab builder's `MERGE-NOTES.md` (tinychat `holden/feed-lab`, uncommitted on 11-12).

| Field | Lab | tinychat main | Needed for |
| --- | --- | --- | --- |
| `payload.summary` | compact row text | not read | compact rows |
| `payload.page` (`image`, `imageAlt`, `questions[]` with `options`, `multi`, `notePrompt`, `media`) | `PostPage` | not read; `payload.image` is read but never rendered for real cards | page cards and their answers |
| `payload.replies[].replyTo` on plain cards | `CardConversation`: reply under the comment, "Replied" | replies show flat and only with `render: "thread"`; `replyTo` exists only on typed (sitrep) threads | replying to a specific comment |
| `payload.agent` (`kind`, `model`, `runsOn`) | `AgentMark` | only in draft PR #667 | platform chip |
| `payload.agent.job` | shown after the agent name | not read anywhere | job / role |
| "Received" / "Replied" comment status | yes | main shows "{agent} got it" for an acknowledged comment; no replied state | comment status |
| Page answer progress ("N of M answered") | in-memory drafts only | no | partial page answers |
| v2 `payload.priority` (0 highest to 5) | "P0"…"P5" mark, filter, "Priority first" | not read; main sorts plain cards by `urgency` only, so the guide sets `urgency = 5 - priority` | priority |
| v2 `payload.brief` (`title`, `markdown` or `url`) | `BriefSheet`: full screen on phones, dialog on wide screens | not read | the one-page brief |
| v2 `payload.deadline` | "Due …" on the card, "Due first" order | not read on plain cards; main reads `deadline` only inside a typed sitrep record | deadline |
| v2 `payload.expiresAt` | past it, the card leaves every view and shows under History as "Expired" | not read on plain cards | expiry. Sam may merge expiry and deadline into one field: the lab keeps two until he decides. |
| v2 card actions reaching the agent, as a `message` with a private payload, written only after the 5 s undo (names agreed with the lab builder, 11-13): "Ask me later" `{type: "feed.snooze", version: 1, data: {until}}`, text `Ask me later: <until>`; "Drop this card" `feed.drop`, text `Dropped`; "Acknowledge" `feed.acknowledge`, text `Acknowledged` | the lab will write exactly these | snooze is a private `feed_view_events` row, so the agent never hears of it. Plain cards have no Drop or Acknowledge: main has only "Drop question" on typed sitrep asks | the agent learning that the owner snoozed, dropped or closed its card. Home has to write them. |
| v2 "Received" = the agent's `acknowledged` handling, written by the agent itself when the watcher wakes it | "Received"; "Not confirmed · Send again" after 30 s without one | "{agent} got it" on answers | comment status. Set "Not confirmed" to 60 s (timing above). |
| v2 `feed watch --once`, JSON lines and the idle-exit fix | n/a | n/a | in `@tinycloud/cli@1.6.6` (stable, carries js-sdk#936); the site pin is now 1.6.6. |

Constraints the guide works around:
- Responses and handling are tied to the exact `cardId`/`revision`/`issuanceId`.
- Main keeps an answer across a new revision only when the revision just adds replies (`replyOnlyRevision.ts`). So the guide never edits a card to show progress: it records an outcome and posts a new update card.
- Owners can't attach `replyTo` to a response or message: the message schema is strict. Only agents point at comments.
