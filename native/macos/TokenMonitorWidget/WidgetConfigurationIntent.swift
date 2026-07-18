import AppIntents
import Foundation
import WidgetKit

enum WidgetPage: String, AppEnum, CaseIterable {
    case overview
    case quota
    case models
    case activity
    case trend

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "显示页面")
    static let caseDisplayRepresentations: [WidgetPage: DisplayRepresentation] = [
        .overview: DisplayRepresentation(title: "主页", image: .init(systemName: "house")),
        .quota: DisplayRepresentation(title: "额度", image: .init(systemName: "gauge.with.dots.needle.50percent")),
        .models: DisplayRepresentation(title: "模型", image: .init(systemName: "cpu")),
        .activity: DisplayRepresentation(title: "活动", image: .init(systemName: "square.grid.3x3")),
        .trend: DisplayRepresentation(title: "趋势", image: .init(systemName: "chart.xyaxis.line"))
    ]

    var title: String {
        switch self {
        case .overview: "主页"
        case .quota: "额度"
        case .models: "模型"
        case .activity: "活动"
        case .trend: "趋势"
        }
    }

    var systemImage: String {
        switch self {
        case .overview: "house"
        case .quota: "gauge.with.dots.needle.50percent"
        case .models: "cpu"
        case .activity: "square.grid.3x3"
        case .trend: "chart.xyaxis.line"
        }
    }

    var next: WidgetPage {
        switch self {
        case .overview: .quota
        case .quota: .models
        case .models: .activity
        case .activity: .trend
        case .trend: .overview
        }
    }
}

struct TokenMonitorWidgetConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Token Monitor 页面"
    static let description = IntentDescription("选择这个小组件实例显示的页面。")

    @Parameter(title: "显示页面", default: .overview)
    var page: WidgetPage
}

enum WidgetPeriod: String, Codable, AppEnum, CaseIterable {
    case day
    case month
    case total

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "统计周期")
    static let caseDisplayRepresentations: [WidgetPeriod: DisplayRepresentation] = [
        .day: DisplayRepresentation(title: "DAY", subtitle: "当日"),
        .month: DisplayRepresentation(title: "MONTH", subtitle: "本月"),
        .total: DisplayRepresentation(title: "TOTAL", subtitle: "累计")
    ]

    var title: String {
        switch self {
        case .day: "DAY"
        case .month: "MONTH"
        case .total: "TOTAL"
        }
    }

    var accessibilityName: String {
        switch self {
        case .day: "当日统计"
        case .month: "本月统计"
        case .total: "累计统计"
        }
    }

    var next: WidgetPeriod {
        switch self {
        case .day: .month
        case .month: .total
        case .total: .day
        }
    }

    var snapshotKey: String { rawValue }

    static func normalized(_ value: String?) -> WidgetPeriod {
        WidgetPeriod(rawValue: String(value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) ?? .day
    }
}

enum WidgetFamilyScope: String, Codable, AppEnum, CaseIterable {
    case small
    case medium
    case large

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "小组件尺寸")
    static let caseDisplayRepresentations: [WidgetFamilyScope: DisplayRepresentation] = [
        .small: DisplayRepresentation(title: "Small"),
        .medium: DisplayRepresentation(title: "Medium"),
        .large: DisplayRepresentation(title: "Large")
    ]

    init?(widgetFamily: WidgetFamily) {
        switch widgetFamily {
        case .systemSmall:
            self = .small
        case .systemMedium:
            self = .medium
        case .systemLarge:
            self = .large
        default:
            return nil
        }
    }
}

protocol WidgetPresentationStateStoring {
    func selectedPeriod() -> WidgetPeriod
    func setSelectedPeriod(_ period: WidgetPeriod)
    func selectedPage(for family: WidgetFamilyScope) -> WidgetPage?
    func setSelectedPage(_ page: WidgetPage, for family: WidgetFamilyScope)
    func clearSelectedPage(for family: WidgetFamilyScope)
    func clearSelectedPages()
    func lastConfiguredPage(for family: WidgetFamilyScope) -> WidgetPage?
    func setLastConfiguredPage(_ page: WidgetPage, for family: WidgetFamilyScope)
    func clearLastConfiguredPage(for family: WidgetFamilyScope)
    func effectivePage(configuredPage: WidgetPage, for family: WidgetFamilyScope) -> WidgetPage
    func selectedActivityDay(for family: WidgetFamilyScope) -> String?
    func setSelectedActivityDay(_ date: String, for family: WidgetFamilyScope)
    func clearSelectedActivityDay(for family: WidgetFamilyScope)
    func clearSelectedActivityDays()
}

final class WidgetPresentationStateStore: WidgetPresentationStateStoring {
    static let selectedPeriodKey = "selectedPeriod"
    static let selectedPageKeyPrefix = "widget.presentation.page"
    static let lastConfiguredPageKeyPrefix = "widget.presentation.config-page"
    static let selectedActivityDayKeyPrefix = "widget.presentation.activity-day"
    static let shared = WidgetPresentationStateStore()

    private let defaults: UserDefaults?

    init(defaults: UserDefaults? = nil) {
        if let defaults {
            self.defaults = defaults
        } else if let appGroup = Bundle.main.object(forInfoDictionaryKey: "TokenMonitorAppGroup") as? String,
                  !appGroup.isEmpty {
            self.defaults = UserDefaults(suiteName: appGroup)
        } else {
            self.defaults = nil
        }
    }

    func selectedPeriod() -> WidgetPeriod {
        WidgetPeriod.normalized(defaults?.string(forKey: Self.selectedPeriodKey))
    }

    func setSelectedPeriod(_ period: WidgetPeriod) {
        defaults?.set(period.rawValue, forKey: Self.selectedPeriodKey)
    }

    func selectedPage(for family: WidgetFamilyScope) -> WidgetPage? {
        guard let defaults else { return nil }
        let key = pageKey(for: family)
        guard let raw = defaults.string(forKey: key) else { return nil }
        guard let page = WidgetPage(rawValue: raw.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            defaults.removeObject(forKey: key)
            return nil
        }
        return page
    }

    func setSelectedPage(_ page: WidgetPage, for family: WidgetFamilyScope) {
        defaults?.set(page.rawValue, forKey: pageKey(for: family))
    }

    func clearSelectedPage(for family: WidgetFamilyScope) {
        defaults?.removeObject(forKey: pageKey(for: family))
    }

    func clearSelectedPages() {
        for family in WidgetFamilyScope.allCases {
            clearSelectedPage(for: family)
        }
    }

    func lastConfiguredPage(for family: WidgetFamilyScope) -> WidgetPage? {
        guard let defaults else { return nil }
        let key = lastConfiguredPageKey(for: family)
        guard let raw = defaults.string(forKey: key) else { return nil }
        guard let page = WidgetPage(rawValue: raw.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            defaults.removeObject(forKey: key)
            return nil
        }
        return page
    }

    func setLastConfiguredPage(_ page: WidgetPage, for family: WidgetFamilyScope) {
        defaults?.set(page.rawValue, forKey: lastConfiguredPageKey(for: family))
    }

    func clearLastConfiguredPage(for family: WidgetFamilyScope) {
        defaults?.removeObject(forKey: lastConfiguredPageKey(for: family))
    }

    func effectivePage(configuredPage: WidgetPage, for family: WidgetFamilyScope) -> WidgetPage {
        let interactivePage = selectedPage(for: family)
        guard let lastConfiguredPage = lastConfiguredPage(for: family) else {
            setLastConfiguredPage(configuredPage, for: family)
            return interactivePage ?? configuredPage
        }

        if configuredPage != lastConfiguredPage {
            setLastConfiguredPage(configuredPage, for: family)
            setSelectedPage(configuredPage, for: family)
            clearSelectedActivityDay(for: family)
            return configuredPage
        }

        return interactivePage ?? configuredPage
    }

    func selectedActivityDay(for family: WidgetFamilyScope) -> String? {
        guard family != .small, let defaults else {
            clearSelectedActivityDay(for: family)
            return nil
        }
        let key = activityDayKey(for: family)
        guard let date = defaults.string(forKey: key) else { return nil }
        guard WidgetActivityDate.isValid(date) else {
            defaults.removeObject(forKey: key)
            return nil
        }
        return date
    }

    func setSelectedActivityDay(_ date: String, for family: WidgetFamilyScope) {
        guard family != .small, WidgetActivityDate.isValid(date) else {
            clearSelectedActivityDay(for: family)
            return
        }
        defaults?.set(date, forKey: activityDayKey(for: family))
    }

    func clearSelectedActivityDay(for family: WidgetFamilyScope) {
        defaults?.removeObject(forKey: activityDayKey(for: family))
    }

    func clearSelectedActivityDays() {
        clearSelectedActivityDay(for: .medium)
        clearSelectedActivityDay(for: .large)
    }

    static func selectedPageKey(for family: WidgetFamilyScope) -> String {
        "\(selectedPageKeyPrefix).\(family.rawValue)"
    }

    static func lastConfiguredPageKey(for family: WidgetFamilyScope) -> String {
        "\(lastConfiguredPageKeyPrefix).\(family.rawValue)"
    }

    static func selectedActivityDayKey(for family: WidgetFamilyScope) -> String {
        "\(selectedActivityDayKeyPrefix).\(family.rawValue)"
    }

    private func pageKey(for family: WidgetFamilyScope) -> String {
        Self.selectedPageKey(for: family)
    }

    private func lastConfiguredPageKey(for family: WidgetFamilyScope) -> String {
        Self.lastConfiguredPageKey(for: family)
    }

    private func activityDayKey(for family: WidgetFamilyScope) -> String {
        Self.selectedActivityDayKey(for: family)
    }
}

enum WidgetActivityDate {
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()

    static func isValid(_ value: String) -> Bool {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4,
              parts[1].count == 2,
              parts[2].count == 2,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]),
              let date = calendar.date(from: DateComponents(year: year, month: month, day: day)) else { return false }
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return components.year == year && components.month == month && components.day == day
    }
}

enum WidgetActivitySelection {
    static func resolvedDate(
        days: [WidgetActivityDay],
        family: WidgetFamilyScope?,
        store: WidgetPresentationStateStoring
    ) -> String? {
        guard let family, family != .small else { return nil }
        guard let selectedDate = store.selectedActivityDay(for: family),
              days.contains(where: { $0.date == selectedDate }) else {
            store.clearSelectedActivityDay(for: family)
            return nil
        }
        return selectedDate
    }
}

enum WidgetIntentRuntime {
    static var widgetKind: String {
        Bundle.main.object(forInfoDictionaryKey: "TMWidgetKind") as? String ?? "com.tokenmonitor.dashboard"
    }
}

enum WidgetIntentActions {
    static func selectActivityDay(
        family: WidgetFamilyScope,
        date: String,
        store: WidgetPresentationStateStoring,
        widgetKind: String,
        reload: (String) -> Void
    ) {
        guard family == .medium || family == .large, WidgetActivityDate.isValid(date) else {
            store.clearSelectedActivityDay(for: family)
            reload(widgetKind)
            return
        }
        if store.selectedActivityDay(for: family) == date {
            store.clearSelectedActivityDay(for: family)
        } else {
            store.setSelectedActivityDay(date, for: family)
        }
        reload(widgetKind)
    }

    static func setPeriod(
        _ period: WidgetPeriod,
        store: WidgetPresentationStateStoring,
        widgetKind: String,
        reload: (String) -> Void
    ) {
        guard store.selectedPeriod() != period else { return }
        store.clearSelectedActivityDays()
        store.setSelectedPeriod(period)
        reload(widgetKind)
    }

    static func cyclePeriod(
        store: WidgetPresentationStateStoring,
        widgetKind: String,
        reload: (String) -> Void
    ) {
        store.clearSelectedActivityDays()
        store.setSelectedPeriod(store.selectedPeriod().next)
        reload(widgetKind)
    }

    static func cyclePage(
        family: WidgetFamilyScope,
        currentPage: WidgetPage,
        store: WidgetPresentationStateStoring,
        widgetKind: String,
        reload: (String) -> Void
    ) {
        store.clearSelectedActivityDay(for: family)
        let current = store.selectedPage(for: family) ?? currentPage
        store.setSelectedPage(current.next, for: family)
        reload(widgetKind)
    }
}

struct SelectActivityDayIntent: AppIntent {
    static var title: LocalizedStringResource = "选择活动日期"
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "小组件尺寸", default: .medium)
    var family: WidgetFamilyScope

    @Parameter(title: "日期")
    var date: String

    init() {
        family = .medium
        date = ""
    }

    init(family: WidgetFamilyScope, date: String) {
        self.family = family
        self.date = date
    }

    func perform() async throws -> some IntentResult {
        WidgetIntentActions.selectActivityDay(
            family: family,
            date: date,
            store: WidgetPresentationStateStore.shared,
            widgetKind: WidgetIntentRuntime.widgetKind,
            reload: { WidgetCenter.shared.reloadTimelines(ofKind: $0) }
        )
        return .result()
    }
}

struct SetWidgetPeriodIntent: AppIntent {
    static var title: LocalizedStringResource = "切换统计周期"
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "周期", default: .day)
    var period: WidgetPeriod

    init() {
        self.period = .day
    }

    init(period: WidgetPeriod) {
        self.period = period
    }

    func perform() async throws -> some IntentResult {
        WidgetIntentActions.setPeriod(
            period,
            store: WidgetPresentationStateStore.shared,
            widgetKind: WidgetIntentRuntime.widgetKind,
            reload: { WidgetCenter.shared.reloadTimelines(ofKind: $0) }
        )
        return .result()
    }
}

struct CycleWidgetPeriodIntent: AppIntent {
    static var title: LocalizedStringResource = "循环切换统计周期"
    static var openAppWhenRun: Bool { false }

    init() {}

    func perform() async throws -> some IntentResult {
        WidgetIntentActions.cyclePeriod(
            store: WidgetPresentationStateStore.shared,
            widgetKind: WidgetIntentRuntime.widgetKind,
            reload: { WidgetCenter.shared.reloadTimelines(ofKind: $0) }
        )
        return .result()
    }
}

struct CycleWidgetPageIntent: AppIntent {
    static var title: LocalizedStringResource = "切换小组件页面"
    static var description = IntentDescription("切换当前尺寸小组件显示的页面。")
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "小组件尺寸", default: .small)
    var family: WidgetFamilyScope

    @Parameter(title: "当前页面", default: .overview)
    var currentPage: WidgetPage

    init() {
        self.family = .small
        self.currentPage = .overview
    }

    init(family: WidgetFamilyScope, currentPage: WidgetPage) {
        self.family = family
        self.currentPage = currentPage
    }

    func perform() async throws -> some IntentResult {
        WidgetIntentActions.cyclePage(
            family: family,
            currentPage: currentPage,
            store: WidgetPresentationStateStore.shared,
            widgetKind: WidgetIntentRuntime.widgetKind,
            reload: { WidgetCenter.shared.reloadTimelines(ofKind: $0) }
        )
        return .result()
    }
}
