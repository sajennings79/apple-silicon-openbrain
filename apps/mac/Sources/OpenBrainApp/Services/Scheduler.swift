import Foundation

/// Drives `/api/sources/poll-due` on a fixed interval. The backend decides
/// which individual sources are actually due — this scheduler is just the
/// heartbeat.
@MainActor
final class Scheduler {
    private weak var state: AppState?
    private var timer: Timer?
    private let interval: TimeInterval

    init(state: AppState, interval: TimeInterval = 5 * 60) {
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
