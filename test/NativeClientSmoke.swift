// Run on macOS against the same TLS server; tvOS UI still requires an Apple TV runtime.
import Foundation
@main struct NativeClientSmoke {
    static func main() async throws {
        let args = CommandLine.arguments
        let address = args[1], code = args[2], expected = args[3]
        let delegate = CertificateProbe()
        let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
        _ = try? await session.data(from: URL(string: address)!)
        session.invalidateAndCancel()
        guard delegate.fingerprint == expected else { fatalError("Certificate probe did not match") }
        let wrong = try ShareClient(address: address, fingerprint: "wrong")
        do {
            _ = try await wrong.request("/v1/pair", code: code)
            fatalError("Wrong certificate accepted")
        } catch {}
        let client = try ShareClient(address: address, fingerprint: expected)
        let paired = try await client.decode(PairResult.self, path: "/v1/pair", code: code)
        let authenticated = try ShareClient(address: address, fingerprint: expected, token: paired.token)
        let galleries = try await authenticated.decode(GalleryList.self, path: "/v1/galleries")
        guard let gallery = galleries.galleries.first else { fatalError("Missing gallery") }
        let photos = try await authenticated.decode(PhotoList.self, path: "/v1/galleries/\(gallery.id)")
        guard let photo = photos.images.first else { fatalError("Missing photo") }
        let bytes = try await authenticated.request(photo.mediaPath)
        guard !bytes.isEmpty else { fatalError("Missing image bytes") }
        for invalid in ["http://127.0.0.1:5443", "https://example.com", "https://127.0.0.1/path", "https://user:pass@127.0.0.1"] {
            do { _ = try ShareClient(address: invalid, fingerprint: expected); fatalError("Invalid address accepted") } catch {}
        }
        print("Native URLSession: probe, pin rejection, pairing, authenticated galleries and image passed")
    }
}
