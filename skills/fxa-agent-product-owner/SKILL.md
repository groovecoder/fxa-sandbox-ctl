---
name: fxa-agent-product-owner
description: Use when you make a product, UX or wording decision for FxA Agent (the Slack bot, quick answers, sessions, the Jira pipeline, teams, routines, sandboxes, cost, the dashboard), when a request about it is vague ("make it better", "this is confusing", "clean this up"), or when you decide how to verify and deliver a change to it.
---

# Decide as the FxA Agent owner would

The owner is Vijay, the operator. This skill holds his taste and habits, taken from about 1,600 of his messages. The product facts, goals and principles are in `PRODUCT.md`: read §2, §6 and §7 before a decision. The dashboard rules are in `guide/dashboard-design.md`, and the bot's voice is in `guide/voice.md`. This skill does not repeat them.

## What he optimizes for

1. Safe by default, then changes that merge with no feedback round (PRODUCT.md §2).
2. Fast iteration. Short cycles, parallel work, few steps from a change to production.
3. Robust and self-healing. A deterministic script beats an LLM call, because it is cheaper and repeatable.
4. Cost he can see and predict. He asks about cost often. Cost is the operator's view, never the Slack user's.
5. Teams serve themselves. A feature that helps a second team beats polish for FxA.
6. "Seamless and easy", and "lots of context in the smallest size possible".

## A vague request

1. Find the job behind it. For a page: "show me what needs me, and why". For Slack: "tell me only when I must act". For the pipeline: "what is blocked, why, and what is the next step".
2. Show before you build. For any UI (dashboard or Slack card), make 2 or 3 different mockups as an Artifact, each with its trade-off. Look at Mobbin, or Linear for agent cards.
3. Ask with numbered options, the recommended one first. He answers "2", "1, a" or "do recommended".
4. Expect one to three rounds of "not that". Change the approach, not the colour.

## His taste, by area

**Slack sessions and quick answers**
- Quiet, but not silent. One message for each change of state, never a repeat. Edit the card when you can. A long wait still shows a sign of life.
- Short and human: write as a person would. A comment that an agent wrote ends with a short italic note that says so.
- The owner of a thread never changes. Anyone allowed can steer. Approved users or admins open PRs.

**Pipeline and PRs**
- Each blocked item says why, and what the next step is. Group the stops so they read in order.
- A PR body has a risk section. A Jira merge comment has the cost, with a team switch to turn it off.
- "Nothing found" or "no change" is a result, not a failure. Do not label it red.

**Teams, routines, sandboxes**
- Use team records, not code. Use a fixed default before you add a setting, and a team key only when two real teams differ.
- Routines belong to team admins, in the dashboard only. A Slack channel is optional. One thread for each run.
- Know each team's real shape: repos, roles, read-only parts, its image. Do not assume FxA.

**Dashboard**
- What needs a person comes first. Overview is high level: what runs, what it costs, what needs me.
- Each Jira key, PR number and session links to its page. A list on the left, the content on the right.
- Numbers agree with Stats, Jira and GitHub. Unknown, never 0. Two figures side by side agree, or say why not.
- Green means done or ready to merge. Use soft tones. Fast, live, clean. "Easier to navigate and use" beats parity with v1.

## A fix

- Fix the cause once, where every caller passes. Then search for the same fault in the siblings: every bot note that can repeat, every card with the same layout, every team with the same setting. He asks "can we fix that more generally?" when you do not.
- When you assume a team's repos or setup, check the team record first.

## Verify the way a user meets it

- Bot: the dev bot with `FXA_DEV_FAKE=1` and the fake Jira, so that no real PR or ticket is made. Repeat a flaky check 3 times.
- Runner or team work: `agent-try.sh`, `session try`, or a dev slot (fxa-ctl-dev).
- Dashboard: render with fixture data, and take screenshots at 1440, 1024 and 375, in light and dark. For a UX change, run the gauntlet: a written bar, 2 independent critics (UX and visual), fix, and repeat until both pass, or until he says stop.
- Send the proof: a screenshot, a short video or the thread, not only "tests pass".

## Deliver

- "Ship it", "get it out" and "ship and promote" mean: commit, run `ship.sh`, then ask only "Promote now?".
- With no such words, ask for the result type: local work only, an ai-fixme ticket, or a PR.
- He asks "is it deployed?" often. Say plainly what is on main, on dev and on live.
- Add a permission rule for a read-only command that you run often, instead of letting it prompt.

## Decisions already taken (in addition to PRODUCT.md §7)

- All runs use Opus.
- The dashboard is open to every Mozilla account. Admin views stay gated.
- No test plans committed to a team's repo. No real Slack transcripts in the repo.
- No Slack interface for routines.
- Connectors are read-only.
- Do not file tickets for Android work.
- One epic at a time.
- Do not contact another team before he has spoken to them.

## Red flags

| You are about to | Instead |
|---|---|
| Build the first idea for a vague UI or card request | Show 2 or 3 mockups |
| Patch the one message, page or team in the ticket | Search for the same fault in the siblings |
| Test the bot with a real PR or Jira ticket | Use fake mode |
| Ask "PR or local?" after "ship it" | Ship, then ask "Promote now?" |
| Add a setting for one team | Use a fixed default |
| Use an LLM call where a script can decide | Write the script |
| Say "done" with only unit tests | Send the proof as a user meets it |
