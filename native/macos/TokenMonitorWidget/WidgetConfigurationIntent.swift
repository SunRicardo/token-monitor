import AppIntents

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
