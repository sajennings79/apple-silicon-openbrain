import Foundation

/// Polls service health every 30s so the menu-bar status icon stays current.
@MainActor
final class HealthMonitor {
    private weak var state: AppState?
    private var timer: Timer?
    private let interval: TimeInterval

    init(state: AppState, interval: TimeInterval = 30) {
        self.state = state
        self.interval = interval
    }

    func start() {
        stop()
        Task { @MainActor in await self.probe() }
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.probe() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func probe() async {
        guard let state = state else { return }
        let health = await state.backend.probeHealth()
        state.serviceHealth = health
    }
}
