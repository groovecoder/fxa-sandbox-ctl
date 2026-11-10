# Evals for other repos: notes from the Relay pilot

**Status:** Draft from Luke, for Vijay (and Dan, for the environment part). Update 2026-11-10: evals now run on [Harbor](https://github.com/harbor-framework/harbor), and Vijay agreed. See "Evals run on Harbor" below.
**Context:** Relay is trying FxAgent's evals to measure whether changes to the Relay repo make agents more effective ([fx-private-relay PR #7015](https://github.com/mozilla/fx-private-relay/pull/7015)). These notes cover what we had to change to run them, and a proposal for how FxAgent could support other repos without holding their knowledge. I've only read part of this repo, so I may have missed things you already built. Please correct me.

## How evals work today

- **Cases** are JSON files in `evals/`. Each case has `base` and `fix` commits, `fix_paths`, a `prompt`, an `answer` for the bot's questions, a time limit, and a hand-written `rubric`.
- **`eval.sh`** runs a case through the dev bot in Slack. It pins the bot to the base commit, saves the thread, diff, commands and report, and then has a judge model score the run against the rubric and the reference fix.
- **`eval-local.sh`** runs a case on the laptop with Claude or Codex, and the same judge scores it. **`eval-install.sh`** builds an installed FxA checkout at the base, so the agent can run tests.
- **The judge** also flags runs that looked past the base commit.

## What Relay had to change

To run one Relay case (`evals/relay-mpp-4770.json`), we added five Relay versions of the scripts to `skills/fxa-ctl-dev/`. None of them is committed.

| Relay script | Why the shared one didn't fit |
|---|---|
| `relay-eval-local.sh` | `agent-try.sh` and `eval-local.sh` assume an FxA clone (`FXA_CLONE`) and a Node install (`.nvmrc`). |
| `relay-eval-install.sh` | Relay is Python. It also clones with `--no-local`, so the copy holds no object newer than the base. |
| `relay-score.sh` | Scores the run with the real fix's tests, SWE-bench style, two ways: the tests as written (strict), and a copy with asserts on the human's format choices swapped out (detection). The shared scripts score with the judge only. |
| `relay-split-tests.py` | Splits the reference tests into behavior tests, which count toward the score, and tests of helpers the human invented, which are reported but not scored. |
| `relay-eval-env.sh` | Runs the agent and the scorer with a cleared environment plus Relay's CI values. `eval-local.sh` passes the caller's whole shell environment to the agent. |

Other FxA-specific parts:

- **The judge prompt names FxA tools.** `eval.sh:55` tells the judge about FxA's prettier hook.
- **The first prompt is written for FxA.** `agent-try.sh` builds it with `_session_first_prompt`, which names FxA skills, the FxA stack and Slack. Relay used its own short wrapper (`evals/relay-mpp-4770/wrapper.md`).
- **The judge reads the fix as one commit.** It runs `git show <fix>`. Relay's PR #6905 was four commits plus a merge, so the case points at a squash that exists only in my clone.
- **The judge's reply parser missed one-line JSON.** `eval.sh` pulled the JSON out with a `sed` range from `{` to `}`. `sed` never tests the end of a range on the line where it starts, so a one-line reply ran on into the closing code fence, and `jq` failed. It hit one of four Relay runs. The uncommitted fix decodes the first JSON object in the reply instead.
- **The local runner can reach the answer.** It blocks `gh` and WebFetch, but not `curl`. Relay's sandbox settings allow `api.github.com`, so an agent could fetch the merged PR for its own ticket.
- **The scorer mislabels regressions.** `relay-score.sh` says a regression is a test that "passed at the base and fails now," but it never runs the base. It lists every failure outside the fail-to-pass list.

Those Relay copies put Relay knowledge in this repo. The next team would add five more. That is the pattern the rest of this doc tries to avoid.

## The proposal: the target repo says how to run it

I built BLEnder so that the target repo controls how BLEnder works in it. Repo owners edit `.blender/blender.yml` and `.blender/agents.md` in their own repo, and never commit to BLEnder. I'd like FxAgent to work the same way, with three rules:

1. **The repo holds facts about itself.** How to build it, start it, check it and test it.
2. **The tool holds policy.** Egress, secrets, connectors, Jira and Slack access, spending caps, and anything that runs as root. A repo can't grant itself any of these. (BLEnder gets this wrong: its `deep_merge` lets a repo raise its own `max_budget_usd`.)
3. **The host picks the isolation.** A laptop, a container, Docker SBX, Firecracker, Tart or a GCE VM. The repo never names it. Dan's [FxA Docker plan](https://docs.google.com/document/d/1OxHRoMN1gQQrOZjywMsBgXFSx2RCcszbINRZZw3M1tM/edit) makes the same split: microVMs "do not replace something like docker compose, rather they complement it."

### A tool-neutral layout

Nothing in the target repo names FxAgent or BLEnder, so one set of files serves a developer's own agent, BLEnder and FxAgent:

```
AGENTS.md                  # prose rules (an existing convention)
CLAUDE.md                  # one line: @AGENTS.md, for Claude Code
.agents/
  skills/                  # skills (an existing convention; Codex reads it)
  environment.yml          # new: how to build, start, check and test the repo
  evals/                   # new: eval cases, one Harbor task folder each
```

`AGENTS.md` and `.agents/skills/` are existing conventions. [Codex reads `.agents/skills`](https://developers.openai.com/codex/skills). Claude Code reads `.claude/skills/` and `CLAUDE.md` instead. `environment.yml` is new; I found no existing convention for it. `evals/` holds [Harbor](https://github.com/harbor-framework/harbor) task folders, Harbor's own format.

### `.agents/environment.yml`

This file is for FxAgent's sessions and pipeline, where an agent works in the repo on a runner. Evals no longer need it: a Harbor task's `environment/` defines the eval environment (see below).

**The rule:** the file points at entry points the repo already has, and holds only what no other file holds. If a field repeats a value from `compose.yml`, `devcontainer.json`, `package.json` or CI, the validator rejects it.

Fields in version 1:

| Field | Meaning |
|---|---|
| `version` | `1` |
| `requires.tools` | Commands the host must have on `PATH`, like `uv`. A host without one refuses to run, and says which one is missing. |
| `providers` | Ways to build the environment, in the repo's order of preference. The host takes the first one it supports. Version 1 supports `commands`, with optional `build`, `refresh` and `start` entries. |
| `ready` | A command that must pass before an agent starts. A host that can't get `ready` to pass stops the run and shows its output. |
| `test` | The repo's test entry point. Callers append arguments, like a test path. |

Relay's file, version 1:

```yaml
version: 1
requires:
  tools: [git, uv]
providers:
  - commands:
      build: scripts/test-env.sh --setup
ready: scripts/test-env.sh --check
test: scripts/test-env.sh
```

Later versions would add these. Each one waits for a repo that needs it:

- **`compose: compose.yml` and `devcontainer: .devcontainer/devcontainer.json` providers.** These bring their own build, start and health checks, so they take no phase commands. Ports stay in `compose.yml` (`${P_AUTH:-9000}`), where Dan's plan puts them. A host reads them from there.
- **`build_key` and `caches`, under `commands` only.** `build_key` lists the files whose change makes a cached build stale. Docker's layer cache already does this for compose. Vijay's GCE images, which have FxA prebuilt and then run `git pull` and `yarn install` at start, are a host cache of the `build` phase. `build_key` tells a host when to rebuild one.
- **`requires.memory` and `requires.storage`.** FxA would need 20 GB and 100 GB (from Dan's plan). A devcontainer's `hostRequirements` wins when there is one.
- **`secrets`.** Names only. Each host maps a name to its own store.

FxA, once it needs them:

```yaml
version: 1
requires: {memory: 20gb, storage: 100gb}
providers:
  - compose: compose.yml
  - commands:                     # PM2, for hosts without Docker
      build: yarn install --immutable && npx nx run-many -t build
      refresh: yarn install --immutable
      start: yarn start
      build_key: [yarn.lock, .nvmrc]
      caches: [.yarn/cache, .nx/cache]
ready: .agents/ready.sh
test: yarn test
```

FxA's PM2 configs hardcode their ports (`fxa-auth-server/pm2.config.js:31` sets `PORT: '9000'`). So a PM2 stack needs a box of its own, while a compose stack can share one. The host can tell which is which from the provider, so the file doesn't have to say it.

### Rules that make it robust

- **`ready` catches what health checks miss.** Relay's broken runs failed because Django dropped the `emails` app without a word. Two agents lost turns working around it. A `ready` check that loads that app stops the run with a clear error.
- **A host picks a provider or refuses.** Nothing falls back in silence.
- **Each phase has a fixed privilege level.** `build` may run as root only at image-build time, before any agent or secret is present. `refresh`, `start`, `ready` and `test` run as the agent's user.
- **A cache never crosses a trust level.** This is Dan's cache-poisoning rule, applied to agents. An agent runs code it wrote. If that code writes to a yarn or nx cache, and the next run builds from that cache, one run can poison the next. Hosts build caches only from trusted refs, and give each run a copy-on-write view.
- **The repo's CI runs every provider.** It builds, starts, checks and tests each provider on a clean runner. If the file drifts, the repo's CI goes red, and the fix lands in the repo.

## Evals run on Harbor

The goal is to take custom eval plumbing out of this repo, and let each team add, keep and run its own cases with a popular, mature tool. [Harbor](https://github.com/harbor-framework/harbor) is that tool. It runs Terminal-Bench 2.0, and frontier labs use it to publish benchmarks. It has adapters for SWE-bench and its variants, installed agents (Claude Code, Codex, OpenHands and more), and many isolation providers (Docker, Docker SBX, GKE, EC2, Modal, and a custom class by import path).

### A case is a plain task folder in the team's repo

Relay's first case is `.agents/evals/mpp-4770/` in fx-private-relay. The steps every case shares live once, in `.agents/evals/_lib/`, and a case holds only its own data:

```
_lib/
  seal.sh            # builds the agent's copy of the repo (below)
  verify.sh          # SWE-bench style: hidden tests through environment.yml's test command -> reward.json
  solve.sh           # applies the reference fix, for Harbor's oracle agent
mpp-4770/
  task.toml          # resources, timeouts, healthcheck; [metadata] holds the judge's rubric and fix
  instruction.md     # the ticket, all the agent sees
  environment/
    Dockerfile       # BASE and SETUP_REF, then fetches and runs _lib/seal.sh
  tests/
    test.sh          # one line: runs _lib/verify.sh
    strict_tests.py  # the fix's tests as written
    relaxed_tests.py # optional: the same, with asserts on incidental choices swapped out
    f2p.txt          # the fail-to-pass units
  solution/          # solution.patch, and a one-line solve.sh
```

Harbor keeps symlinks as links and has no way for one task to include another's files, so a case cannot point at shared files. The Dockerfile fetches `_lib/seal.sh` from GitHub at `SETUP_REF` instead, and `seal.sh` takes `verify.sh` and `solve.sh` from that same commit. Harbor's loader skips `_lib/`, because it holds no task.

`harbor run` is the whole runner. It builds the image, runs the agent, runs the verifier, and saves a trajectory. Its oracle agent applies `solution/` first, so a case proves its own tests before any agent runs.

### The seal

`seal.sh` runs as one step of the image build, so no layer keeps what it drops:

1. A shallow fetch of the base, by sha, from GitHub: the base and 50 commits below it, nothing newer.
2. A depth-1 fetch of `SETUP_REF`, the agent setup under test. Only `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/` and the entry points `.agents/environment.yml` names are kept and committed. `.agents/evals/` is removed, so the agent never sees a case.
3. The setup commit is dropped and the clone is garbage collected.

Tested against Relay: the fix commit, its first parent, the setup commit and the fix's blobs are all absent. That holds when `SETUP_REF` is `main`, whose tree contains the fix: its fixed `emails/utils.py` blob is gone after the seal. Harbor's own example task clones the whole history, so its agent can read the fix; check for this in any adapter.

### The judge stays here

Harbor has no LLM judge. `eval.sh --harbor <task dir> <trial dir>` judges a Harbor trial with the same judge as before. `harbor_judge_inputs.py` turns the task's `instruction.md` and `task.toml` [metadata], and the trial's patch, trajectory and result, into the judge's inputs.

### Results on MPP-4770

Same model (`claude-opus-5-5`), same setup (fe05d8673), same ticket text.

| Run | Runner | Oracle | Strict (of 19) | Relaxed (of 19) | Regressions | Judge (of 13) | Cost | Agent time |
|---|---|---|---|---|---|---|---|---|
| r5 | `eval-repo.sh` (laptop) | n/a | 9 | 9 | 0 | 10 | $1.15 | 443 s |
| h1 | Harbor, generated task | 19/19 | 9 | 9 | 0 | 10 | $0.91 | 281 s |
| h2 | Harbor, plain task folder sealed from GitHub | 19/19 | 3 | 9 | 0 | 10 | $1.29 | 641 s |

Relaxed and the judge did not move, and all three runs failed the same 10 relaxed units. Strict swung on the warning link's format, the assert the Relay plan already calls out, so relaxed and the judge are the scores to watch. (These runs called the relaxed score `detection`, a name that only fit this case.) Cost and time varied by more than two times on equal scores. Three runs of one case show the runners agree here, not everywhere.

### Gaps before more cases

- **The verifier shares the agent's container.** `harbor lint` flags `shared-verifier`. Harbor's `separate` mode would also protect the start commit the build records in `/eval-start`.
- **The agent's network is open.** It should be an `allowlist`: the package hosts the repo needs, plus the model's API host.
- **`_lib/` comes from `SETUP_REF`.** Comparing two setups also compares their `_lib/` versions, unless both refs share it.
- **One-shot runs.** Harbor has no simulated user, so the agent cannot ask a question and get an answer.
- **To compare setups, edit `SETUP_REF`.** Harbor passes no build args to the task image.

### What this repo keeps

This PR holds only the judge: the `eval.sh` fixes (the fix as a `base..fix` range, a repo-neutral formatter line, the one-line JSON parser, a templated `mktemp`), `eval-src.sh` to find a case's clone, and the Harbor bridge. The earlier `eval-repo.sh`, `eval-score.sh`, `eval-lib.sh` and `lib/repo_env.py` are gone: Harbor does their work. `repo_env.py` can come back with the VM path, which needs `environment.yml`.

## Later

- **The VM path.** The pipeline and Slack sessions would run `environment.yml`'s phases on the runner, after the pin, as the agent user. That would replace boot scripts like `profiles/monitor/boot.sh` for repo-level steps. FxAgent's VMs could also become a Harbor environment provider.
- **Repeat runs and a summary.** Harbor's `--n-attempts`, with the average and spread per case.
- **A default rubric.** Found, fixed, verified, scope. Teams add hand-written rubrics only where they need them.
- **BLEnder moves to the same layout.** `.blender/agents.md` folds into `AGENTS.md`, and its repo facts move to `environment.yml`. FxA's `AGENTS.md` is a symlink to `.blender/agents.md` today, so BLEnder's onboarding would change too.

## Questions

**For Vijay:**
- Should evals measure the pipeline's `/goal` prompt or the session prompt? The session prompt is FxA-only (`lib/session.sh:83`). The pipeline reads a team's `goal.md`.
- If repos own their prose rules in `AGENTS.md`, can a team record's `prompts` shrink to FxAgent's own steps? Can `boot` shrink to system packages from a menu the host installs?
- Can the GCE images include Docker, so a compose provider runs inside the VM?
- FxA works across several repos, and needs one place that says how the services connect and how to test them together. Should the team record list the repos, and the main repo's `AGENTS.md` say how they connect?
- The dashboard shows and edits each team's record. Should it also fetch and show each repo's `environment.yml`?

**For Dan:**
- Will each compose service have a health check, so `docker compose up --wait` means "ready"?
- Will the port variables follow one naming pattern across repos?
- Could the deployment epic's ephemeral environments read `environment.yml`, so there aren't two formats for how to build a repo?

**For both:**
- Is Docker SBX worth a spike as an isolation layer for evals?
