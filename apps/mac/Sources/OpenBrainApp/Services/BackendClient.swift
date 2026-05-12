import Foundation

/// Models match the JSON returned by the Bun MCP server (port 6277) and UI
/// server (port 6279). Date strings are ISO-8601; we keep them as strings and
/// parse only when displayed to keep this layer simple.
struct Source: Codable, Identifiable, Hashable {
    let id: String
    var kind: String
    var name: String
    var config: [String: AnyCodable]
    var intervalSeconds: Int
    var enabled: Bool
    var lastSyncedAt: String?
    var lastError: String?
    var createdAt: String
    var updatedAt: String
}

struct Memory: Codable, Identifiable, Hashable {
    let id: String
    let content: String
    let summary: String?
    let source: String?
    let memoryType: String?
    let tags: [String]?
    let createdAt: String
    let sourceDate: String?
    let effectiveDate: String?
}

struct PollDueReport: Codable {
    let ok: Bool
    let count: Int
}

struct SyncReport: Codable {
    let sourceId: String
    let kind: String
    let ok: Bool
    let ingested: Int
    let duplicates: Int
    let error: String?
    let elapsedMs: Int
}

struct SyncResponse: Codable {
    let ok: Bool
    let report: SyncReport
}

/// Per-service health snapshot for the Services pane / status icon.
struct ServiceHealth: Equatable {
    var mcp: Bool = false
    var embed: Bool = false
    var llm: Bool = false
    var ui: Bool = false

    var allUp: Bool { mcp && embed && llm && ui }
}

actor BackendClient {
    private let mcpBase: URL
    private let uiBase: URL
    private let session: URLSession

    init(
        mcpBase: URL = URL(string: "http://127.0.0.1:6277")!,
        uiBase: URL = URL(string: "http://127.0.0.1:6279")!
    ) {
        self.mcpBase = mcpBase
        self.uiBase = uiBase
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 600
        cfg.timeoutIntervalForResource = 600
        self.session = URLSession(configuration: cfg)
    }

    // MARK: - Sources

    func listSources() async throws -> [Source] {
        try await get(mcpBase.appendingPathComponent("api/sources"))
    }

    func createSource(kind: String, name: String, config: [String: Any], intervalSeconds: Int = 900) async throws -> Source {
        let body: [String: Any] = [
            "kind": kind,
            "name": name,
            "config": config,
            "intervalSeconds": intervalSeconds,
        ]
        return try await post(mcpBase.appendingPathComponent("api/sources"), json: body)
    }

    func updateSource(id: String, fields: [String: Any]) async throws -> Source {
        try await patch(mcpBase.appendingPathComponent("api/sources/\(id)"), json: fields)
    }

    func deleteSource(id: String) async throws {
        var req = URLRequest(url: mcpBase.appendingPathComponent("api/sources/\(id)"))
        req.httpMethod = "DELETE"
        let (_, resp) = try await session.data(for: req)
        try Self.checkStatus(resp)
    }

    func syncSource(id: String) async throws -> SyncResponse {
        try await post(mcpBase.appendingPathComponent("api/sources/\(id)/sync"), json: [:])
    }

    func pollDue() async throws -> PollDueReport {
        try await post(mcpBase.appendingPathComponent("api/sources/poll-due"), json: [:])
    }

    // MARK: - Memories (read via UI server which exposes /api/memories)

    func recentMemories(limit: Int = 5) async throws -> [Memory] {
        var comps = URLComponents(url: uiBase.appendingPathComponent("api/memories"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        return try await get(comps.url!)
    }

    // MARK: - Health

    func probeHealth() async -> ServiceHealth {
        async let mcp = isUp(URL(string: "http://127.0.0.1:6277/health")!)
        async let embed = isUp(URL(string: "http://127.0.0.1:6278/health")!)
        async let llm = isUp(URL(string: "http://127.0.0.1:8000/v1/models")!)
        async let ui = isUp(URL(string: "http://127.0.0.1:6279/api/stats")!)
        return ServiceHealth(mcp: await mcp, embed: await embed, llm: await llm, ui: await ui)
    }

    private func isUp(_ url: URL) async -> Bool {
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.timeoutInterval = 3
        do {
            let (_, resp) = try await session.data(for: req)
            return (resp as? HTTPURLResponse)?.statusCode ?? 500 < 500
        } catch {
            return false
        }
    }

    // MARK: - Generic helpers

    private func get<T: Decodable>(_ url: URL) async throws -> T {
        let req = URLRequest(url: url)
        let (data, resp) = try await session.data(for: req)
        try Self.checkStatus(resp, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post<T: Decodable>(_ url: URL, json: [String: Any]) async throws -> T {
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: json)
        let (data, resp) = try await session.data(for: req)
        try Self.checkStatus(resp, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func patch<T: Decodable>(_ url: URL, json: [String: Any]) async throws -> T {
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: json)
        let (data, resp) = try await session.data(for: req)
        try Self.checkStatus(resp, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func checkStatus(_ resp: URLResponse, data: Data = Data()) throws {
        guard let http = resp as? HTTPURLResponse else { return }
        if http.statusCode >= 400 {
            let body = String(data: data, encoding: .utf8) ?? "<no body>"
            throw NSError(
                domain: "OpenBrain",
                code: http.statusCode,
                userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode): \(body)"],
            )
        }
    }
}

/// Type-erased Codable for free-form JSON (source.config).
struct AnyCodable: Codable, Hashable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self.value = NSNull()
        } else if let b = try? c.decode(Bool.self) {
            self.value = b
        } else if let i = try? c.decode(Int.self) {
            self.value = i
        } else if let d = try? c.decode(Double.self) {
            self.value = d
        } else if let s = try? c.decode(String.self) {
            self.value = s
        } else if let a = try? c.decode([AnyCodable].self) {
            self.value = a.map(\.value)
        } else if let o = try? c.decode([String: AnyCodable].self) {
            self.value = o.mapValues(\.value)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "AnyCodable: unsupported")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case is NSNull: try c.encodeNil()
        case let b as Bool: try c.encode(b)
        case let i as Int: try c.encode(i)
        case let d as Double: try c.encode(d)
        case let s as String: try c.encode(s)
        case let a as [Any]: try c.encode(a.map(AnyCodable.init))
        case let o as [String: Any]: try c.encode(o.mapValues(AnyCodable.init))
        default:
            throw EncodingError.invalidValue(value, .init(codingPath: encoder.codingPath, debugDescription: "AnyCodable: unsupported"))
        }
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(String(describing: value))
    }

    static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        String(describing: lhs.value) == String(describing: rhs.value)
    }
}
