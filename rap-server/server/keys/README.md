# `keys/` — the JWT **public** key, and nothing else

`jwt_public.pem` is the public half of the key `rap-auth-server` signs auth and licence tokens with.
`config.py` in this folder's parent reads it when it cannot reach the auth server, so the desktop app
can verify a token **offline**.

## ⚠⚠ What must never appear here

| Never | Why |
|---|---|
| `jwt_private.pem` | It signs every user's token. This repo is **PUBLIC** — one commit and the signing key is published. It lives in `Sey56/rap-auth-server`, which is private, for exactly this reason |
| `.env`, any credential | Same |
| A key from an older rotation | ⚠ This is not hypothetical. A pre-rotation public key sat in an ignored folder from before the 2026-06-29 keypair regeneration; `config.py` found it, and offline auth verified tokens against a key nothing signs with. It looked fine online because the remote fetch wins |

## The authority, and the two rules

**`Sey56/rap-auth-server` is the authority** — its key rotates together with the private key. This
file is a **copy**, and a copy drifts.

```bash
# refresh it (from the workspace root, with the authority cloned beside paracore)
cp rap-auth-server/server/jwt_public.pem paracore/rap-server/server/keys/jwt_public.pem
```

`scripts/check-jwt-key.py` fails when the two disagree, when this file is not a PUBLIC key, when it
does not parse, and when it is missing. ⚠ When the authority repo is not on the machine the check
degrades to a warning — it cannot compare, and it must not pretend it did.

`build-frontend.ps1` prefers the authority and falls back to this file, so a clone without the
sibling still builds. It **fails** if neither exists — an app shipped without a key has no offline
auth, and the failure belongs at build time, not on a customer's machine.
