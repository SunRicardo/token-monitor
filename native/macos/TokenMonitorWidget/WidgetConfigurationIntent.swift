import AppIntents

enum WidgetPage: String, AppEnum, CaseIterable {
    case overview
    case quota
    case models
    case activity
    case trend

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Widget Page")
    static let caseDisplayRepresentations: [WidgetPage: DisplayRepresentation] = [
        .overview: DisplayRepresentation(title: "Overview", image: .init(systemName: "house")),
        .quota: DisplayRepresentation(title: "Quota", image: .init(systemName: "gauge.with.dots.needle.50percent")),
        .models: DisplayRepresentation(title: "Models", image: .init(systemName: "cpu")),
        .activity: DisplayRepresentation(title: "Activity", image: .init(systemName: "square.grid.3x3")),
        .trend: DisplayRepresentation(title: "Trend", image: .init(systemName: "chart.xyaxis.line"))
    ]

    var title: String {
        switch self {
        case .overview: "Overview"
        case .quota: "Quota"
        case .models: "Models"
        case .activity: "Activity"
        case .trend: "Trend"
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
    static let title: LocalizedStringResource = "Token Monitor Page"
    static let description = IntentDescription("Choose the page shown by this widget instance.")

    @Parameter(title: "Display Page", default: .overview)
    var page: WidgetPage
}
