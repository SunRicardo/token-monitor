import WidgetKit

struct TokenMonitorEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let page: WidgetPage
}

struct TokenMonitorTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> TokenMonitorEntry {
        TokenMonitorEntry(date: Date(), snapshot: .placeholder, page: .overview)
    }

    func snapshot(for configuration: TokenMonitorWidgetConfigurationIntent, in context: Context) async -> TokenMonitorEntry {
        TokenMonitorEntry(date: Date(), snapshot: currentSnapshot(), page: configuration.page)
    }

    func timeline(for configuration: TokenMonitorWidgetConfigurationIntent, in context: Context) async -> Timeline<TokenMonitorEntry> {
        let now = Date()
        let entry = TokenMonitorEntry(date: now, snapshot: currentSnapshot(), page: configuration.page)
        return Timeline(entries: [entry], policy: .after(now.addingTimeInterval(15 * 60)))
    }

    private func currentSnapshot() -> WidgetSnapshot? {
        WidgetSnapshot.load(appGroup: TokenMonitorWidgetConfiguration.appGroup)
    }
}

extension WidgetSnapshot {
    static let placeholder = WidgetSnapshot(
        schemaVersion: 2,
        generatedAt: Date(),
        overview: WidgetOverview(currentPeriod: "today", totalTokens: 27_800_000, costUsd: 14.86, primaryTool: "codex", updatedAt: Date()),
        quota: [WidgetQuotaProvider(provider: "codex", status: "ok", updatedAt: Date(), windows: [WidgetLimitWindow(kind: "weekly", usedPercent: 43, remainingPercent: 57, resetsAt: Date().addingTimeInterval(6 * 86_400), windowMinutes: 10_080)])],
        models: [WidgetModel(displayName: "GPT-5.6", totalTokens: 20_900_000, costUsd: 10, sharePercent: 75), WidgetModel(displayName: "MiMo", totalTokens: 2_900_000, costUsd: 2, sharePercent: 11)],
        activity: WidgetActivity(currentPeriod: "month", activeDays: 18, days: (1...28).map { WidgetActivityDay(date: "2026-07-\(String(format: "%02d", $0))", intensity: $0 % 5) }),
        trend: WidgetTrend(startDate: "07/04", endDate: "07/17", peakTokens: 4_200_000, currentTokens: 2_800_000, points: (1...14).map { WidgetTrendPoint(date: "\($0)", totalTokens: $0 * 200_000, costUsd: 0) }),
        presentation: .default,
        status: WidgetStatus(isStale: false, dataAgeSeconds: 30, providerConfigured: true, providerNeedsLogin: false, noData: false)
    )
}
