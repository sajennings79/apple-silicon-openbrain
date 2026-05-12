import Foundation
import Observation

@Observable
@MainActor
final class AppState {
    var sources: [Source] = []
    var recentMemories: [Memory] = []
    var serviceHealth: ServiceHealth = .init()
    var lastError: String?
    var isSyncing: Bool = false
    var lastSyncSummary: String?

    let backend = BackendClient()
    private(set) var scheduler: Scheduler?
    private(set) var healthMonitor: HealthMonitor?

    init() {
        scheduler = Scheduler(state: self)
        healthMonitor = HealthMonitor(state: self)
        Task { await self.bootstrap() }
    }

    /// Icon shown in the menu bar. SF Symbols name.
    var statusIcon: String {
        if let _ = lastError { return "exclamationmark.triangle.fill" }
        if isSyncing { return "arrow.triangle.2.circlepath" }
        if !serviceHealth.allUp { return "circle.dotted" }
        return "brain.head.profile"
    }

    func bootstrap() async {
        await refreshSources()
        await refreshRecentMemories()
        scheduler?.start()
        healthMonitor?.start()
    }

    func refreshSources() async {
        do {
            sources = try await backend.listSources()
        } catch {
            lastError = "Failed to load sources: \(error.localizedDescription)"
        }
    }

    func refreshRecentMemories() async {
        do {
            recentMemories = try await backend.recentMemories(limit: 5)
        } catch {
            // Silent: memories list is non-critical
        }
    }

    func syncAllNow() async {
        isSyncing = true
        defer { isSyncing = false }
        do {
            let report = try await backend.pollDue()
            lastSyncSummary = "Synced \(report.count) source\(report.count == 1 ? "" : "s")"
            await refreshSources()
            await refreshRecentMemories()
        } catch {
            lastError = "Sync failed: \(error.localizedDescription)"
        }
    }

    func syncSource(id: String) async {
        do {
            _ = try await backend.syncSource(id: id)
            await refreshSources()
            await refreshRecentMemories()
        } catch {
            lastError = "Sync failed: \(error.localizedDescription)"
        }
    }

    func clearError() {
        lastError = nil
    }
}
