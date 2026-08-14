# Rin version lines and baseline publication policy

This file defines how the local Rin fork advances after the sealed v1.2 baseline.

## Ownership

- The version-ledger task owns `CHANGELOG.md`, baseline archive documents, release tags, baseline
  tags, and publication of those records to the repository remote.
- Feature-line tasks implement and verify code, then hand off a commit and an evidence summary.
  They do not move tags, push releases, deploy production, or write a competing changelog.

## 1.x completion line

Each new 1.x release starts from the immediately preceding sealed 1.x baseline. The first successor
is `v1.3.0`, based on `v1.2.0`. Its scope is product completion and correctness rather than a new
Cloudflare resource model.

The planned v1.3 scope is:

1. complete per-article, type-safe local autosave for every writing state;
2. creator-only private drafts and personal notes with safe cross-device synchronization;
3. parent comments, reply trees, moderation, and deletion behavior;
4. removal of production `any` gaps and completion of shared client/server API contracts.

## 2.x feature line

The 2.x line adds new product capabilities but may never drift behind the 1.x completion line.
`v2.0.0-beta.1` must start from the sealed `v1.3.0` baseline, not from v1.2 or an unfinished 1.3
worktree.

Before every 2.x prerelease or release is sealed, it must contain the latest sealed 1.x baseline.
If a newer 1.x baseline appears while 2.x work is in progress, its complete changes and migrations
must be integrated without rewriting an already published tag, followed by a fresh full check,
test, frontend build, and Worker dry-run build.

The planned `v2.0.0-beta.1` scope is:

1. safe discovery and selection of the user's Cloudflare account, Pages project, Worker, D1, R2,
   and Queue resources;
2. general file upload plus improved upload/download validation, streaming, caching, range handling,
   recovery, permissions, and observability while retaining R2 as object storage.

## Required baseline publication sequence

Every future baseline must complete these steps in order:

1. Integrate the verified feature-line commit into the release line.
2. Add a complete version section to `CHANGELOG.md`, including inherited changes, new behavior,
   removed behavior, security boundaries, migrations, known limitations, and upgrade steps.
3. Add a dated archive under `docs/baselines/` with the exact commit, architecture, migrations,
   checks, and residual deployment boundary.
4. Verify workspace version consistency and all D1 migrations.
5. Run `bun run check`, `bun run test`, `bun run build`, and browser acceptance for affected UI.
6. Confirm a clean working tree, then create the release commit.
7. Create an annotated release tag and an immutable annotated baseline tag at the same commit.
8. Push the release branch, changelog commit, release tag, and baseline tag without force.
9. Verify the remote refs and record the GitHub Actions result. Production deployment is a
   separate action and requires explicit authorization.

Published baseline tags are immutable recovery points. Never force-update or reuse them.
