import Foundation

/// Drives `/api/sources/poll-due` on a fixed interval. The backend decides
/// which individual sources are actually due — this scheduler is just the
/// heartbeat.
///
/// NOTE: as of the 3x/day Firecrawl-budget change, the production heartbeat is
/// owned by the launchd job `com.openbrain.poll` and `AppState.bootstrap()` no
/// longer calls `start()`. This type is retained for manual/debug use and so
/// the in-app timer can be re-enabled if launchd is ever removed; if you call
/// `start()`, you reintroduce a second heartbeat that scrapes between the
/// launchd windows.
@MainActor
final class Scheduler {
    private weak var state: AppState?
    private var timer: Timer?
    private let interval: TimeInterval

    init(state: AppState, interval: TimeInterval = 60 * 60) {
        self.state = state
        self.interval = interval
    }

    func start() {
        stop()
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.tick() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() async {
        guard let state = state else { return }
        await state.syncAllNow()
    }
}
