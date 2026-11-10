import AVFoundation
import AVKit
import SwiftUI

/// AVPlayer cannot trust the pinned self-signed certificate nor send the Bearer token by itself,
/// so it asks this loader for byte ranges and they are fetched through `ShareClient`.
final class VideoLoader: NSObject, AVAssetResourceLoaderDelegate, @unchecked Sendable {
    private let client: ShareClient
    private let path: String
    private let contentType: String
    private let lock = NSLock()
    private var knownTotal: Int?
    private let chunk = 2 * 1024 * 1024

    init(client: ShareClient, photo: Photo) {
        self.client = client; path = photo.mediaPath
        contentType = photo.name.lowercased().hasSuffix(".mov") ? "com.apple.quicktime-movie" : "public.mpeg-4"
    }

    func makeAsset() -> AVURLAsset {
        let asset = AVURLAsset(url: URL(string: "ivp-video://media/video")!)
        asset.resourceLoader.setDelegate(self, queue: DispatchQueue(label: "ivp.video.loader"))
        return asset
    }

    func resourceLoader(_ loader: AVAssetResourceLoader, shouldWaitForLoadingOfRequestedResource request: AVAssetResourceLoadingRequest) -> Bool {
        Task { await handle(request) }
        return true
    }

    private func total() async throws -> Int {
        lock.lock(); let cached = knownTotal; lock.unlock()
        if let cached { return cached }
        let size = try await client.range(path, from: 0, to: 0).total
        lock.lock(); knownTotal = size; lock.unlock()
        return size
    }

    private func handle(_ request: AVAssetResourceLoadingRequest) async {
        do {
            let size = try await total()
            if let info = request.contentInformationRequest {
                info.contentType = contentType
                info.contentLength = Int64(size)
                info.isByteRangeAccessSupported = true
            }
            if let data = request.dataRequest {
                var offset = Int(data.requestedOffset)
                let end = data.requestsAllDataToEndOfResource ? size - 1 : min(size - 1, offset + data.requestedLength - 1)
                while offset <= end, !request.isCancelled, !request.isFinished {
                    let piece = try await client.range(path, from: offset, to: min(end, offset + chunk - 1)).data
                    if piece.isEmpty { break }
                    data.respond(with: piece)
                    offset += piece.count
                }
            }
            if !request.isFinished { request.finishLoading() }
        } catch {
            if !request.isFinished { request.finishLoading(with: error) }
        }
    }
}

/// Native Apple TV player (transport bar, seeking, audio tracks) for one video.
struct VideoPlayerView: UIViewControllerRepresentable {
    let client: ShareClient
    let photo: Photo
    let onEnd: () -> Void

    final class Coordinator {
        let loader: VideoLoader
        var observer: NSObjectProtocol?
        init(loader: VideoLoader) { self.loader = loader }
        deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
    }

    func makeCoordinator() -> Coordinator { Coordinator(loader: VideoLoader(client: client, photo: photo)) }

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let item = AVPlayerItem(asset: context.coordinator.loader.makeAsset())
        let player = AVPlayer(playerItem: item)
        let controller = AVPlayerViewController()
        controller.player = player
        context.coordinator.observer = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { _ in onEnd() }
        player.play()
        return controller
    }

    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {}

    static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: Coordinator) { controller.player?.pause() }
}
