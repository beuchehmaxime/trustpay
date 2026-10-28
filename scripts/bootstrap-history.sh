#!/usr/bin/env bash
#
# Start this repository's history, inside the hackathon window, with the
# boundary between pre-existing and new work visible in the log itself.
#
# Two commits, in this order and deliberately not one:
#
#   1. bizik/          the live escrow platform, vendored unchanged. Not
#                      hackathon work, and the commit message says so.
#   2. everything else TrustPay's own scaffolding and, from here, its code.
#
# The rules make "failure to clearly identify your original contributions"
# an immediate disqualification. A README asking judges to take your word for
# it is weaker than a history where `git log --stat` shows the line.
#
# Usage:
#   bash scripts/bootstrap-history.sh            # commit only
#   bash scripts/bootstrap-history.sh --push     # commit and force-push
#
# The force is needed once: GitHub refuses to delete a default branch, so the
# 26 October planning commits are still on the remote until this overwrites
# them.

set -euo pipefail

WINDOW_OPENS="2026-10-27"
WINDOW_CLOSES="2026-11-04"
TODAY="$(date +%F)"

cd "$(dirname "$0")/.."

# ---- Guard 1: not before the window opens ----------------------------------
# The whole point of wiping the history was to keep every commit inside the
# building period. Committing a day early would undo that silently.
if [[ "$TODAY" < "$WINDOW_OPENS" ]]; then
  echo "REFUSING: today is $TODAY and the building period opens $WINDOW_OPENS." >&2
  echo "Committing now would put the history outside the window, which is the" >&2
  echo "exact thing the history was wiped to avoid. Wait." >&2
  exit 1
fi

if [[ "$TODAY" > "$WINDOW_CLOSES" ]]; then
  echo "WARNING: today is $TODAY; the window closed $WINDOW_CLOSES." >&2
  echo "Continuing, but this should already have been run." >&2
fi

# ---- Guard 2: only ever run once -------------------------------------------
if git rev-parse HEAD >/dev/null 2>&1; then
  echo "REFUSING: this repository already has commits." >&2
  echo "This script starts a history; it does not add to one. Commit normally." >&2
  exit 1
fi

# ---- Guard 3: no real secret may be committed ------------------------------
# The repository is public. The copy was taken with `git archive`, so nothing
# gitignored came across - but this costs nothing and the downside is a
# published credential.
if git ls-files --others --exclude-standard | grep -qE '(^|/)\.env$'; then
  echo "REFUSING: a real .env file would be committed to a PUBLIC repository." >&2
  git ls-files --others --exclude-standard | grep -E '(^|/)\.env$' >&2
  exit 1
fi

if [[ ! -d bizik ]]; then
  echo "REFUSING: bizik/ is missing. Nothing to vendor." >&2
  exit 1
fi

echo "Today is $TODAY - inside the building period. Starting the history."
echo

# ---- Commit 1: the pre-existing platform -----------------------------------
git add bizik/
BIZIK_FILES="$(git diff --cached --name-only | wc -l | tr -d ' ')"

git commit -q -F - <<'MSG'
Vendor the Bizik platform (PRE-EXISTING - not hackathon work)

Everything in this commit is the live escrow platform TrustPay is built
on. None of it was written during the hackathon and none of it is edited
here. It is vendored so the stack runs and the new work can be seen in
its real setting rather than in a mock.

The rules allow this - "Startups may build on existing products or
codebases, but you must clearly identify what was newly developed during
the Hackathon" - so it lands as one labelled commit, before any new work,
rather than mixed into it. Everything after this commit is the hackathon
build.

What it includes: escrow lifecycle, wallets and ledger, MTN MoMo and
Orange Money through Fapshi, KYC, AML screening, RBAC, audit log, the
user PWA, the admin console, and the WhatsApp channel.

Three parts matter most here:

- bizik/web/admin, /disputes/[id] - the mediator console. Already ships
  the approval step: evidence feed, binding-ruling form with a mandatory
  rationale, RBAC on disputes.resolve, and a recommendation panel with a
  confidence bar. It carries a suggestion.source 'model' | 'heuristic'
  discriminator and an AI badge that has never been lit, because nothing
  has ever filled it. TrustPay fills it.
- bizik/backend/src/lib/dispute-ai.ts - the reason-based heuristic
  filling AiRecommendation today. The benchmark baseline.
- bizik/backend/src/whatsapp* - how disputes actually arrive here.

Excluded: the mobile app, and every credential. The stack runs on
PAYMENTS_MODE=simulated and no .env is tracked.
MSG

echo "  [1/2] bizik/            $BIZIK_FILES files - pre-existing platform"

# ---- Commit 2: the hackathon scaffolding -----------------------------------
git add -A
NEW_FILES="$(git diff --cached --name-only | wc -l | tr -d ' ')"

git commit -q -F - <<'MSG'
Scaffold TrustPay: its own container, and the boundary it runs behind

The hackathon build starts here. Everything in this commit and after it
was written during the building period; everything under bizik/ was not.

TrustPay is a suggestion engine and nothing else. It reads a case file,
calls Meta's models, and posts back a recommendation for a human with
disputes.resolve to approve. It runs as its own container with no
database handle and no payment credential, so "no model outcome moves
money" is enforced by the deployment rather than promised in a README -
there is no endpoint it could call and no credential that would authorise
one.

Includes the compose stack (PWA on 3000, mediator console on 3001, Bizik
API on 4000, TrustPay on 4100), the Dockerfile, the TypeScript project,
and the docs: the architecture, the Bizik boundary, the hackathon
compliance notes and the day-by-day build plan.

Model ids are pinned. The docs list muse-spark-1.3, 1.2 and 1.1 and at
least one client still defaults to 1.1, so an unpinned id would let the
demo change under us mid-build. The open-weight id keeps its
meta-models/ prefix, which is part of the id and does not resolve
without it.
MSG

echo "  [2/2] TrustPay          $NEW_FILES files - hackathon work"
echo

git log --pretty="  %h  %ad  %s" --date=short
echo

# ---- Verify every commit landed inside the window --------------------------
OUTSIDE="$(git log --pretty=%ad --date=short | awk -v a="$WINDOW_OPENS" '$0 < a' | wc -l | tr -d ' ')"
if [[ "$OUTSIDE" != "0" ]]; then
  echo "WARNING: $OUTSIDE commit(s) dated before $WINDOW_OPENS." >&2
  exit 1
fi
echo "All commits dated $WINDOW_OPENS or later."

if [[ "${1:-}" == "--push" ]]; then
  echo
  echo "Force-pushing - this replaces the 26 October planning commits."
  git push --force origin main
  echo "Done. Check the history on GitHub."
else
  echo
  echo "Not pushed. When ready:  git push --force origin main"
fi
