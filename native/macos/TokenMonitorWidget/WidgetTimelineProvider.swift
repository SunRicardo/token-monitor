import WidgetKit

struct TokenMonitorEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let page: WidgetPage
    let period: WidgetPeriod
}

struct TokenMonitorTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> TokenMonitorEntry {
        TokenMonitorEntry(date: Date(), snapshot: .placeholder.selecting(.day), page: .overview, period: .day)
    }

    func snapshot(for configuration: TokenMonitorWidgetConfigurationIntent, in context: Context) async -> TokenMonitorEntry {
        let period = currentPeriod()
        return TokenMonitorEntry(date: Date(), snapshot: currentSnapshot(period: period), page: configuration.page, period: period)
    }

    func timeline(for configuration: TokenMonitorWidgetConfigurationIntent, in context: Context) async -> Timeline<TokenMonitorEntry> {
        let now = Date()
        let period = currentPeriod()
        let entry = TokenMonitorEntry(date: now, snapshot: currentSnapshot(period: period), page: configuration.page, period: period)
        return Timeline(entries: [entry], policy: .after(now.addingTimeInterval(15 * 60)))
    }

    private func currentPeriod() -> WidgetPeriod {
        WidgetPresentationStateStore.shared.selectedPeriod()
    }

    private func currentSnapshot(period: WidgetPeriod) -> WidgetSnapshot? {
        WidgetSnapshot.load(appGroup: TokenMonitorWidgetConfiguration.appGroup)?.selecting(period)
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
        periods: [
            .day: WidgetPeriodSnapshot(
                overview: WidgetOverview(currentPeriod: "today", totalTokens: 27_800_000, costUsd: 14.86, primaryTool: "codex", updatedAt: Date()),
                models: [WidgetModel(displayName: "GPT-5.6", totalTokens: 20_900_000, costUsd: 10, sharePercent: 75), WidgetModel(displayName: "MiMo", totalTokens: 2_900_000, costUsd: 2, sharePercent: 11)],
                activity: WidgetActivity(currentPeriod: "today", activeDays: 1, days: (1...7).map { WidgetActivityDay(date: "2026-07-\(String(format: "%02d", $0))", intensity: $0 == 7 ? 4 : 0) }),
                trend: WidgetTrend(startDate: "07/04", endDate: "07/17", peakTokens: 4_200_000, currentTokens: 2_800_000, points: (1...14).map { WidgetTrendPoint(date: "\($0)", totalTokens: $0 * 200_000, costUsd: 0) })
            ),
            .month: WidgetPeriodSnapshot(
                overview: WidgetOverview(currentPeriod: "month", totalTokens: 61_200_000, costUsd: 237.42, primaryTool: "codex", updatedAt: Date()),
                models: [WidgetModel(displayName: "GPT-5.6", totalTokens: 44_000_000, costUsd: 120, sharePercent: 72), WidgetModel(displayName: "MiMo", totalTokens: 7_000_000, costUsd: 10, sharePercent: 11)],
                activity: WidgetActivity(currentPeriod: "month", activeDays: 18, days: (1...28).map { WidgetActivityDay(date: "2026-07-\(String(format: "%02d", $0))", intensity: $0 % 5) }),
                trend: WidgetTrend(startDate: "07/04", endDate: "07/17", peakTokens: 9_200_000, currentTokens: 4_800_000, points: (1...14).map { WidgetTrendPoint(date: "\($0)", totalTokens: $0 * 340_000, costUsd: 0) })
            ),
            .total: WidgetPeriodSnapshot(
                overview: WidgetOverview(currentPeriod: "allTime", totalTokens: 180_000_000, costUsd: 620.15, primaryTool: "codex", updatedAt: Date()),
                models: [WidgetModel(displayName: "GPT-5.6", totalTokens: 120_000_000, costUsd: 220, sharePercent: 67), WidgetModel(displayName: "MiMo", totalTokens: 30_000_000, costUsd: 38, sharePercent: 17)],
                activity: WidgetActivity(currentPeriod: "allTime", activeDays: 64, days: (1...42).map { WidgetActivityDay(date: "2026-07-\(String(format: "%02d", (($0 - 1) % 28) + 1))", intensity: $0 % 5) }),
                trend: WidgetTrend(startDate: "01/01", endDate: "07/17", peakTokens: 18_200_000, currentTokens: 12_800_000, points: (1...14).map { WidgetTrendPoint(date: "\($0)", totalTokens: $0 * 900_000, costUsd: 0) })
            )
        ],
        presentation: .default,
        status: WidgetStatus(isStale: false, dataAgeSeconds: 30, providerConfigured: true, providerNeedsLogin: false, noData: false)
    )
}
