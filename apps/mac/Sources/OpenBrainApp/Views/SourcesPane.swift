import SwiftUI

struct SourcesPane: View {
    @Environment(AppState.self) private var state
    @State private var showingAdd = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Sources").font(.title2.weight(.semibold))
                Spacer()
                Button {
                    showingAdd = true
                } label: {
                    Label("Add", systemImage: "plus")
                }
                Button {
                    Task { await state.syncAllNow() }
                } label: {
                    Label("Sync All", systemImage: "arrow.triangle.2.circlepath")
                }
                .disabled(state.isSyncing)
            }

            if state.sources.isEmpty {
                empty
            } else {
                Table(state.sources) {
                    TableColumn("Name") { source in
                        VStack(alignment: .leading) {
                            Text(source.name).fontWeight(.medium)
                            Text(source.kind).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    TableColumn("Last sync") { source in
                        Text(formatDate(source.lastSyncedAt))
                            .font(.caption)
                            .foregroundStyle(source.lastError == nil ? Color.secondary : Color.red)
                    }
                    TableColumn("Interval") { source in
                        Text(formatInterval(source.intervalSeconds))
                            .font(.caption.monospacedDigit())
                    }
                    TableColumn("Enabled") { source in
                        Toggle("", isOn: enableBinding(for: source))
                            .labelsHidden()
                            .toggleStyle(.switch)
                    }
                    .width(70)
                    TableColumn("") { source in
                        HStack(spacing: 6) {
                            Button("Sync") {
                                Task { await state.syncSource(id: source.id) }
                            }
                            Button(role: .destructive) {
                                Task {
                                    try? await state.backend.deleteSource(id: source.id)
                                    await state.refreshSources()
                                }
                            } label: {
                                Image(systemName: "trash")
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                    .width(150)
                }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddSourceSheet(isPresented: $showingAdd)
                .environment(state)
        }
        .task { await state.refreshSources() }
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray").font(.largeTitle).foregroundStyle(.tertiary)
            Text("No sources yet").font(.headline)
            Text("Add an RSS feed, a mail account, or a web page to start pulling content into memory on a schedule.")
                .font(.caption).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func formatDate(_ iso: String?) -> String {
        guard let iso, let date = ISO8601DateFormatter().date(from: iso) else { return "—" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func formatInterval(_ seconds: Int) -> String {
        if seconds % 3600 == 0 { return "\(seconds / 3600)h" }
        if seconds % 60 == 0 { return "\(seconds / 60)m" }
        return "\(seconds)s"
    }

    private func enableBinding(for source: Source) -> Binding<Bool> {
        Binding(
            get: { source.enabled },
            set: { newValue in
                Task {
                    _ = try? await state.backend.updateSource(id: source.id, fields: ["enabled": newValue])
                    await state.refreshSources()
                }
            }
        )
    }
}

private struct AddSourceSheet: View {
    @Binding var isPresented: Bool
    @Environment(AppState.self) private var state

    @State private var kind = "rss"
    @State private var name = ""
    @State private var feedUrl = ""
    @State private var account = ""
    @State private var query = "newer_than:1d -in:promotions -in:spam"
    @State private var intervalMinutes = 60
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Add Source").font(.title3.weight(.semibold))

            Form {
                Picker("Kind", selection: $kind) {
                    Text("RSS feed").tag("rss")
                    Text("Mail (gog)").tag("mail")
                    Text("Web page").tag("webpage")
                }
                .pickerStyle(.segmented)

                TextField("Name", text: $name)

                if kind == "rss" || kind == "webpage" {
                    TextField(kind == "rss" ? "Feed URL" : "Page URL", text: $feedUrl)
                        .textFieldStyle(.roundedBorder)
                }

                if kind == "mail" {
                    TextField("Account", text: $account)
                    TextField("Gmail query", text: $query)
                    Text("Need to add a Gmail account first? Use the Mail tab.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Stepper(value: $intervalMinutes, in: 1...1440) {
                    Text("Sync every \(intervalMinutes) min")
                }
            }
            .formStyle(.grouped)

            if let error = error {
                Text(error).foregroundStyle(.red).font(.caption)
            }

            HStack {
                Button("Cancel") { isPresented = false }
                Spacer()
                Button("Add") { Task { await save() } }
                    .keyboardShortcut(.defaultAction)
                    .disabled(saving || !canSave)
            }
        }
        .padding(20)
        .frame(width: 480)
    }

    private var canSave: Bool {
        guard !name.isEmpty else { return false }
        switch kind {
        case "rss", "webpage": return !feedUrl.isEmpty
        case "mail": return !account.isEmpty
        default: return false
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var config: [String: Any] = [:]
        switch kind {
        case "rss":
            config["feedUrl"] = feedUrl
        case "webpage":
            config["url"] = feedUrl
        case "mail":
            config["account"] = account
            config["query"] = query
        default:
            break
        }
        do {
            _ = try await state.backend.createSource(
                kind: kind,
                name: name,
                config: config,
                intervalSeconds: intervalMinutes * 60,
            )
            await state.refreshSources()
            isPresented = false
        } catch {
            self.error = error.localizedDescription
        }
    }
}
