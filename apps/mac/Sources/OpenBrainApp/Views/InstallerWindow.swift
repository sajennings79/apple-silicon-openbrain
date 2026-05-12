import SwiftUI

struct InstallerWindow: View {
    @State private var coordinator = FirstRunCoordinator()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("OpenBrain Setup")
                .font(.largeTitle.weight(.bold))
            Text("Walks through everything OpenBrain needs to run locally — Homebrew packages, the embedding model, the local LLM, and the launchd services. Idempotent, so safe to re-run.")
                .font(.callout).foregroundStyle(.secondary)

            Divider()

            steps

            Divider()

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 1) {
                        ForEach(Array(coordinator.logLines.enumerated()), id: \.offset) { i, line in
                            Text(line)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .id(i)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(8)
                }
                .background(.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 6))
                .frame(maxHeight: 240)
                .onChange(of: coordinator.logLines.count) { _, _ in
                    if let last = coordinator.logLines.indices.last {
                        proxy.scrollTo(last, anchor: .bottom)
                    }
                }
            }

            HStack {
                if let failure = coordinator.failure {
                    Label(failure, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .font(.callout)
                }
                Spacer()
                if coordinator.completed {
                    Button("Close") { NSApp.keyWindow?.close() }
                        .keyboardShortcut(.defaultAction)
                } else {
                    Button(coordinator.running ? "Running…" : "Start install") {
                        Task { await coordinator.runBootstrap() }
                    }
                    .disabled(coordinator.running)
                    .keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding(24)
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(FirstRunCoordinator.Phase.allCases) { phase in
                HStack(spacing: 8) {
                    icon(for: phase)
                    Text(phase.rawValue)
                        .foregroundStyle(phase == coordinator.current ? .primary : .secondary)
                        .fontWeight(phase == coordinator.current ? .semibold : .regular)
                }
            }
        }
    }

    @ViewBuilder
    private func icon(for phase: FirstRunCoordinator.Phase) -> some View {
        if phase == .done && coordinator.completed {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        } else if phase == coordinator.current && coordinator.running {
            ProgressView().controlSize(.small)
        } else if let currentIdx = FirstRunCoordinator.Phase.allCases.firstIndex(of: coordinator.current),
                  let phaseIdx = FirstRunCoordinator.Phase.allCases.firstIndex(of: phase),
                  phaseIdx < currentIdx {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        } else {
            Image(systemName: "circle").foregroundStyle(.secondary)
        }
    }
}
