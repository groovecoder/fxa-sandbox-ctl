// The routine functions of the retired v1 dashboard (dashboard/index.html), frozen as the reference for rt.test.ts. Do not edit.
const REPO_RE = /^(?!.*\.\.)[\w-][\w.-]*\/[\w-][\w.-]*$/;
const sentence = t => t.charAt(0).toUpperCase() + t.slice(1);
const usd = n => n == null ? "—" : "$" + Number(n).toFixed(2);
const RT_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], RT_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const RT_MODES = [["report", "Report", "A summary in Slack and History. Changes no code."], ["pr", "Draft PR", "Opens a draft PR with the fixes. Nothing merges by itself."], ["pr+notes", "Draft PR with notes", "The draft PR, plus every finding it did not fix, in the PR description."]];
const RT_FIELDS = ["template", "name", "prompt", "schedule", "zone", "repos", "branch", "watch", "channel", "mode", "draft", "max_usd", "skip_no_commits", "pr"];
const RT_ZONES = [["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"], ["America/Los_Angeles", "Pacific"], ["UTC", "UTC"], ["Europe/London", "UK"], ["Europe/Berlin", "Central Europe"], ["Asia/Kolkata", "India"], ["Asia/Tokyo", "Japan"], ["Australia/Sydney", "Sydney"]];
function rtDraft(data) {
  const d = data ?? { template: "blank", name: "", prompt: "", schedule: "weekdays 09:00", zone: "America/New_York", repos: [], channel: "", mode: "report", max_usd: 10, skip_no_commits: true };
  const [kind, a, b] = (d.schedule || "weekdays 09:00").split(" "), pr = d.pr ?? {};
  return { ...d, template: d.template || "blank", kind, day: kind === "weekly" ? a : "mon", time: kind === "weekly" ? b : a, repos: [...(d.repos ?? [])], branch: d.branch ?? "", watch: d.watch ?? "", channel: d.channel ?? "", draft: d.draft !== false,
    ...(d.on === "pr-label" ? { pr_repo: pr.repo ?? "", pr_authors: (pr.authors ?? []).join(", "), pr_label: pr.label ?? "agent-help", pr_mention: pr.blender_mention ?? "" } : {}) };
}
function rtRoutine(d) {
  if (d.on === "pr-label") {
    // An edit keeps the pr fields the form does not show (blender_login, sweep_min).
    const pr = { ...(d.pr ?? {}), repo: d.pr_repo, authors: String(d.pr_authors).split(/[\s,]+/).filter(Boolean), label: String(d.pr_label).trim() || "agent-help" };
    if (String(d.pr_mention).trim()) pr.blender_mention = String(d.pr_mention).trim(); else delete pr.blender_mention;
    return { on: "pr-label", template: "blank", name: d.name, repos: d.pr_repo ? [d.pr_repo] : [], channel: d.channel.trim(), mode: "pr", max_usd: Number(d.max_usd), pr, ...(d.env ? { env: d.env } : {}) };
  }
  const r = { template: d.template, name: d.name, prompt: d.prompt, schedule: d.kind === "weekly" ? `weekly ${d.day} ${d.time}` : `${d.kind} ${d.time}`,
    zone: d.zone, repos: d.repos, channel: d.channel.trim(), mode: d.mode, draft: d.draft !== false, max_usd: Number(d.max_usd), skip_no_commits: !!d.skip_no_commits };
  if (d.branch.trim() && d.repos.length === 1) r.branch = d.branch.trim();
  if (d.watch && !d.repos.includes(d.watch)) r.watch = d.watch;
  if (d.env) r.env = d.env;
  return r;
}
function rtFromTpl(x, repos) {
  const d = rtDraft(), work = repos.filter(r => r.role === "work");
  if (x.on === "pr-label") return { ...d, template: "blank", on: "pr-label", name: "Dependency fixes", prompt: "", mode: "pr", max_usd: 10,
    pr_repo: work.length === 1 ? work[0].slug : "", pr_authors: "dependabot[bot]", pr_label: "agent-help", pr_mention: "" };
  return { ...d, template: x.template, name: x.template === "blank" ? "" : x.name, prompt: x.prompt ?? "", mode: x.locked_mode || x.mode || "report",
    skip_no_commits: x.skip_no_commits !== false, repos: repos.length === 1 ? [repos[0].slug] : [], max_usd: 5 };
}
function rtErrs(text) {
  const errs = {}, other = [];
  for (const l of String(text || "").split("\n").map(s => s.replace(/^ERROR: /, "").trim()).filter(Boolean)) {
    const m = l.match(/^([a-z_]+): (.*)$/);
    if (m && RT_FIELDS.includes(m[1])) errs[m[1]] ??= m[2]; else other.push(l);
  }
  const n = Object.keys(errs).length;
  return { errs, summary: [n ? `${n} field${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} a change: ${Object.values(errs).join(". ")}.` : "", ...other].filter(Boolean).join(" ") };
}
const rtPr = u => { const m = String(u || "").match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/); return m && REPO_RE.test(m[1]) ? u : ""; };
const rtSha7 = s => /^[0-9a-f]{7,40}$/.test(String(s ?? "")) ? s.slice(0, 7) : "";
const rtPrN = f => /^\d{1,9}$/.test(String(f?.pr ?? "")) ? `#${f.pr}` : "a PR";
const FIX_GUARD = { lock: ["yarn.lock", "The fix changes yarn.lock entries, which I do not push. Fix it by hand."], tooling: ["Yarn tooling", "The fix changes Yarn tooling files, which I do not push. Fix it by hand."], frozen: ["protected files", "The fix changes protected files, which I do not push. Fix it by hand."], pii: ["personal data", "The fix may hold personal data or a secret, so it was not pushed. Read the report here."] };
function rtResult(x, d) {
  if (d?.on === "pr-label" || x.heads?.fix) return rtFixResult(x, d);
  const pr = rtPr(x.pr_url);
  return { ok: ["Draft PR", "merged", pr ? `Opened draft PR #${pr.split("/").pop()}` : x.pr_url ? `Finished: ${x.pr_url}` : "Finished"],
    report: ["Report", "info", !d?.channel ? "Report in History" : x.reason ? `Report held: ${x.reason}. Read it in History` : "Posted a report"],
    nochange: ["No change", "dim", "Nothing to change"], failed: ["Failed", "bad", x.reason ? sentence(String(x.reason)) : "Failed"], missed: ["Missed", "bad", x.reason ? sentence(String(x.reason)) : "The run did not start"],
    stopped: ["Stopped", "warn", "Stopped by an admin"] }[x.state] ?? [String(x.state ?? "unknown"), "dim", x.reason || String(x.state ?? "")];
}
function rtFixResult(x, d) {
  const f = x.heads?.fix ?? {}, n = rtPrN(f), lb = d?.pr?.label || "agent-help", why = String(f.why ?? ""), again = `Add ${lb} again to retry.`;
  const not = { "new-commit": ["the PR has a new commit", `Add ${lb} again to fix the new head.`], expired: ["it waited 24 h", again], "not-red": ["CI passes on its head", `Add ${lb} again if CI fails.`],
    used: ["a run on its head already ended", "A new commit allows a new run."], "no-write": ["the label needs a person with write access", `Ask a person with write access to add ${lb}.`],
    fork: ["the PR is from a fork", "Fix it by hand."], base: ["the PR branch is a base or release branch", "Fix it by hand."], closed: ["the PR is closed", `Reopen it and add ${lb} again.`],
    merged: ["the PR is merged", "No step is needed."], boot: ["the sandbox did not start", again], target: ["the PR no longer matches this routine", "Check the routine's repo and authors."] };
  if (x.state === "ok") return ["Pushed", "merged", `Pushed ${rtSha7(f.new_sha) || "the fix"} to ${n}`, "Next: review the fix commit, then approve the functional tests gate."];
  if (x.state === "report" && why === "moved") return ["Branch moved", "warn", `The branch of ${n} moved, so nothing was pushed`, again];
  if (x.state === "report" && why.startsWith("guard:")) { const [c, t] = FIX_GUARD[why.slice(6)] ?? ["a guard", "A guard refused the fix. Fix it by hand."]; return ["Not pushed", "warn", `Not pushed (${c})`, t]; }
  if (x.state === "report" || x.state === "nochange") return ["No fix found", "dim", `No fix found for ${n}`, "A new commit allows a new run."];
  if (x.state === "stopped") { const c = why === "label" ? `the ${lb} label was removed` : ["closed", "merged"].includes(why) ? `${n} was ${why}` : "a team admin stopped it";
    return ["Stopped", "warn", `Stopped (${c})`, `Nothing was pushed. ${why === "merged" ? "No step is needed." : why === "label" || why === "closed" ? again : "Use Run now to retry."}`]; }
  if (x.state === "skipped") { const [c, nx] = not[why] ?? ["the run could not start", again]; return ["Not started", "dim", `Not started (${c})`, nx]; }
  return ["Failed", "bad", x.reason ? sentence(String(x.reason)) : `The fix for ${n} failed`, `Nothing was pushed. ${again}`];
}
function rtFix(why) {
  if (/channel_not_found|not_in_channel/.test(why || "")) return "Invite @fxa-agent to the channel, then use Run now.";
  if (/no session started/.test(why || "")) return "No runner was free. The next run tries again.";
  return /spend/.test(why || "") ? "The team's spend stopped the run. See the team's Overview." : "";
}
function rtNextDays(d, n, now = Date.now()) {
  try {
    const [hh, mm] = String(d.time || "").split(":").map(Number);
    if (!(hh >= 0 && hh < 24 && mm >= 0 && mm < 60)) return [];
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: d.zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map(x => [x.type, x.value]));
    const out = [], late = +p.hour * 60 + +p.minute >= hh * 60 + mm;
    for (let i = 0, day = Date.UTC(+p.year, +p.month - 1, +p.day); out.length < n && i < 22; i++, day += 86400000) {
      const wd = (new Date(day).getUTCDay() + 6) % 7;
      if ((i === 0 && late) || (d.kind === "weekdays" && wd > 4) || (d.kind === "weekly" && RT_DAYS[wd] !== d.day)) continue;
      out.push(new Date(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }));
    }
    return out;
  } catch { return []; }
}
const rtSched = d => { const [k, a, b] = (d.schedule || "").split(" "); return k === "weekly" ? `every ${RT_DAY_NAMES[RT_DAYS.indexOf(a)] ?? a} at ${b}` : `${k === "daily" ? "every day" : "weekdays"} at ${a}`; };
const rtZoneName = z => (RT_ZONES.find(x => x[0] === z) ?? [, z])[1];
const textSize = (s, max) => { const n = new Blob([s ?? ""]).size; return n >= 0.9 * max ? `${n} of ${max} bytes, ${max - n} left` : `${n} of ${max}`; };
const rtLine = r => { const L = r.lives ?? []; return [...L.filter(x => x.state !== "queued"), ...L.filter(x => x.state === "queued").sort((a, b) => a.id - b.id)]; };
