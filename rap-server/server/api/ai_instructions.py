"""
The AI-instruction FILE SET written into a scaffolded Paracore gallery workspace.

WHAT CHANGED AND WHY (2026-10-09)
    This module used to compose ONE ~52,000-char `.github/copilot-instructions.md` out of
    `copilot-instructions.md` (an 831-line guide) plus the whole 654-line `EXTENSION_METHODS.md`.
    Every request loaded all of it, whether or not the task needed any of it, and the API
    reference sat in the always-on prefix where it could not be skipped.

    It now emits a **progressive-disclosure tree**, which is what current agent harnesses are
    built for (VS Code supports every one of these locations by default):

        .github/copilot-instructions.md          always loaded    — the router, ~90 lines
        .github/instructions/scripts.instructions.md
                                                 auto-applied to  — the script contract
                                                 Scripts/**/*.cs    (`applyTo` frontmatter)
        .github/skills/paracore-engine/SKILL.md  on activation    — the engine API map
        .github/skills/paracore-engine/references/EXTENSION_METHODS.md
                                                 on demand        — the COMPLETE API
        .github/skills/paracore-tool/SKILL.md    on activation    — the Params anatomy

    The API reference is unchanged in content — it simply moved from "always in the prompt" to
    "read when the agent needs it".

⚠ THE TREE IS GENERATED, NOT HAND-WRITTEN HERE. `paracore/scripts/gen-ai-workspace.py` composes
`paracore/ai/shared/**` + `paracore/ai/desktop/**` into `server/api/ai_workspace/`, and a
`--check` run gates it. The copy lives INSIDE this Python package so any packager that collects
`server` picks it up automatically — dev and production take the identical code path.

⚠ A missing or empty source FAILS LOUDLY. An earlier version fell back to a ~10-line stub with no
log, so a workspace could ship with no usable instructions and nothing said so. A stub guide
produces confidently wrong scripts; naming the missing file is strictly better.
"""

import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_TREE = os.path.join(_HERE, "ai_workspace")

# Files a scaffolded workspace MUST have. Missing one means the generated tree is stale or was
# never bundled — see `gen-ai-workspace.py --write`.
_REQUIRED = (
    "copilot-instructions.md",
    "instructions/scripts.instructions.md",
    "skills/paracore-engine/SKILL.md",
    "skills/paracore-engine/references/EXTENSION_METHODS.md",
)


def _read_tree() -> dict[str, str]:
    """{relative posix path: file text} for every file in the generated tree. Raises if unusable."""
    if not os.path.isdir(_TREE):
        raise FileNotFoundError(
            f"AI instruction tree missing: {_TREE}\n"
            "Run `python paracore/scripts/gen-ai-workspace.py --write`."
        )

    files: dict[str, str] = {}
    for dirpath, _dirnames, filenames in os.walk(_TREE):
        for filename in filenames:
            abs_path = os.path.join(dirpath, filename)
            rel = os.path.relpath(abs_path, _TREE).replace(os.sep, "/")
            with open(abs_path, "r", encoding="utf-8") as fh:
                text = fh.read()
            if not text.strip():
                raise ValueError(f"AI instruction source is empty: {rel}")
            files[rel] = text

    if not files:
        raise FileNotFoundError(f"AI instruction tree is empty: {_TREE}")

    absent = [rel for rel in _REQUIRED if rel not in files]
    if absent:
        raise FileNotFoundError(
            "AI instruction tree is incomplete — missing: " + ", ".join(absent)
        )

    return dict(sorted(files.items()))


def _safe_read_tree() -> dict[str, str]:
    """Never raise for the caller: return one diagnostic file instead of crashing the server.

    The scaffold imports this at module load. Raising would stop the server from starting and the
    user would see a dead app with no explanation; a file that SAYS what is wrong is better.
    """
    try:
        return _read_tree()
    except Exception as exc:  # noqa: BLE001 - deliberately broad, reported in the file body
        return {
            "copilot-instructions.md": (
                "# Paracore — AI INSTRUCTIONS LOAD FAILURE\n\n"
                f"{exc}\n\n"
                "The scaffolded `.github/` instructions will be INCOMPLETE. Ship the generated "
                "tree `rap-server/server/api/ai_workspace/` alongside this module, and regenerate "
                "it with `python paracore/scripts/gen-ai-workspace.py --write`.\n"
            )
        }


#: {relative path under `.github/`: file text} — written verbatim by the scaffolder.
WORKSPACE_AI_FILES: dict[str, str] = _safe_read_tree()
