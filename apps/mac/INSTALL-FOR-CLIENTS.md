# OpenBrain — Install Guide

You have an early build of OpenBrain. It runs entirely on your Mac — your inbox, your notes, and the things you read all stay on your machine. No cloud accounts to set up, no monthly fees.

This guide takes about **15 minutes total**, most of which is the computer downloading models in the background while you do something else. We'll be on a call together for the first few minutes.

## Before you start

- A Mac with Apple Silicon (M1/M2/M3/M4). If "About This Mac" mentions an Intel chip, this won't run.
- macOS 14 (Sonoma) or newer.
- About **10 GB of free disk space** (most of it for the AI models).
- Internet connection for the initial setup.

## Step 1 — Unzip what I sent you

You should have received a file named something like `OpenBrain-Install-0.1.0.zip`. Double-click it. You'll get a folder with three things inside:

1. `OpenBrain.app` — the menu-bar app
2. `openbrain-engine.tar.gz` — the engine that does the real work
3. `INSTALL.md` — this file

## Step 2 — Put the engine in place

1. Open **Finder** and press <kbd>⇧⌘G</kbd> (Shift-Command-G).
2. Type `~/Developer` and press Return. If the folder doesn't exist, create it.
3. Drag `openbrain-engine.tar.gz` from the unzipped folder into `~/Developer`.
4. Double-click `openbrain-engine.tar.gz`. It expands into a folder.
5. **Rename** the expanded folder to exactly `openbrain` (no version number, no spaces).

You should now have `~/Developer/openbrain/` containing folders like `src/`, `ui/`, `installer/`, etc.

## Step 3 — Install the app

1. Drag `OpenBrain.app` into `/Applications`.
2. **Don't double-click it yet** — macOS will block it because Apple hasn't reviewed the app. We'll fix that on the call.

## Step 4 — First launch (do this with me on the call)

The first time you launch the app, macOS shows a warning. We'll get past it together:

- **The simple way**: Right-click `OpenBrain.app` in `/Applications`, choose **Open**, then in the dialog click **Open** again. After this, normal double-clicks work.
- If macOS still refuses: open System Settings → **Privacy & Security**, scroll down, and click **Open Anyway** next to the OpenBrain entry.

Once it launches, you'll see a brain icon next to the clock in your menu bar. Click it.

## Step 5 — Run the setup wizard

The first time you click the menu-bar icon, the **Setup Wizard** opens. It walks through:

1. Installing Homebrew (a tool that installs other tools), if you don't already have it.
2. Installing PostgreSQL (the database) and a few other packages.
3. Downloading the AI models — about **5 GB**, this takes the longest.
4. Starting the services in the background.

**You'll be asked for your Mac password once or twice** during the Homebrew install — that's normal.

When the wizard says "all green," you're done. The brain icon will go solid and you'll see four green dots in the dropdown — those are the four services that make up the engine.

## Step 6 — Start using it

Click the brain icon. From the dropdown:

- **Open Web UI** — see everything that's been remembered, search, browse.
- **Settings…** — add sources (Gmail accounts, RSS feeds, news sites).

We'll add your first sources together on the call.

## If something goes wrong

The most common issues:

- **"OpenBrain quit unexpectedly" right after first launch** — usually means the engine folder isn't where it expects (`~/Developer/openbrain`). Double-check the rename in Step 2.
- **Setup wizard hangs at "Downloading models"** — these are big files; give it 10 minutes on a normal connection. There's a progress log inside the wizard window.
- **Anything else** — text or call me. The app keeps a log at `~/Developer/openbrain/logs/` that I can read remotely if you screen-share.

## Uninstalling

If you ever want this gone, three things to clean up:

1. Drag `/Applications/OpenBrain.app` to the Trash.
2. Run `bash ~/Developer/openbrain/scripts/uninstall-services.sh` in Terminal (or ask me, I'll do it).
3. Delete `~/Developer/openbrain/`.

That's it — no remote accounts to cancel, no leftover files in obscure system folders.
