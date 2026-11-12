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

`tinycloud feed publish` (CLI 1.6.5) stores `payload` as sent, so every field below survives publishing. What's missing is Home, which doesn't read or show them:

| Field | Lab | tinychat main | Needed for |
| --- | --- | --- | --- |
| `payload.summary` | compact row text | not read | compact rows |
| `payload.page` (`image`, `imageAlt`, `questions[]` with `options`, `multi`, `notePrompt`, `media`) | `PostPage` | not read; `payload.image` is read but never rendered for real cards | page cards and their answers |
| `payload.replies[].replyTo` on plain cards | `CardConversation`: reply under the comment, "Replied" | replies show flat and only with `render: "thread"`; `replyTo` exists only on typed (sitrep) threads | replying to a specific comment |
| `payload.agent` (`kind`, `model`, `runsOn`) | `AgentMark` | only in draft PR #667 | platform chip |
| `payload.agent.job` | shown after the agent name | not read anywhere | job / role |
| "Received" / "Replied" comment status | yes | main shows "{agent} got it" for an acknowledged comment; no replied state | comment status |
| Page answer progress ("N of M answered") | in-memory drafts only | no | partial page answers |

Constraints the guide works around:
- Responses and handling are tied to the exact `cardId`/`revision`/`issuanceId`.
- Main keeps an answer across a new revision only when the revision just adds replies (`replyOnlyRevision.ts`). So the guide never edits a card to show progress: it records an outcome and posts a new update card.
- Owners can't attach `replyTo` to a response or message: the message schema is strict. Only agents point at comments.
