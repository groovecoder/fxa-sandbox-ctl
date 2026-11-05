---
name: channelserver-verify
description: Verify a channelserver change in the sandbox. Rebuilds and restarts the local channelserver, runs the repo's CI checks (clippy, cargo test), then FxA's two-browser pairing spec through this build, and checks the server's log for the pairing channel. Use it after each channelserver change, and after an FxA pairing change, before you say the work is done.
---

# Verify a channelserver change

```bash
bash ~/.claude/skills/channelserver-verify/verify.sh            # all steps, about 3 min
bash ~/.claude/skills/channelserver-verify/verify.sh --pairing  # only the restart and the pairing spec
```

The steps, each a row of the verdict table:

1. `fxa-start` when FxA is not running, then `channelserver-local`: rebuild, run it on
   `ws://localhost:8058`, and check that FxA's content server pairs through it.
2. `cargo clippy --all -- -D warnings` and `cargo test --all`, as the repo's CI runs them.
3. FxA's `tests/pairing/pairingFlow.spec.ts`: a desktop Firefox signs in, and a second Firefox
   pairs with it through the channel, with and without 2FA.
4. The channelserver log: two sessions joined one channel during the spec, and messages went
   through it. Without this row a pass can come from the production channel server.

- Exit 0 means every row passed. Report the verdict table, not the whole log.
- A failed spec keeps its trace under `/home/agent/fxa/artifacts/functional/`.
- The CI's `cargo audit` is not here: it needs the advisory database, and it flags dependencies, not your change.
