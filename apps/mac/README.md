# OpenBrain — Mac menu-bar app

Native Swift / SwiftUI menu-bar app that wraps the OpenBrain engine.

## Build & run

This is a Swift Package. The fastest way to iterate (debug + immediate launch in menu bar):

```bash
cd apps/mac
swift run
```

To produce a real `OpenBrain.app` bundle:

```bash
cd apps/mac
bash build-app.sh             # → .build/OpenBrain.app
bash build-app.sh --install   # → /Applications/OpenBrain.app
```

The build script does `swift build -c release`, then wraps the executable in `OpenBrain.app/Contents/{MacOS,Info.plist}`. `Info.plist` lives in `AppBundle/` (kept outside `Sources/` because SwiftPM forbids it as a resource).

First launch from `/Applications` will trigger Gatekeeper because the app is unsigned (codesigning + notarization is deferred — see plan). Right-click → Open → Open to bypass once; subsequent launches are clean.

You can also open `Package.swift` in Xcode and use Xcode's archive flow.

## Layout

```
apps/mac/
├── Package.swift
├── build-app.sh                Wraps SwiftPM output into OpenBrain.app
├── AppBundle/Info.plist        LSUIElement = true, bundle metadata
└── Sources/OpenBrainApp/
    ├── App/                    Top-level @main, AppState, FirstRunCoordinator
    ├── Services/               BackendClient, Scheduler, LaunchdManager, GogShell, …
    └── Views/                  MenuBarPopover, InstallerWindow, SettingsWindow + tabs
```

## How it talks to the engine

The app is a thin client over the localhost MCP server (`6277`) and UI server (`6279`):

| Concern | Endpoint |
|---|---|
| List/create/update/delete sources | `http://127.0.0.1:6277/api/sources` |
| Sync a source now | `POST /api/sources/:id/sync` |
| Scheduler tick (every 5 min) | `POST /api/sources/poll-due` |
| Recent memories for the popover | `GET http://127.0.0.1:6279/api/memories?limit=5` |
| Health probes (every 30s) | `/health` (mcp/embed/ui), `/v1/models` (llm) |

It never touches Postgres directly. Service lifecycle stays with launchd; the app just calls `launchctl kickstart -k gui/<uid>/com.openbrain.<svc>` to restart.

## Status (Phase 3+ skeleton)

- ✅ Menu bar popover with status icon, "Sync now", "Open Web UI", health dots, recent memories
- ✅ Sources pane (Phase 3) — list, add, delete, sync, toggle enabled
- ✅ Mail pane (Phase 6 polish) — `gog auth add` Terminal handoff, `.env` shortcut
- ✅ Services pane — health dots + per-service "Restart" via `launchctl kickstart`
- ✅ Agents pane (Phase 5) — scans `agents/prompts/` (shipped) and `~/Developer/claude-cron/prompts/` (user); "Run now" invokes `agents/run-agent.sh`
- ✅ First-run installer wizard (Phase 4) — streams `installer/bootstrap.sh` output, surfaces phase progress
- ⏳ App bundle build script (signed/notarized — deferred per plan)
- ⏳ Per-source interval slider polish, error pop-overs, agent log capture
