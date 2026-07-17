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

protocol WidgetPresentationStateStoring {
    func selectedPeriod() -> WidgetPeriod
    func setSelectedPeriod(_ period: WidgetPeriod)
}

final class WidgetPresentationStateStore: WidgetPresentationStateStoring {
    static let selectedPeriodKey = "selectedPeriod"
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
}

enum WidgetIntentRuntime {
    static var widgetKind: String {
        Bundle.main.object(forInfoDictionaryKey: "TMWidgetKind") as? String ?? "com.tokenmonitor.dashboard"
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
        let store = WidgetPresentationStateStore.shared
        guard store.selectedPeriod() != period else {
            return .result()
        }
        store.setSelectedPeriod(period)
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetIntentRuntime.widgetKind)
        return .result()
    }
}

struct CycleWidgetPeriodIntent: AppIntent {
    static var title: LocalizedStringResource = "循环切换统计周期"
    static var openAppWhenRun: Bool { false }

    init() {}

    func perform() async throws -> some IntentResult {
        let store = WidgetPresentationStateStore.shared
        let next = store.selectedPeriod().next
        store.setSelectedPeriod(next)
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetIntentRuntime.widgetKind)
        return .result()
    }
}
