#!/usr/bin/env python3
"""
THE KEY GATE — the JWT public key this repo carries must be PUBLIC, PARSEABLE, and CURRENT.

⚠⚠ WHY THIS EXISTS. `rap-server/server/config.py` verifies every auth / licence token locally when
it cannot reach the auth server. It read the key from `paracore/rap-auth-server/server/jwt_public.pem`
— an IGNORED folder — and that copy was an ORPHAN from a key rotation. Dev therefore verified tokens
against a key nothing signs with, the build used a different one from the sibling repo, and both
looked fine online because the remote fetch wins. Offline auth was broken and nothing said so.

Three assertions, and each one is a defect that actually happened:
  1. PRESENT and PARSEABLE   - a missing key makes config.py print a warning and carry on.
  2. PUBLIC, never PRIVATE   - this repo is PUBLIC. One `jwt_private.pem` here is a leaked signing
                               key, and the file would be committed before anyone read it.
  3. MATCHES THE AUTHORITY   - the sibling `rap-auth-server` repo is the authority: its key rotates
                               with the private key. When it is on this machine, the tracked copy
                               must agree with it. ⚠ Compared against the key DERIVED FROM
                               `jwt_private.pem` when `openssl` is available, because that is the
                               key that actually signs - not against the sibling's own public file,
                               which can itself be stale.

⚠ A gate must not have a failure mode of its own: no sibling repo on this machine, or no `openssl`,
degrades to a WARN. Only a real disagreement fails.
"""
import base64
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARACORE = os.path.dirname(HERE)

#: The tracked key — beside the code that reads it, so dev and a fresh clone both have it.
KEY = os.path.join(PARACORE, "rap-server", "server", "keys", "jwt_public.pem")

#: The authority. A sibling of this repo, and PRIVATE — it may simply not be on this machine.
AUTHORITY_DIR = os.path.join(os.path.dirname(PARACORE), "rap-auth-server", "server")

PUBLIC_HEADERS = ("-----BEGIN PUBLIC KEY-----", "-----BEGIN RSA PUBLIC KEY-----")
DER_SEQUENCE = 0x30


def body(text: str) -> str:
    """The base64 payload, whitespace-free.

    ⚠ Compare the BODY, never the file bytes. The same key copied by hand, by git or by Windows
    gains or loses CRLFs, and a byte comparison then reports a false drift - which is exactly how
    the stale copy looked 'fine' while being a different key.
    """
    lines = [ln.strip() for ln in text.strip().splitlines()]
    return "".join(ln for ln in lines if ln and not ln.startswith("-----"))


def read(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return None


def structural_problems(text: str) -> list[str]:
    """Everything checkable without a crypto library."""
    problems = []
    head = text.strip().splitlines()[0] if text.strip() else ""
    if head not in PUBLIC_HEADERS:
        problems.append(f"does not start with a PUBLIC key header (found {head!r})")
    if "PRIVATE" in text.upper():
        problems.append("contains the word PRIVATE - this repo is PUBLIC, a signing key here is leaked")
    payload = body(text)
    try:
        der = base64.b64decode(payload, validate=True)
    except Exception as exc:  # noqa: BLE001 - any decode failure is the same verdict
        problems.append(f"body is not valid base64 ({exc})")
        return problems
    if len(der) < 64:
        problems.append(f"decoded key is only {len(der)} bytes - truncated or a stub")
    elif der[0] != DER_SEQUENCE:
        problems.append(f"decoded key does not start with a DER SEQUENCE (0x{der[0]:02x})")
    return problems


def derived_public_key(private_path: str) -> str | None:
    """The public half of the signing key, as base64 body. None when openssl cannot answer."""
    exe = shutil.which("openssl")
    if not exe:
        return None
    try:
        out = subprocess.run(
            [exe, "rsa", "-in", private_path, "-pubout"],
            capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0 or not out.stdout.strip():
        return None
    return body(out.stdout)


def main() -> int:
    print(f"tracked key : {KEY}")
    print(f"authority   : {AUTHORITY_DIR}")

    failures: list[str] = []
    warnings: list[str] = []

    text = read(KEY)
    if text is None:
        print("FAIL: the tracked key is MISSING.")
        print("      config.py falls back to the network, prints 'JWT Public Key NOT LOADED' and")
        print("      carries on - so offline auth dies at the customer, not here.")
        print("      Restore it from the authority: "
              "cp ../rap-auth-server/server/jwt_public.pem rap-server/server/keys/")
        return 1

    problems = structural_problems(text)
    if problems:
        print("FAIL: the tracked key is not usable:")
        for p in problems:
            print(f"  + {p}")
        return 1
    print("  ok      present, a PUBLIC key, and parses as DER")

    tracked = body(text)

    if not os.path.isdir(AUTHORITY_DIR):
        warnings.append(
            "the authority repo is not on this machine, so the tracked key could NOT be compared "
            "against the key that signs. Fine for a clone; do not treat it as proof of currency"
        )
    else:
        private_path = os.path.join(AUTHORITY_DIR, "jwt_private.pem")
        public_path = os.path.join(AUTHORITY_DIR, "jwt_public.pem")

        derived = derived_public_key(private_path) if os.path.isfile(private_path) else None
        if derived is None:
            warnings.append(
                "could not derive the public key from the authority's jwt_private.pem "
                "(no openssl, or no private key) - falling back to its jwt_public.pem"
            )

        reference = derived
        if reference is None:
            sibling = read(public_path)
            reference = body(sibling) if sibling else None

        if reference is None:
            warnings.append("the authority holds no key to compare against - drift NOT checked")
        elif reference != tracked:
            failures.append(
                "the tracked key does NOT match the authority - offline auth will reject every "
                "token the auth server signs. Refresh it: "
                "cp ../rap-auth-server/server/jwt_public.pem rap-server/server/keys/"
            )
        else:
            print(f"  ok      matches the authority's {'private key (derived)' if derived else 'public key'}")

    for w in warnings:
        print(f"WARN  {w}")

    if failures:
        print()
        print(f"FAIL: {len(failures)} problem(s):")
        for f in failures:
            print(f"  + {f}")
        return 1

    print()
    print("The tracked JWT public key is public, parseable, and agrees with the authority.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
