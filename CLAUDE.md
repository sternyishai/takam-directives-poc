# Project context
Take-home assignment POC for the Takam Directives site. See docs/assignment.md for the brief and docs/site-research.md for the site's JSON API.
The author is learning React and must be able to explain every line, so keep code simple and readable and record decisions in the README.
Status: grilling done (2026-11-23). Build from docs/plan.md, milestone by milestone. Domain terms are in GLOSSARY.md and decisions are in docs/adr/. Order of the remaining work (set by the author on 2026-11-24): first #14, the Hebrew versions of the ADRs (docs/adr/he/); then #13, the video; then, if there is time, #29 (a bug: Latin keywords fail the enrichment). A new ADR also needs its Hebrew version in docs/adr/he/.

## Git workflow
Every issue is built on its own branch, never committed directly to `main`. This rule overrides any skill that says to commit to the current branch.
1. Before the first commit, create the branch from an up-to-date `main` and name it after the issue, e.g. `issue-3-one-directive`.
2. When the work is done, push the branch and open a PR whose body says `Closes #N`.
3. Merge the PR, then make sure the issue is closed.

## Agent skills

### Issue tracker

Issues and specs are GitHub issues in sternyishai/takam-directives-poc, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
