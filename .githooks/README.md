# .githooks

Versioned git hooks for the `paracore` repo.

## One-time setup (per clone)

```sh
git config core.hooksPath .githooks
```

Git does **not** version its hooks, and it refuses to read a hook out of the working tree
by default — that is a security decision, not an oversight. So the script lives here, in
version control, and each clone opts in once with the command above.

Verify it took:

```sh
git config --get core.hooksPath     # -> .githooks
```

To bypass a hook for one commit: `git commit --no-verify`.

## `pre-commit`

Runs `scripts/gen-protos.py --write` **only when `protos/corescript.proto` is part of the
commit**, then stages the in-repo VS Code copy and re-checks with `--check`.

Why it exists: a stale copy of the wire contract fails **silently**. Protobuf tolerates
missing fields, so a consumer reads a default value and behaves as if the answer were "no"
— nothing throws. `paracore-model` and `paracore-family` were checked in but missing from
`STUB_REPOS`, so the gate never looked at them and they fell three RPCs behind.

The hook cannot commit the sibling repos — they are independent git repos. It updates
their working trees and prints which ones need their own commit.
