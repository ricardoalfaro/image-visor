import Foundation
import CryptoKit
import Security

struct Gallery: Decodable, Identifiable { let id: String; let name: String; var count: Int? = nil; var cover: String? = nil }
struct GalleryList: Decodable { let galleries: [Gallery] }
struct Photo: Decodable, Identifiable {
    let id: String; let name: String; let folder: String; let mediaPath: String
    var displayPath: String? = nil; var thumbPath: String? = nil
}
struct PhotoList: Decodable { let images: [Photo] }
struct PairResult: Decodable { let token: String }
struct Credentials: Codable { let address: String; let fingerprint: String; let token: String }

enum ShareError: LocalizedError {
    case message(String)
    var errorDescription: String? { switch self { case .message(let text): return text } }
}

// Probe cancels TLS after reading the certificate. No code/token is sent until the
// user compares its fingerprint with the computer and explicitly confirms it.
final class CertificateProbe: NSObject, URLSessionDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?
    var fingerprint: String? { lock.lock(); defer { lock.unlock() }; return value }
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if let fingerprint = certificateFingerprint(challenge) {
            lock.lock(); value = fingerprint; lock.unlock()
        }
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
}
final class PinnedTrust: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    let fingerprint: String
    init(_ fingerprint: String) { self.fingerprint = fingerprint }
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard certificateFingerprint(challenge) == fingerprint,
              let trust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
private func certificateFingerprint(_ challenge: URLAuthenticationChallenge) -> String? {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let trust = challenge.protectionSpace.serverTrust,
          let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
          let cert = certificates.first else { return nil }
    return SHA256.hash(data: SecCertificateCopyData(cert) as Data).map { String(format: "%02X", $0) }.joined(separator: ":")
}
struct ShareClient {
    let base: URL
    let token: String
    private let session: URLSession
    init(address: String, fingerprint: String, token: String = "") throws {
        guard let url = URL(string: address.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", Self.isLocalHost(url.host), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else {
            throw ShareError.message("Introduce la dirección HTTPS local (IPv4 o .local) que muestra el computador, sin rutas.")
        }
        base = url; self.token = token
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 20
        config.urlCache = nil
        config.httpMaximumConnectionsPerHost = 4
        session = URLSession(configuration: config, delegate: PinnedTrust(fingerprint), delegateQueue: nil)
    }
    private static func isLocalHost(_ host: String?) -> Bool {
        guard let host else { return false }
        if host.lowercased().hasSuffix(".local") || host == "localhost" { return true }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return false }
        let bytes = parts.compactMap { UInt8($0) }
        guard bytes.count == 4 else { return false }
        return bytes[0] == 10 || bytes[0] == 127 || (bytes[0] == 192 && bytes[1] == 168)
            || (bytes[0] == 172 && (16...31).contains(bytes[1])) || (bytes[0] == 169 && bytes[1] == 254)
    }
    func request(_ path: String, code: String? = nil) async throws -> Data {
        guard path.hasPrefix("/v1/"), let url = URL(string: path, relativeTo: base)?.absoluteURL,
              url.host == base.host, url.port == base.port else { throw ShareError.message("Ruta no válida.") }
        var req = URLRequest(url: url)
        if let code {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: ["code": code])
        } else { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw ShareError.message("Respuesta no válida.") }
        guard http.statusCode == 200 else {
            if http.statusCode == 401 { throw ShareError.message("La vinculación caducó o fue revocada. Desvincula y vuelve a conectar.") }
            if http.statusCode == 429 { throw ShareError.message("Código caducado o bloqueado. Escribe pair en el computador.") }
            throw ShareError.message("El computador rechazó la solicitud (\(http.statusCode)). Revisa el código y la carpeta.")
        }
        return data
    }
    func decode<T: Decodable>(_ type: T.Type, path: String, code: String? = nil) async throws -> T {
        try JSONDecoder().decode(type, from: await request(path, code: code))
    }
}

enum CredentialStore {
    private static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "ImageViewerPro.LocalShare", kSecAttrAccount as String: "linked-computer"] }
    static func load() -> Credentials? {
        var q = query; q[kSecReturnData as String] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: data)
    }
    static func save(_ credentials: Credentials) throws {
        clear(); var q = query
        q[kSecValueData as String] = try JSONEncoder().encode(credentials)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw ShareError.message("No se pudo guardar la vinculación.") }
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}
