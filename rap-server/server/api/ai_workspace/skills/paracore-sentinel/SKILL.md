---
name: paracore-sentinel
description: How to write a gallery script that can also be DEPLOYED as a sentinel — a background check the desktop app re-runs on an interval while Revit is idle. Covers the Watchdog/WatchdogReport API, the mandatory two-call contract the deployer greps for, the __sentinel_action__ protocol (select/isolate/table), and what the callback can and cannot do. Read this when the user wants the script to keep watching the model, not just run once.
---

# Sentinels — a gallery script that keeps running

A **sentinel** is not a second kind of file. It is an ordinary gallery script in `Scripts/` that
calls `Watchdog(...)`, which is what makes it **deployable**: the operator arms it in the desktop
app and Revit then re-runs your check in the background, on idle, every N seconds, until they
undeploy it.

So the script must work **twice**: once as a normal Run, and once as a background loop.

## The contract the deployer enforces

⚠⚠ **The source must contain BOTH `Watchdog(` and `WatchdogReport`.** The desktop app scans the
combined script text before it deploys anything; a project with only one of the two is
**skipped and reported as a failed deployment** ("No Watchdog() or WatchdogReport found in
code"). This is a text scan, not a semantic one — a `WatchdogReport` that is commented out still
counts, and a helper file that is never referenced does not. Put both calls in the entry file.

## The API

```text
// Signatures — declarations, not runnable code.
// Run `callback` on Revit idle, at most once every `intervalSeconds` (default 5).
void Watchdog(Action callback,            int intervalSeconds = 5);
void Watchdog(Action<Document> callback,  int intervalSeconds = 5);

// Publish the result of the last run to the desktop app's sentinel panel.
// status: "success" | "warning" | "error".  data: optional — a list of elements or ids.
void WatchdogReport(string summary, string status = "success", object? data = null);
```

`WatchdogReport` is how the sentinel says something. Without it the app can only show "ran";
with it the panel shows a summary, a colour and the offending elements.

⚠ These two live **here**, not in the `paracore-engine` reference — the engine index deliberately
omits them. Do not go looking for them there, and do not conclude they are unavailable.

## What `Watchdog` does in each mode

| How the script was started | What `Watchdog` does |
|---|---|
| **Run** in the gallery (or by the user) | Runs the callback **once**, prints `[INFO] Running Watchdog logic in Manual Test mode (no background registration).`, returns. Nothing is armed. |
| **Deploy** from the desktop app | Runs the script once to **register** the callback; from then on the app calls the callback on idle, at the interval. |

That is why the same script is both testable and deployable: a Run is a manual test, a Deploy is
the real thing. **Deploying and undeploying is the operator's job in the desktop app.** Nothing in
this workspace can arm or disarm a sentinel, and you should not try.

## Shape

```csharp
// Sentinel: walls shorter than Params.MinLength.
Watchdog(() =>
{
    var p = new Params();                       // inside the callback — see "snapshot" below

    // ⚠ [Unit("mm")] means the UI takes mm and the property ARRIVES in internal feet — the
    //   same units GetNum(name) returns when you pass no unit. Compare those two directly;
    //   convert only for the sentence a human reads.
    var shortWalls = GetElements<Wall>()
        .Where(w => w.GetNum("Length") < p.MinLength)
        .ToList();

    string action = ExecutionGlobals.Get<string>("__sentinel_action__")?.ToLowerInvariant() ?? "";

    if (action == "select")
    {
        Select(shortWalls);
    }
    else if (action == "isolate")
    {
        Transact("Isolate short walls", () => Isolate(shortWalls));
    }
    else if (action == "table")
    {
        shortWalls.Table();
    }
    else                                        // deployed run — the only branch that matters
    {
        string limit = p.MinLength.FormatUnit("mm");     // display only — never compare on this

        WatchdogReport(
            shortWalls.Count == 0
                ? "All walls meet the minimum length."
                : $"{shortWalls.Count} wall(s) below {limit}.",
            shortWalls.Count == 0 ? "success" : "warning",
            shortWalls.Select(w => w.Id).ToList());

        if (string.IsNullOrEmpty(action))       // a manual Run should still SHOW something
        {
            Println($"Found {shortWalls.Count} short wall(s) below {limit}.");
            shortWalls.Table();
        }
    }
});

public class Params
{
    [Unit("mm")]
    public double MinLength { get; set; } = 2000;
}
```

### The `__sentinel_action__` protocol

The desktop app runs the same script with a different action so its panel buttons work without
you writing a second script:

| `__sentinel_action__` | Do this |
|---|---|
| `"select"` | `Select(elements)` |
| `"isolate"` | `Transact("…", () => Isolate(elements))` |
| `"table"` | `elements.Table()` |
| `""` (empty) | The **deployed** branch: compute, then `WatchdogReport(...)`. |

Read it with `ExecutionGlobals.Get<string>("__sentinel_action__")` and treat anything unrecognised
as the deployed branch. Never report from the `select` / `isolate` / `table` branches — those are
interactive, not monitoring.

## What the callback gets — and what it must not do

- **`Doc` is the ACTIVE document**, resolved at each run. If the user switches documents, the next
  run sees the other one. Read `Doc.Title` / `Doc.PathName` if the check is document-specific.
- **Runs on Revit's UI thread, on idle.** It is not a background thread, so the Revit API is
  legal — but every millisecond you take is taken from the user's session.
- **There is no ambient transaction.** Reads need none; any write needs `Transact(...)`.
- **Keep it fast and non-interactive.** No `Task.Delay`, no `Thread.Sleep`, no modal dialog, no
  object pick, no `SaveAs`. A sentinel that blocks the UI thread is worse than no sentinel.
- **An exception is logged, not surfaced.** The app records the failure and the interval keeps
  running — so validate your inputs inside the callback rather than assuming they are sane.
- The interval is a **floor**, not a schedule: runs are skipped while Revit is busy, so do not
  measure elapsed time between runs.

## `Params` are snapshotted at deploy

The values live in the gallery configurator, and deploying captures them. A sentinel runs with the
values it was **deployed** with — changing a slider afterwards does not reach the running loop
until it is undeployed and deployed again. Read `Params` **inside** the callback so the object is
built from whatever the current context carries, and never cache a computed result across runs.

## Checklist before you call it done

1. `Watchdog(` **and** `WatchdogReport(` are both in the entry file, uncommented.
2. The callback does its own query every run — nothing is cached from registration time.
3. The empty-action branch reports exactly once per run, with a `status` that reflects reality
   (`"success"` when clean — a sentinel that always warns trains the user to ignore it).
4. `select` / `isolate` / `table` exist and are wired to `__sentinel_action__`.
5. A manual Run prints or tables its result, so the user can see it without deploying.
6. Writes are inside `Transact`; nothing opens a dialog; nothing sleeps.
