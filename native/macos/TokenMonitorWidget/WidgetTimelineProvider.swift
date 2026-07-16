import WidgetKit

struct TokenMonitorEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct TokenMonitorTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> TokenMonitorEntry {
        TokenMonitorEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (TokenMonitorEntry) -> Void) {
        completion(TokenMonitorEntry(date: Date(), snapshot: currentSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TokenMonitorEntry>) -> Void) {
        let now = Date()
        let entry = TokenMonitorEntry(date: now, snapshot: currentSnapshot())
        completion(Timeline(entries: [entry], policy: .after(now.addingTimeInterval(15 * 60))))
    }

    private func currentSnapshot() -> WidgetSnapshot? {
        WidgetSnapshot.load(appGroup: TokenMonitorWidgetConfiguration.appGroup)
    }
}

extension WidgetSnapshot {
    static let placeholder = WidgetSnapshot(
        schemaVersion: 1,
        generatedAt: Date(),
        today: WidgetToday(totalTokens: 128_400, costUsd: 1.84),
        tools: [WidgetTool(id: "codex", totalTokens: 98_400, costUsd: 1.22)],
        limits: [
            WidgetLimit(
                provider: "codex",
                status: "ok",
                updatedAt: Date(),
                windows: [
                    WidgetLimitWindow(
                        kind: "weekly",
                        usedPercent: 34,
                        remainingPercent: 66,
                        resetsAt: nil,
                        windowMinutes: 10_080
                    )
                ]
            )
        ]
    )
}
