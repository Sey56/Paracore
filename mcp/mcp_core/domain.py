"""The DOMAIN — the only thing that differs between two Paracore MCPs.

An MCP server is **the shared core + a Domain**. The Domain names the server, carries
the domain-specific instructions, and points at the domain's own skills and prompt
overrides. Everything else — the eight REPL tools, the skill delivery, the resources,
the dialog watcher, the metrics, the C# lint — belongs to the core and is written once,
here.

    paracore/mcp/mcp_core/     ← the shared core  (this package)
    paracore-model/            ← a Domain: skills/ + prompts/ + a few lines of server

⚠ WHY THE SKILLS ARE *TOOLS* HERE, NOT *RESOURCES*.
    A skill used to be an MCP resource with a templated URI (`skill://{name}/SKILL.md`).
    Templated resources are discovered through `resources/templates/list` — and Claude
    Desktop never calls it. Measured over 70 sessions of `%LOCALAPPDATA%\\Claude\\logs\\mcp.log`:

        tools/list                 70
        resources/list             70
        resources/templates/list    0      ← so the 11 skills were NEVER discovered
        resources/read              0      ← and the static resources were never read either

    The model's only guidance was the `instructions=` string, so it fell back to the raw
    Revit API instead of the skill recipes. The skills are therefore served as TOOLS
    (`list_skills` / `read_skill`), which every client supports. The `skill://` resources
    are KEPT as well, for clients that do read them (MCP Inspector, VS Code); they cost
    nothing and are simply redundant on a client that cannot.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Callable

# ── Where the core keeps its own data ────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
SHARED_SKILLS_DIR = os.path.join(_HERE, "skills")
SHARED_PROMPTS_DIR = os.path.join(_HERE, "prompts")


@dataclass(frozen=True)
class SkillSpec:
    """One skill the server offers the model."""

    name: str
    description: str


@dataclass(frozen=True)
class Domain:
    """What makes THIS MCP different from the others.

    Everything here is the repo's OWN: its name, its instructions preamble, its skills,
    its prompt overrides, its extra tools. Everything NOT here is shared.
    """

    name: str
    """The MCP server name shown to the client, e.g. "Paracore-Model"."""

    slug: str
    """Short id — the metrics filename and the log name, e.g. "model"."""

    intro: str
    """Domain instructions (markdown). Appended AFTER the common rules, before the
    skill catalogue. ⚠ Keep it to what is TRUE ONLY OF THIS DOMAIN — anything true of
    every MCP belongs in `server.COMMON_RULES`."""

    root: str
    """The owning repo's root — where `skills/` and `prompts/` live. In a frozen build
    this is the bundle dir; in dev it is the directory holding the server file."""

    skills: tuple[SkillSpec, ...] = ()
    """The DOMAIN skills. The nine shared ones are added automatically — unless
    `shared_skills` says otherwise."""

    shared_skills: tuple[str, ...] | None = None
    """WHICH of the core's shared skills to include.

    `None` (the default) = all nine — what `model`/`family` want, because they author REPL
    C# and the shared skills ARE that vocabulary. ⚠ `gen` passes an explicit tuple instead:
    it is the GENERALIST, and it does not teach `create-geometry`, because modelling is
    `paracore-model`'s job (operator, 2026-10-27).

    A tuple = only those names. An EMPTY tuple = none — for a domain whose work is not
    REPL C#. ⚠ `paracore-forge` passes `()`: it authors gallery scripts, and its own
    `forge-reference` skill is the whole generated extension-method API, so the nine were
    a redundant second copy of it. ⚠ Measured 2026-10-13: the gallery/script path runs
    REPL-style code verbatim (a script with NO `Params` class compiles and executes
    through `ExecuteScript`), so Forge needs no separate REPL generation/execution.

    ⚠ `load_skill_text` still searches the shared dir, so naming a shared skill here is
    the ONLY way to get it — the flag filters the CATALOGUE, it does not wall off the files.
    """

    prompt_overrides: tuple[str, ...] = ()
    """Prompt section filenames this repo replaces (e.g. ("catalog.md",)). Anything not
    listed is read from the shared core."""

    extra_tools: tuple[Callable, ...] = ()
    """Domain tools beyond the common eight. Registered as-is."""


# ── Where a domain keeps its own data ────────────────────────────────────────

def domain_skills_dir(domain: Domain) -> str:
    """`<repo>/skills/` — the domain's own skills."""
    return os.path.join(domain.root, "skills")


def domain_prompts_dir(domain: Domain) -> str:
    """`<repo>/prompts/` — the domain's prompt overrides."""
    return os.path.join(domain.root, "prompts")


# ── Skill reading ────────────────────────────────────────────────────────────

def admitted_shared_names(domain: Domain) -> tuple[str, ...]:
    """The core's shared skills THIS domain takes, in catalogue order.

    `shared_skills is None` (the default) = all nine. Otherwise exactly the names given.
    ⚠ ONE place decides this, so the CATALOGUE and `load_skill_text` cannot disagree.
    """
    from mcp_core.shared_skills import SHARED_SKILL_DESCRIPTIONS

    if domain.shared_skills is None:
        return tuple(SHARED_SKILL_DESCRIPTIONS)

    # ⚠ A name that does not exist RAISES. Dropping it silently would advertise a skill
    #   that `read_skill` cannot load — a gate that quietly passes is not a gate.
    unknown = [n for n in domain.shared_skills if n not in SHARED_SKILL_DESCRIPTIONS]
    if unknown:
        raise ValueError(
            f"Domain {domain.name!r} names shared skill(s) that do not exist: {unknown}. "
            f"Available: {sorted(SHARED_SKILL_DESCRIPTIONS)}"
        )
    return tuple(domain.shared_skills)


def load_skill_text(domain: Domain, name: str) -> str | None:
    """The SKILL.md body for `name`, or None if this domain does not offer it.

    ⚠ The DOMAIN's directory wins: a repo may override a shared skill deliberately.
    ⚠⚠ A SHARED skill is readable ONLY if `admitted_shared_names` takes it. Searching the
    shared dir unconditionally made `read_skill` serve skills `list_skills` never
    advertised — MEASURED 2026-10-13: with Forge on `shared_skills=()`, `list_skills` said
    5 while `read_skill("query-filter")` still returned the whole REPL skill. The two must
    agree, or the catalogue's claim to be "the authoritative list" is false.
    """
    bases = [domain_skills_dir(domain)]
    if name in admitted_shared_names(domain):
        bases.append(SHARED_SKILLS_DIR)

    for base in bases:
        path = os.path.join(base, name, "SKILL.md")
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except OSError:
                continue
    return None


def skill_catalogue(domain: Domain) -> tuple[SkillSpec, ...]:
    """The shared skills this domain takes + its own, in that order."""
    from mcp_core.shared_skills import SHARED_SKILL_DESCRIPTIONS

    shared = tuple(
        SkillSpec(name=n, description=SHARED_SKILL_DESCRIPTIONS[n])
        for n in admitted_shared_names(domain)
    )
    return shared + domain.skills


def render_catalogue_markdown(domain: Domain) -> str:
    """The skill catalogue as markdown — embedded in the server instructions so the
    model always knows what exists, even before it calls `list_skills`."""
    lines = ["SKILLS — call read_skill(\"<name>\") to get one:"]
    for spec in skill_catalogue(domain):
        lines.append(f"  - {spec.name} — {spec.description}")
    return "\n".join(lines)


# ── Prompt sections (with per-domain overrides) ──────────────────────────────

def read_prompt_section(domain: Domain, filename: str) -> str:
    """One prompt section, preferring the domain's override.

    ⚠ A domain that lists `filename` in `prompt_overrides` but does not actually ship
    the file falls back to the shared copy — a missing override must never silently
    blank a section (an empty scan must FAIL, not pass quietly).
    """
    candidates = []
    if filename in domain.prompt_overrides:
        candidates.append(os.path.join(domain_prompts_dir(domain), filename))
    candidates.append(os.path.join(SHARED_PROMPTS_DIR, filename))
    for path in candidates:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except OSError:
            continue
    return f"[Prompt section not found: {filename}]"
