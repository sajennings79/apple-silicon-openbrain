import AppKit
import SwiftUI

struct MenuBarPopover: View {
    @Environment(AppState.self) private var state
    @Environment(\.openWindow) private var openWindow

    /// LSUIElement apps don't get focus by default when opening windows from
    /// a menu-bar popover. Activate first so the window comes forward.
    private func showWindow(_ id: String) {
        NSApp.activate(ignoringOtherApps: true)
        openWindow(id: id)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            Divider()
            servicesRow
            Divider()
            recentMemoriesSection
            Divider()
            actionsRow
        }
        .padding(12)
        .task { await state.refreshRecentMemories() }
    }

    private var header: some View {
        HStack {
            Text("OpenBrain")
                .font(.headline)
            Spacer()
            if state.isSyncing {
                ProgressView().controlSize(.small)
            }
            if let summary = state.lastSyncSummary {
                Text(summary).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var servicesRow: some View {
        HStack(spacing: 16) {
            healthDot(label: "MCP", up: state.serviceHealth.mcp)
            healthDot(label: "Embed", up: state.serviceHealth.embed)
            healthDot(label: "LLM", up: state.serviceHealth.llm)
            healthDot(label: "UI", up: state.serviceHealth.ui)
        }
        .font(.caption)
    }

    private func healthDot(label: String, up: Bool) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(up ? Color.green : Color.red)
                .frame(width: 8, height: 8)
            Text(label).foregroundStyle(.secondary)
        }
    }

    private var recentMemoriesSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Recent")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            if state.recentMemories.isEmpty {
                Text("No memories yet")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                ForEach(state.recentMemories.prefix(5)) { memory in
                    HStack(alignment: .top, spacing: 6) {
                        if let source = memory.source {
                            Text(source.uppercased())
                                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .frame(width: 50, alignment: .leading)
                        }
                        Text(memory.summary?.isEmpty == false ? memory.summary! : String(memory.content.prefix(80)))
                            .font(.caption)
                            .lineLimit(2)
                            .truncationMode(.tail)
                    }
                }
            }
        }
    }

    private var actionsRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                Task { await state.syncAllNow() }
            } label: {
                Label("Sync now", systemImage: "arrow.triangle.2.circlepath")
            }
            .keyboardShortcut("s", modifiers: [.command])

            Button {
                openWebUI()
            } label: {
                Label("Open Web UI", systemImage: "safari")
            }

            Button {
                showWindow("settings")
            } label: {
                Label("Settings…", systemImage: "gearshape")
            }
            .keyboardShortcut(",", modifiers: [.command])

            Button {
                showWindow("installer")
            } label: {
                Label("Run Setup Wizard…", systemImage: "wand.and.rays")
            }

            if state.lastError != nil {
                Button(role: .destructive) { state.clearError() } label: {
                    Label("Dismiss error", systemImage: "xmark.circle")
                }
            }

            Divider()

            Button("Quit OpenBrain") { NSApplication.shared.terminate(nil) }
                .keyboardShortcut("q", modifiers: [.command])
        }
        .buttonStyle(.borderless)
        .controlSize(.small)
    }

    private func openWebUI() {
        if let url = URL(string: "http://localhost:6279") {
            NSWorkspace.shared.open(url)
        }
    }
}
