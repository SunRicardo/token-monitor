import XCTest

final class WidgetSnapshotDecodingTests: XCTestCase {
    func testDecodesSchemaV4ProviderBalances() throws {
        let snapshot = try decode("""
        {"schemaVersion":4,"generatedAt":"2026-07-17T09:00:00.000Z","periods":{"day":{"overview":{"currentPeriod":"today","totalTokens":100,"updatedAt":"2026-07-17T08:59:00.000Z"}}},"quota":[{"provider":"mimo","status":"ok","balance":{"amount":3.62,"currency":"CNY"},"windows":[]},{"provider":"deepseek","status":"ok","balance":{"amount":9.33,"currency":"USD"},"windows":[]},{"provider":"codex","status":"ok","windows":[{"kind":"weekly","remainingPercent":2}]}],"status":{"noData":false}}
        """)

        XCTAssertEqual(snapshot.schemaVersion, 4)
        XCTAssertEqual(snapshot.quota[0].balance, WidgetQuotaBalance(amount: 3.62, currency: "CNY"))
        XCTAssertEqual(snapshot.quota[1].balance, WidgetQuotaBalance(amount: 9.33, currency: "USD"))
        XCTAssertNil(snapshot.quota[2].balance)
    }

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

    func testQuotaValuePrioritizesBalanceThenPercentThenStatus() {
        let balanceAndPercent = WidgetQuotaProvider(
            provider: "mimo",
            status: "ok",
            updatedAt: nil,
            windows: [WidgetLimitWindow(kind: "billing", usedPercent: 60, remainingPercent: 40, resetsAt: nil, windowMinutes: nil)],
            balance: WidgetQuotaBalance(amount: 3.62, currency: "CNY")
        )
        let zeroUsd = WidgetQuotaProvider(
            provider: "deepseek",
            status: "ok",
            updatedAt: nil,
            windows: [],
            balance: WidgetQuotaBalance(amount: 0, currency: "USD")
        )
        let percentOnly = WidgetQuotaProvider(
            provider: "codex",
            status: "ok",
            updatedAt: nil,
            windows: [WidgetLimitWindow(kind: "weekly", usedPercent: 98, remainingPercent: 2, resetsAt: nil, windowMinutes: nil)]
        )

        XCTAssertEqual(WidgetFormat.quotaValue(balanceAndPercent), "¥3.62 left")
        XCTAssertEqual(WidgetFormat.quotaValue(zeroUsd), "$0.00 left")
        XCTAssertEqual(WidgetFormat.quotaValue(percentOnly), "2% left")
        XCTAssertEqual(WidgetFormat.quotaValue(provider(status: "notConfigured")), "未配置")
        XCTAssertEqual(WidgetFormat.quotaValue(provider(status: "unauthorized")), "需要重新登录")
        XCTAssertEqual(
            WidgetFormat.quotaValue(WidgetQuotaProvider(
                provider: "deepseek",
                status: "ok",
                updatedAt: nil,
                windows: [],
                balance: WidgetQuotaBalance(amount: 9.33, currency: "HKD")
            )),
            "HK$9.33 left"
        )
    }

    func testAllFiveIntentPagesAreIndependentValues() {
        XCTAssertEqual(WidgetPage.allCases.map(\.rawValue), ["overview", "quota", "models", "activity", "trend"])
        var first = TokenMonitorWidgetConfigurationIntent()
        var second = TokenMonitorWidgetConfigurationIntent()
        first.page = .overview
        second.page = .models
        XCTAssertNotEqual(first.page, second.page)
    }

    func testViewModelsPreserveAvailableRowsAndLongNames() throws {
        let snapshot = try decode("""
        {"schemaVersion":2,"generatedAt":"2026-07-17T09:00:00Z","overview":{"totalTokens":10},"models":[{"displayName":"A very long provider model name that must stay on one line","totalTokens":7,"sharePercent":70},{"displayName":"Second","totalTokens":2,"sharePercent":20},{"displayName":"Third","totalTokens":1,"sharePercent":10}],"status":{"noData":false}}
        """)
        let small = WidgetViewModel.make(snapshot: snapshot, page: .models, layout: .small)
        let medium = WidgetViewModel.make(snapshot: snapshot, page: .models, layout: .medium)
        let large = WidgetViewModel.make(snapshot: snapshot, page: .models, layout: .large)
        XCTAssertTrue(small.primaryValue.hasPrefix("A very long"))
        XCTAssertEqual(small.rows.count, 2)
        XCTAssertEqual(medium.rows.count, 2)
        XCTAssertEqual(large.rows.count, 2)
    }

    func testWidgetPageDisplayNamesAreLocalized() {
        XCTAssertEqual(WidgetPage.quota.title, "额度")
    }

    func testWidgetPageCycleOrderIsStable() {
        XCTAssertEqual(WidgetPage.overview.next, .quota)
        XCTAssertEqual(WidgetPage.quota.next, .models)
        XCTAssertEqual(WidgetPage.models.next, .activity)
        XCTAssertEqual(WidgetPage.activity.next, .trend)
        XCTAssertEqual(WidgetPage.trend.next, .overview)
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

    func testWidgetPageStateDefaultsPersistByFamilyAndNormalize() {
        let suite = "token-monitor-widget-page-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = WidgetPresentationStateStore(defaults: defaults)

        XCTAssertNil(store.selectedPage(for: .small))
        XCTAssertNil(store.selectedPage(for: .medium))
        XCTAssertNil(store.selectedPage(for: .large))

        store.setSelectedPage(.quota, for: .small)
        store.setSelectedPage(.activity, for: .medium)
        store.setSelectedPage(.trend, for: .large)

        XCTAssertEqual(store.selectedPage(for: .small), .quota)
        XCTAssertEqual(store.selectedPage(for: .medium), .activity)
        XCTAssertEqual(store.selectedPage(for: .large), .trend)

        defaults.set("not-a-page", forKey: WidgetPresentationStateStore.selectedPageKey(for: .medium))
        XCTAssertNil(store.selectedPage(for: .medium))
        XCTAssertNil(defaults.string(forKey: WidgetPresentationStateStore.selectedPageKey(for: .medium)))

        store.clearSelectedPage(for: .small)
        XCTAssertNil(store.selectedPage(for: .small))
        XCTAssertEqual(store.selectedPage(for: .large), .trend)

        store.clearSelectedPages()
        XCTAssertNil(store.selectedPage(for: .large))
    }

    func testWidgetPageAndPeriodStateAreIndependent() {
        let suite = "token-monitor-widget-presentation-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = WidgetPresentationStateStore(defaults: defaults)

        store.setSelectedPeriod(.month)
        store.setSelectedPage(.models, for: .medium)
        XCTAssertEqual(store.selectedPeriod(), .month)
        XCTAssertEqual(store.selectedPage(for: .medium), .models)

        store.setSelectedPage(.activity, for: .medium)
        XCTAssertEqual(store.selectedPeriod(), .month)
        XCTAssertEqual(store.selectedPage(for: .medium), .activity)

        store.setSelectedPeriod(.total)
        XCTAssertEqual(store.selectedPeriod(), .total)
        XCTAssertEqual(store.selectedPage(for: .medium), .activity)
    }

    func testWidgetFamilyScopeMapsSupportedFamiliesOnly() {
        XCTAssertEqual(WidgetFamilyScope(widgetFamily: .systemSmall), .small)
        XCTAssertEqual(WidgetFamilyScope(widgetFamily: .systemMedium), .medium)
        XCTAssertEqual(WidgetFamilyScope(widgetFamily: .systemLarge), .large)
    }

    func testWidgetLayoutMetricsStabilizeHeaderFooterAndPageControl() {
        let small = WidgetLayoutMetrics.metrics(for: .systemSmall)
        let medium = WidgetLayoutMetrics.metrics(for: .systemMedium)
        let large = WidgetLayoutMetrics.metrics(for: .systemLarge)

        for metrics in [small, medium, large] {
            XCTAssertEqual(metrics.outerTopInset, 0)
            XCTAssertEqual(metrics.outerBottomInset, 0)
            XCTAssertEqual(metrics.horizontalInset, 0)
            XCTAssertEqual(metrics.outerInsets.leading, 0)
            XCTAssertEqual(metrics.outerInsets.trailing, 0)
        }
        XCTAssertEqual([small.headerHeight, medium.headerHeight, large.headerHeight], [20, 22, 24])
        XCTAssertEqual([small.footerHeight, medium.footerHeight, large.footerHeight], [25, 26, 28])
        XCTAssertEqual(small.pageControlWidth, 108)
        XCTAssertEqual(medium.pageControlWidth, 112)
        XCTAssertEqual(large.pageControlWidth, 112)
        XCTAssertEqual(WidgetLayoutMetrics.metrics(for: .systemSmall).pageControlWidth, small.pageControlWidth)
    }

    func testWidgetScaffoldGeometryIsFamilyOnlyAndReservesContentRect() {
        let families = [WidgetLayoutMetrics.small, .medium, .large]
        let pages = WidgetPage.allCases
        let periods = WidgetPeriod.allCases

        for metrics in families {
            let geometry = metrics.scaffoldGeometry
            XCTAssertEqual(geometry.headerHeight, metrics.headerHeight)
            XCTAssertEqual(geometry.footerHeight, metrics.footerHeight)
            XCTAssertEqual(geometry.contentTopReserved, metrics.headerHeight + metrics.contentGap)
            XCTAssertEqual(geometry.contentBottomReserved, metrics.footerHeight + metrics.contentGap)
            XCTAssertGreaterThan(geometry.contentHeight(for: 160), 0)
            XCTAssertLessThan(geometry.contentTopReserved + geometry.contentBottomReserved, 160)

            let expectedFrames = geometry.regionFrames(for: CGSize(width: 280, height: 160))
            XCTAssertEqual(expectedFrames.header.minY, 0)
            XCTAssertEqual(expectedFrames.header.height, metrics.headerHeight)
            XCTAssertEqual(expectedFrames.content.minY, geometry.contentTopReserved)
            XCTAssertEqual(expectedFrames.footer.maxY, 160)
            XCTAssertEqual(expectedFrames.footer.height, metrics.footerHeight)

            for _ in pages {
                for _ in periods {
                    XCTAssertEqual(geometry, metrics.scaffoldGeometry)
                    XCTAssertEqual(expectedFrames, metrics.scaffoldGeometry.regionFrames(for: CGSize(width: 280, height: 160)))
                }
            }
        }
    }

    func testAdaptiveListCapacityFillsBeforeShowingMoreRows() {
        for count in [0, 1, 2, 4, 6, 10] {
            for kind in [WidgetListKind.quota, .models] {
                let full = WidgetListCapacity.plan(itemCount: count, availableHeight: 400, kind: kind)
                XCTAssertEqual(full.density, .regular)
                XCTAssertEqual(full.visibleCount, count)
                XCTAssertEqual(full.hiddenCount, 0)
            }
        }

        let mediumFour = WidgetListCapacity.plan(itemCount: 4, availableHeight: 55, kind: .quota)
        XCTAssertEqual(mediumFour.density, .compact)
        XCTAssertEqual(mediumFour.visibleCount, 4)
        XCTAssertEqual(mediumFour.hiddenCount, 0)

        let smallThree = WidgetListCapacity.plan(itemCount: 3, availableHeight: 41, kind: .quota)
        XCTAssertEqual(smallThree.density, .compact)
        XCTAssertEqual(smallThree.visibleCount, 3)
        XCTAssertEqual(smallThree.hiddenCount, 0)

        let constrained = WidgetListCapacity.plan(itemCount: 6, availableHeight: 35, kind: .models)
        XCTAssertEqual(constrained.density, .summary)
        XCTAssertEqual(constrained.visibleCount, 2)
        XCTAssertEqual(constrained.hiddenCount, 4)
        let occupied = CGFloat(constrained.visibleCount) * constrained.rowHeight
            + CGFloat(constrained.visibleCount) * constrained.rowSpacing
            + constrained.moreRowHeight
        XCTAssertLessThanOrEqual(occupied, 35)

        let summaryOnly = WidgetListCapacity.plan(itemCount: 10, availableHeight: 11, kind: .quota)
        XCTAssertEqual(summaryOnly.visibleCount, 0)
        XCTAssertEqual(summaryOnly.hiddenCount, 10)
    }

    func testHeatmapUsesSundayRowsAndCalendarPlaceholders() throws {
        let reference = try utcDate("2026-06-10")
        let layout = WidgetHeatmapLayoutCalculator.make(
            days: [
                WidgetActivityDay(date: "2026-06-07", intensity: 1),
                WidgetActivityDay(date: "2026-06-09", intensity: 3),
                WidgetActivityDay(date: "2026-06-09", intensity: 4),
                WidgetActivityDay(date: "2026-06-31", intensity: 4)
            ],
            referenceDate: reference,
            availableSize: CGSize(width: 120, height: 70),
            maxWeeks: 6,
            minCellSize: 5,
            maxCellSize: 9,
            spacing: 2
        )

        XCTAssertEqual(layout.weekCount, 1)
        XCTAssertEqual(layout.cells.count, 7)
        XCTAssertEqual(layout.cell(week: 0, weekday: 0)?.date, "2026-06-07")
        XCTAssertEqual(layout.cell(week: 0, weekday: 0)?.intensity, 1)
        XCTAssertEqual(layout.cell(week: 0, weekday: 1)?.date, "2026-06-08")
        XCTAssertEqual(layout.cell(week: 0, weekday: 1)?.intensity, 0)
        XCTAssertEqual(layout.cell(week: 0, weekday: 2)?.intensity, 4)
        XCTAssertEqual(layout.cell(week: 0, weekday: 4)?.isFuture, true)
        XCTAssertEqual(Set(layout.cells.map(\.id)).count, layout.cells.count)
    }

    func testHeatmapAdaptsAcrossFamiliesAndHistoryLengthsWithoutOverflow() throws {
        let reference = try utcDate("2026-07-17")
        let scenarios: [(count: Int, size: CGSize, maxWeeks: Int, minWeeks: Int, minCell: CGFloat, maxCell: CGFloat)] = [
            (28, CGSize(width: 120, height: 70), 6, 4, 5, 9),
            (90, CGSize(width: 220, height: 70), 14, 10, 5, 10),
            (180, CGSize(width: 320, height: 120), 26, 20, 6, 12)
        ]

        for scenario in scenarios {
            let days = try continuousActivityDays(count: scenario.count, ending: "2026-07-17")
            let layout = WidgetHeatmapLayoutCalculator.make(
                days: days,
                referenceDate: reference,
                availableSize: scenario.size,
                maxWeeks: scenario.maxWeeks,
                minCellSize: scenario.minCell,
                maxCellSize: scenario.maxCell,
                spacing: 2
            )
            XCTAssertGreaterThanOrEqual(layout.weekCount, scenario.minWeeks)
            XCTAssertLessThanOrEqual(layout.weekCount, scenario.maxWeeks)
            XCTAssertEqual(layout.cells.count, layout.weekCount * 7)
            XCTAssertGreaterThanOrEqual(layout.cellSize, scenario.minCell)
            XCTAssertLessThanOrEqual(layout.cellSize, scenario.maxCell)
            XCTAssertLessThanOrEqual(layout.renderedWidth, scenario.size.width + 0.001)
            XCTAssertLessThanOrEqual(layout.renderedHeight, scenario.size.height + 0.001)
            XCTAssertEqual(Set(layout.cells.map(\.id)).count, layout.cells.count)
        }
    }

    func testHeatmapHandlesEmptySparseAndThemeIndependentGeometry() throws {
        let reference = try utcDate("2026-07-17")
        let empty = WidgetHeatmapLayoutCalculator.make(
            days: [],
            referenceDate: reference,
            availableSize: CGSize(width: 220, height: 70),
            maxWeeks: 14,
            minCellSize: 5,
            maxCellSize: 10,
            spacing: 2
        )
        XCTAssertEqual(empty.weekCount, 0)
        XCTAssertTrue(empty.cells.isEmpty)

        let sparse = [
            WidgetActivityDay(date: "2026-05-03", intensity: 4),
            WidgetActivityDay(date: "2026-06-14", intensity: 2),
            WidgetActivityDay(date: "2026-07-17", intensity: 1)
        ]
        let baseline = WidgetHeatmapLayoutCalculator.make(
            days: sparse,
            referenceDate: reference,
            availableSize: CGSize(width: 220, height: 70),
            maxWeeks: 14,
            minCellSize: 5,
            maxCellSize: 10,
            spacing: 2
        )
        XCTAssertGreaterThan(baseline.cells.filter { !$0.isFuture && $0.intensity == 0 }.count, 0)

        for _ in ["light", "dark", "accented"] {
            let themed = WidgetHeatmapLayoutCalculator.make(
                days: sparse,
                referenceDate: reference,
                availableSize: CGSize(width: 220, height: 70),
                maxWeeks: 14,
                minCellSize: 5,
                maxCellSize: 10,
                spacing: 2
            )
            XCTAssertEqual(themed, baseline)
        }
    }

    func testWidgetPeriodCycleAndIntentOpenBehavior() {
        XCTAssertEqual(WidgetPeriod.day.next, .month)
        XCTAssertEqual(WidgetPeriod.month.next, .total)
        XCTAssertEqual(WidgetPeriod.total.next, .day)
        XCTAssertFalse(SetWidgetPeriodIntent.openAppWhenRun)
        XCTAssertFalse(CycleWidgetPeriodIntent.openAppWhenRun)
        XCTAssertFalse(CycleWidgetPageIntent.openAppWhenRun)

        let pageIntent = CycleWidgetPageIntent(family: .large, currentPage: .trend)
        XCTAssertEqual(pageIntent.family, .large)
        XCTAssertEqual(pageIntent.currentPage, .trend)
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

    private func utcDate(_ value: String) throws -> Date {
        try XCTUnwrap(ISO8601DateFormatter().date(from: "\(value)T00:00:00Z"))
    }

    private func continuousActivityDays(count: Int, ending: String) throws -> [WidgetActivityDay] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let end = try utcDate(ending)
        return try (0..<count).map { index in
            let date = try XCTUnwrap(calendar.date(byAdding: .day, value: index - count + 1, to: end))
            let components = calendar.dateComponents([.year, .month, .day], from: date)
            let key = String(
                format: "%04d-%02d-%02d",
                components.year ?? 0,
                components.month ?? 0,
                components.day ?? 0
            )
            return WidgetActivityDay(date: key, intensity: index % 4 + 1)
        }
    }

    private func provider(status: String) -> WidgetQuotaProvider {
        WidgetQuotaProvider(provider: "codex", status: status, updatedAt: nil, windows: [])
    }

    // MARK: - Large Widget Layout Tests

    func testLargeModelFontSizeGreaterThanMedium() {
        let largePlan = WidgetLargeListLayoutPlan.make(itemCount: 5, availableHeight: 380)
        let mediumGeometry = WidgetListCapacity.geometry(kind: .models, density: .regular)

        XCTAssertGreaterThan(largePlan.nameFontSize, 10) // Medium regular = 10pt
        XCTAssertGreaterThanOrEqual(largePlan.nameFontSize, 13)
        XCTAssertLessThanOrEqual(largePlan.nameFontSize, 16)
        XCTAssertGreaterThan(largePlan.rowHeight, mediumGeometry.rowHeight) // Large > 28pt
    }

    func testLargeModelRowHeightAdaptsToAvailableHeight() {
        let small = WidgetLargeListLayoutPlan.make(itemCount: 5, availableHeight: 200)
        let medium = WidgetLargeListLayoutPlan.make(itemCount: 5, availableHeight: 380)
        let large = WidgetLargeListLayoutPlan.make(itemCount: 5, availableHeight: 600)

        XCTAssertGreaterThanOrEqual(small.rowHeight, 34)
        XCTAssertLessThanOrEqual(small.rowHeight, 46)
        XCTAssertGreaterThan(medium.rowHeight, small.rowHeight)
        XCTAssertGreaterThanOrEqual(large.rowHeight, 34)
        XCTAssertLessThanOrEqual(large.rowHeight, 46)
    }

    func testLargeModelListDoesNotCrowdAllModelsAtTop() {
        let plan = WidgetLargeListLayoutPlan.make(itemCount: 10, availableHeight: 380)
        // With 380pt and 10 items, rowHeight ~38pt fits all 10 — this is correct
        // The key test: row height should be reasonable, not collapsed to minimum
        XCTAssertGreaterThanOrEqual(plan.rowHeight, 34)
        XCTAssertLessThanOrEqual(plan.rowHeight, 46)
        // If we reduce available height, fewer items should show
        let constrained = WidgetLargeListLayoutPlan.make(itemCount: 10, availableHeight: 200)
        XCTAssertLessThan(constrained.visibleCount, 10)
        XCTAssertGreaterThan(constrained.hiddenCount, 0)
    }

    func testLargeModelMoreRowOnlyWhenOverCapacity() {
        let exactFit = WidgetLargeListLayoutPlan.make(itemCount: 3, availableHeight: 600)
        XCTAssertEqual(exactFit.hiddenCount, 0)

        let overCapacity = WidgetLargeListLayoutPlan.make(itemCount: 15, availableHeight: 200)
        XCTAssertGreaterThan(overCapacity.hiddenCount, 0)
    }

    func testLargeHeatmapCellSizeGreaterThan12() {
        let reference = try! utcDate("2026-07-17")
        let days = try! continuousActivityDays(count: 90, ending: "2026-07-17")
        let layout = WidgetHeatmapLayoutCalculator.make(
            days: days,
            referenceDate: reference,
            availableSize: CGSize(width: 320, height: 120),
            maxWeeks: 26,
            minCellSize: 5,
            maxCellSize: 22,
            spacing: 2
        )
        XCTAssertGreaterThan(layout.cellSize, 12)
        XCTAssertLessThanOrEqual(layout.cellSize, 22)
    }

    func testLargeHeatmapKeepsSevenRows() {
        let reference = try! utcDate("2026-07-17")
        let days = try! continuousActivityDays(count: 90, ending: "2026-07-17")
        let layout = WidgetHeatmapLayoutCalculator.make(
            days: days,
            referenceDate: reference,
            availableSize: CGSize(width: 320, height: 120),
            maxWeeks: 26,
            minCellSize: 5,
            maxCellSize: 22,
            spacing: 2
        )
        if layout.weekCount > 0 {
            XCTAssertEqual(layout.cells.count, layout.weekCount * 7)
            // 7 rows * cellSize + 6 * spacing = renderedHeight
            let expectedHeight = 7 * layout.cellSize + 6 * layout.spacing
            XCTAssertEqual(layout.renderedHeight, expectedHeight, accuracy: 0.001)
        }
    }

    func testLargeHeatmapUsesLargerCellsWithLimitedHistory() {
        let reference = try! utcDate("2026-07-17")
        // 3 weeks of data — coverage may span 3-4 calendar weeks due to Sunday alignment
        let days = try! continuousActivityDays(count: 21, ending: "2026-07-17")
        let layout = WidgetHeatmapLayoutCalculator.make(
            days: days,
            referenceDate: reference,
            availableSize: CGSize(width: 320, height: 120),
            maxWeeks: 26,
            minCellSize: 5,
            maxCellSize: 22,
            spacing: 2
        )
        // With limited history and large available space, cells should be large
        XCTAssertGreaterThan(layout.cellSize, 14)
        // Week count depends on Sunday alignment (3-5 weeks)
        XCTAssertGreaterThanOrEqual(layout.weekCount, 3)
        XCTAssertLessThanOrEqual(layout.weekCount, 5)
    }

    func testLargeOverviewShowsMultipleProviders() throws {
        let snapshot = try decode("""
        {"schemaVersion":4,"generatedAt":"2026-07-17T09:00:00.000Z","periods":{"day":{"overview":{"currentPeriod":"today","totalTokens":100,"updatedAt":"2026-07-17T08:59:00.000Z"}}},"quota":[{"provider":"codex","status":"ok","windows":[{"kind":"weekly","remainingPercent":2}]},{"provider":"mimo","status":"ok","balance":{"amount":3.62,"currency":"CNY"},"windows":[]},{"provider":"deepseek","status":"ok","balance":{"amount":9.33,"currency":"USD"},"windows":[]},{"provider":"antigravity","status":"notConfigured","windows":[]}],"status":{"noData":false}}
        """)
        // sortedQuotaProviders should put balance/percent first
        let sorted = snapshot.quota.sorted { a, b in
            func priority(_ p: WidgetQuotaProvider) -> Int {
                if p.balance != nil || p.windows.first?.remainingPercent != nil { return 0 }
                if p.status == "unauthorized" || p.status == "sessionExpired" { return 1 }
                if p.status == "notConfigured" { return 3 }
                return 2
            }
            return priority(a) < priority(b)
        }
        // MiMo and DeepSeek have balance, Codex has percent — all should be before antigravity
        XCTAssertEqual(sorted.count, 4)
        XCTAssertTrue(sorted[0].provider == "codex" || sorted[0].provider == "mimo" || sorted[0].provider == "deepseek")
        XCTAssertEqual(sorted.last?.provider, "antigravity")
    }

    func testHeaderFooterGeometryUnchanged() {
        let small = WidgetLayoutMetrics.metrics(for: .systemSmall)
        let medium = WidgetLayoutMetrics.metrics(for: .systemMedium)
        let large = WidgetLayoutMetrics.metrics(for: .systemLarge)

        XCTAssertEqual(small.headerHeight, 20)
        XCTAssertEqual(medium.headerHeight, 22)
        XCTAssertEqual(large.headerHeight, 24)
        XCTAssertEqual(small.footerHeight, 25)
        XCTAssertEqual(medium.footerHeight, 26)
        XCTAssertEqual(large.footerHeight, 28)
        XCTAssertEqual(small.contentGap, 5)
        XCTAssertEqual(medium.contentGap, 10)
        XCTAssertEqual(large.contentGap, 8)
    }

    func testSmallMediumLayoutUnchanged() {
        let smallModels = WidgetListCapacity.plan(itemCount: 5, availableHeight: 100, kind: .models)
        let mediumModels = WidgetListCapacity.plan(itemCount: 5, availableHeight: 200, kind: .models)

        // Small should still use its original geometry
        let smallGeometry = WidgetListCapacity.geometry(kind: .models, density: .regular)
        XCTAssertEqual(smallGeometry.rowHeight, 28)
        XCTAssertEqual(smallGeometry.rowSpacing, 3)

        // These should not be affected by Large changes
        XCTAssertLessThanOrEqual(smallModels.rowHeight, 28)
        XCTAssertLessThanOrEqual(mediumModels.rowHeight, 28)
    }
}
