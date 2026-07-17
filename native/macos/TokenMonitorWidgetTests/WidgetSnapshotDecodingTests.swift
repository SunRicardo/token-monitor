import XCTest

final class WidgetSnapshotDecodingTests: XCTestCase {
    func testDecodesSchemaV3AndSelectsPeriods() throws {
        let snapshot = try decode("""
        {"schemaVersion":3,"generatedAt":"2026-07-17T09:00:00.000Z","periods":{"day":{"overview":{"currentPeriod":"today","totalTokens":100,"costUsd":1,"updatedAt":"2026-07-17T08:59:00.000Z"},"models":[{"displayName":"day-model","totalTokens":100,"sharePercent":100}],"activity":{"currentPeriod":"today","activeDays":1,"days":[]},"trend":{"peakTokens":100,"currentTokens":100,"points":[]}},"month":{"overview":{"currentPeriod":"month","totalTokens":200,"costUsd":2,"updatedAt":"2026-07-17T08:59:00.000Z"},"models":[{"displayName":"month-model","totalTokens":200,"sharePercent":100}],"activity":{"currentPeriod":"month","activeDays":2,"days":[]},"trend":{"peakTokens":200,"currentTokens":200,"points":[]}},"total":{"overview":{"currentPeriod":"allTime","totalTokens":300,"costUsd":3,"updatedAt":"2026-07-17T08:59:00.000Z"},"models":[{"displayName":"total-model","totalTokens":300,"sharePercent":100}],"activity":{"currentPeriod":"allTime","activeDays":3,"days":[]},"trend":{"peakTokens":300,"currentTokens":300,"points":[]}}},"quota":[],"presentation":{"currencySymbol":"¥"},"status":{"isStale":false,"dataAgeSeconds":60,"providerConfigured":true,"providerNeedsLogin":false,"noData":false}}
        """)
        XCTAssertEqual(snapshot.schemaVersion, 3)
        XCTAssertEqual(snapshot.overview.totalTokens, 100)
        XCTAssertEqual(snapshot.selecting(.day).models.first?.displayName, "day-model")
        XCTAssertEqual(snapshot.selecting(.month).overview.totalTokens, 200)
        XCTAssertEqual(snapshot.selecting(.total).activity.activeDays, 3)
        XCTAssertEqual(snapshot.selecting(.total).trend.currentTokens, 300)
    }

    func testDecodesSchemaV2() throws {
        let snapshot = try decode("""
        {"schemaVersion":2,"generatedAt":"2026-07-17T09:00:00.000Z","overview":{"currentPeriod":"today","totalTokens":42000000,"costUsd":14.5,"updatedAt":"2026-07-17T08:59:00.000Z"},"quota":[{"provider":"codex","status":"ok","windows":[{"kind":"weekly","remainingPercent":57}]}],"models":[{"displayName":"GPT-5.6","totalTokens":30000000,"sharePercent":71}],"activity":{"currentPeriod":"month","activeDays":18,"days":[{"date":"2026-07-17","intensity":4}]},"trend":{"peakTokens":5000000,"currentTokens":3000000,"points":[]},"presentation":{"currencyCode":"USD","currencySymbol":"$","currencyRate":1,"numberStyle":"compact","showCost":true},"status":{"isStale":false,"dataAgeSeconds":60,"providerConfigured":true,"providerNeedsLogin":false,"noData":false}}
        """)
        XCTAssertEqual(snapshot.schemaVersion, 2)
        XCTAssertEqual(snapshot.overview.totalTokens, 42_000_000)
        XCTAssertEqual(snapshot.quota.first?.windows.first?.remainingPercent, 57)
        XCTAssertEqual(snapshot.models.first?.displayName, "GPT-5.6")
        XCTAssertEqual(snapshot.activity.activeDays, 18)
        XCTAssertEqual(snapshot.trend.currentTokens, 3_000_000)
    }

    func testDecodesLegacyV1WithoutBlankingWidget() throws {
        let snapshot = try decode("""
        {"schemaVersion":1,"generatedAt":"2026-07-16T09:00:00.000Z","today":{"totalTokens":42,"costUsd":0.5},"tools":[{"id":"codex","totalTokens":42,"costUsd":0.5}],"limits":[{"provider":"codex","status":"notConfigured","windows":[]}]}
        """)
        XCTAssertEqual(snapshot.schemaVersion, 1)
        XCTAssertEqual(snapshot.overview.totalTokens, 42)
        XCTAssertEqual(snapshot.quota.first?.displayStatus, "未配置")
        XCTAssertFalse(snapshot.isEmpty)
    }

    func testMissingFieldsUseFallbacksAndDoNotCrash() throws {
        let snapshot = try decode("{\"schemaVersion\":2,\"generatedAt\":\"2026-07-17T09:00:00Z\",\"overview\":{\"totalTokens\":7},\"presentation\":{\"currencySymbol\":\"¥\"}}")
        XCTAssertEqual(snapshot.overview.totalTokens, 7)
        XCTAssertEqual(snapshot.overview.currentPeriod, "today")
        XCTAssertEqual(snapshot.presentation.currencySymbol, "¥")
        XCTAssertEqual(snapshot.presentation.currencyRate, 1)
        XCTAssertTrue(snapshot.quota.isEmpty)
        XCTAssertTrue(snapshot.models.isEmpty)
    }

    func testRejectsInvalidGeneratedTimestamp() {
        XCTAssertThrowsError(try decode("{\"schemaVersion\":2,\"generatedAt\":\"not-a-date\"}"))
    }

    func testStatusMappingNeverExposesInternalEnums() {
        XCTAssertEqual(provider(status: "notConfigured").displayStatus, "未配置")
        XCTAssertEqual(provider(status: "unauthorized").displayStatus, "需要重新登录")
        XCTAssertEqual(provider(status: "sessionExpired").displayStatus, "需要重新登录")
        XCTAssertEqual(provider(status: "unavailable").displayStatus, "暂不可用")
        XCTAssertEqual(provider(status: "unexpectedInternalValue").displayStatus, "暂不可用")
    }

    func testAllFiveIntentPagesAreIndependentValues() {
        XCTAssertEqual(WidgetPage.allCases.map(\.rawValue), ["overview", "quota", "models", "activity", "trend"])
        var first = TokenMonitorWidgetConfigurationIntent()
        var second = TokenMonitorWidgetConfigurationIntent()
        first.page = .overview
        second.page = .models
        XCTAssertNotEqual(first.page, second.page)
    }

    func testSmallMediumAndLargeViewModelsBoundRowsAndPreserveLongNames() throws {
        let snapshot = try decode("""
        {"schemaVersion":2,"generatedAt":"2026-07-17T09:00:00Z","overview":{"totalTokens":10},"models":[{"displayName":"A very long provider model name that must stay on one line","totalTokens":7,"sharePercent":70},{"displayName":"Second","totalTokens":2,"sharePercent":20},{"displayName":"Third","totalTokens":1,"sharePercent":10}],"status":{"noData":false}}
        """)
        let small = WidgetViewModel.make(snapshot: snapshot, page: .models, layout: .small)
        let medium = WidgetViewModel.make(snapshot: snapshot, page: .models, layout: .medium)
        let large = WidgetViewModel.make(snapshot: snapshot, page: .models, layout: .large)
        XCTAssertTrue(small.primaryValue.hasPrefix("A very long"))
        XCTAssertEqual(small.rows.count, 1)
        XCTAssertEqual(medium.rows.count, 2)
        XCTAssertEqual(large.rows.count, 2)
    }

    func testWidgetPageDisplayNamesAreLocalized() {
        XCTAssertEqual(WidgetPage.quota.title, "额度")
    }

    func testWidgetPeriodStateDefaultsPersistsAndNormalizes() {
        let suite = "token-monitor-widget-period-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = WidgetPresentationStateStore(defaults: defaults)

        XCTAssertEqual(store.selectedPeriod(), .day)
        store.setSelectedPeriod(.month)
        XCTAssertEqual(store.selectedPeriod(), .month)
        defaults.set("not-a-period", forKey: WidgetPresentationStateStore.selectedPeriodKey)
        XCTAssertEqual(store.selectedPeriod(), .day)
    }

    func testWidgetPeriodCycleAndIntentOpenBehavior() {
        XCTAssertEqual(WidgetPeriod.day.next, .month)
        XCTAssertEqual(WidgetPeriod.month.next, .total)
        XCTAssertEqual(WidgetPeriod.total.next, .day)
        XCTAssertFalse(SetWidgetPeriodIntent.openAppWhenRun)
        XCTAssertFalse(CycleWidgetPeriodIntent.openAppWhenRun)
    }

    func testWidgetPeriodSnapshotFallbackDoesNotBlankDay() throws {
        let snapshot = try decode("""
        {"schemaVersion":2,"generatedAt":"2026-07-17T09:00:00Z","overview":{"totalTokens":7},"presentation":{"currencySymbol":"¥"}}
        """)
        XCTAssertEqual(snapshot.selecting(.day).overview.totalTokens, 7)
        XCTAssertTrue(snapshot.selecting(.month).isEmpty)
    }

    func testStaleStatusWinsOverGeneratedAtThreshold() throws {
        let snapshot = try decode("{\"schemaVersion\":2,\"generatedAt\":\"2026-07-17T09:00:00Z\",\"status\":{\"isStale\":true,\"noData\":false}}")
        XCTAssertTrue(snapshot.isStale(at: Date(timeIntervalSince1970: 0)))
    }

    private func decode(_ json: String) throws -> WidgetSnapshot {
        try WidgetSnapshot.decoder.decode(WidgetSnapshot.self, from: XCTUnwrap(json.data(using: .utf8)))
    }

    private func provider(status: String) -> WidgetQuotaProvider {
        WidgetQuotaProvider(provider: "codex", status: status, updatedAt: nil, windows: [])
    }
}
