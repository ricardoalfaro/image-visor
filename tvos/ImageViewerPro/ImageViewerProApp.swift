import ImageIO
import SwiftUI
import UIKit

@main
struct ImageViewerProApp: App {
    @StateObject private var model = LibraryModel()
    var body: some Scene { WindowGroup { RootView().environmentObject(model).preferredColorScheme(.dark) } }
}

// MARK: - Model

@MainActor
final class LibraryModel: ObservableObject {
    @Published var client: ShareClient?
    @Published var galleries: [Gallery] = []
    @Published var error: String?
    @Published var loaded = false
    init() {
        if let saved = CredentialStore.load() { client = try? ShareClient(address: saved.address, fingerprint: saved.fingerprint, token: saved.token) }
    }
    func refresh(silent: Bool = false) async {
        guard let client else { return }
        do { galleries = try await client.decode(GalleryList.self, path: "/v1/galleries").galleries }
        catch {
            if error is CancellationError { return }
            // A revoked or expired session sends the user straight back to pairing.
            if error.localizedDescription.contains("vinculación caducó") { unlink() } else if !silent { self.error = error.localizedDescription }
        }
        loaded = true
    }
    func unlink() { CredentialStore.clear(); client = nil; galleries = []; error = nil; loaded = false }
}

/// Downloads, downsamples and caches images so the next photo is already on screen when needed.
@MainActor
final class ImageStore {
    static let shared = ImageStore()
    private let cache = NSCache<NSString, UIImage>()
    private var tasks: [String: Task<UIImage, Error>] = [:]
    init() { cache.totalCostLimit = 400 * 1024 * 1024 }

    func cached(_ path: String, maxPixel: Int) -> UIImage? { cache.object(forKey: key(path, maxPixel)) }

    func image(_ path: String, client: ShareClient, maxPixel: Int, cache useCache: Bool = true) async throws -> UIImage {
        let cacheKey = key(path, maxPixel)
        if let hit = cache.object(forKey: cacheKey) { return hit }
        let taskKey = "\(path)#\(maxPixel)"
        if let running = tasks[taskKey] { return try await running.value }
        let task = Task { () throws -> UIImage in
            let data = try await client.request(path)
            return try await Self.decode(data, maxPixel: maxPixel)
        }
        tasks[taskKey] = task
        defer { tasks[taskKey] = nil }
        let image = try await task.value
        // Very large zoom images are not cached so they do not evict the next photos.
        if useCache { cache.setObject(image, forKey: cacheKey, cost: Int(image.size.width * image.size.height * 4)) }
        return image
    }

    func prefetch(_ path: String?, client: ShareClient, maxPixel: Int) {
        guard let path else { return }
        Task { _ = try? await image(path, client: client, maxPixel: maxPixel) }
    }

    private func key(_ path: String, _ maxPixel: Int) -> NSString { "\(path)#\(maxPixel)" as NSString }

    nonisolated private static func decode(_ data: Data, maxPixel: Int) async throws -> UIImage {
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel, kCGImageSourceCreateThumbnailWithTransform: true]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw ShareError.message("Formato de imagen no compatible")
        }
        return UIImage(cgImage: cg)
    }
}

// MARK: - Root

struct RootView: View {
    @EnvironmentObject private var model: LibraryModel
    @State private var source: PhotoSource?
    var body: some View {
        ZStack {
            AuroraBackground().ignoresSafeArea()
            Group {
                switch source {
                case .none: SourceChooser(source: $source)
                case .local: if model.client != nil { HomeView(source: $source) } else { PairView(source: $source) }
                }
            }
        }
        .alert("No se pudo conectar", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("Aceptar") { model.error = nil }
        } message: { Text(model.error ?? "") }
    }
}

enum PhotoSource { case local }

/// Near-black canvas with a yellow glow top-left and an orange one top-right that drift slowly.
struct AuroraBackground: View {
    @State private var drift = false
    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color(red: 0.04, green: 0.04, blue: 0.04)
                Circle().fill(Color(red: 1.0, green: 0.93, blue: 0.0).opacity(0.85))
                    .frame(width: geo.size.width * 0.5).blur(radius: 170)
                    .offset(x: -geo.size.width * (drift ? 0.34 : 0.42), y: -geo.size.height * (drift ? 0.34 : 0.28))
                Circle().fill(Color(red: 1.0, green: 0.45, blue: 0.0).opacity(0.8))
                    .frame(width: geo.size.width * 0.42).blur(radius: 170)
                    .offset(x: geo.size.width * (drift ? 0.42 : 0.34), y: -geo.size.height * (drift ? 0.30 : 0.38))
            }
            .frame(width: geo.size.width, height: geo.size.height).clipped()
        }
        .onAppear { withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) { drift = true } }
    }
}

/// First screen on every launch: where do the photos come from?
struct SourceChooser: View {
    @Binding var source: PhotoSource?
    var body: some View {
        VStack(spacing: 60) {
            VStack(spacing: 12) {
                Image("AppLogo").resizable().scaledToFit().frame(width: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous)).shadow(color: .black.opacity(0.5), radius: 30, y: 12)
                Text("Image Viewer Pro").font(.largeTitle).bold()
                Text("¿Desde dónde quieres ver tus fotos?").font(.title3).foregroundStyle(.secondary)
            }
            HStack(spacing: 50) {
                Button { source = .local } label: {
                    VStack(spacing: 14) {
                        Image(systemName: "desktopcomputer").font(.system(size: 70))
                        Text("Fotos locales").font(.title3).bold()
                        Text("Las galerías de tu computador").font(.caption).foregroundStyle(.secondary)
                    }.frame(width: 440, height: 300)
                }.buttonStyle(.card)
                Button {} label: {
                    VStack(spacing: 14) {
                        Image(systemName: "externaldrive.badge.icloud").font(.system(size: 70))
                        Text("Google Drive").font(.title3).bold()
                        Text("Próximamente").font(.caption).foregroundStyle(.secondary)
                    }.frame(width: 440, height: 300).opacity(0.45)
                }.buttonStyle(.card).disabled(true)
            }
        }.padding(60)
    }
}

// MARK: - Pairing

struct FoundComputer: Identifiable, Hashable { let id: String; let name: String; let address: String }

/// Finds computers running `tv-server.js` through Bonjour, so nobody has to type an IP address.
final class ComputerFinder: NSObject, ObservableObject, NetServiceBrowserDelegate, NetServiceDelegate {
    @Published var computers: [FoundComputer] = []
    private let browser = NetServiceBrowser()
    private var pending: [String: NetService] = [:]
    func start() {
        browser.delegate = self
        browser.searchForServices(ofType: "_ivp-tv._tcp.", inDomain: "local.")
    }
    func stop() { browser.stop(); pending.removeAll() }
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        pending[service.name] = service
        service.delegate = self
        service.resolve(withTimeout: 8)
    }
    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        pending[service.name] = nil
        computers.removeAll { $0.id == service.name }
    }
    func netServiceDidResolveAddress(_ sender: NetService) {
        guard var host = sender.hostName, sender.port > 0 else { return }
        if host.hasSuffix(".") { host.removeLast() }
        let computer = FoundComputer(id: sender.name, name: sender.name, address: "https://\(host):\(sender.port)")
        if let index = computers.firstIndex(where: { $0.id == computer.id }) { computers[index] = computer } else { computers.append(computer) }
    }
}

/// Just the code: type the 8 digits shown on the computer and the TV links itself.
struct PairView: View {
    @EnvironmentObject private var model: LibraryModel
    @Binding var source: PhotoSource?
    @StateObject private var finder = ComputerFinder()
    @State private var digits = ""
    @State private var busy = false
    @State private var message: String?
    @State private var searchTimedOut = false
    private let rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", "⌫"]]

    var body: some View {
        VStack(spacing: 50) {
            HStack(spacing: 14) {
                ForEach(0..<8, id: \.self) { slot in
                    if slot == 4 { Color.clear.frame(width: 26, height: 1) }
                    ZStack {
                        RoundedRectangle(cornerRadius: 18).fill(.white.opacity(slot < digits.count ? 0.22 : 0.09))
                        if slot < digits.count {
                            Text(String(digits[digits.index(digits.startIndex, offsetBy: slot)]))
                                .font(.system(size: 64, weight: .semibold, design: .rounded))
                        }
                    }.frame(width: 92, height: 118)
                }
            }
            VStack(spacing: 18) {
                ForEach(rows, id: \.self) { row in
                    HStack(spacing: 18) {
                        ForEach(row, id: \.self) { key in
                            if key.isEmpty { Color.clear.frame(width: 130, height: 84) }
                            else {
                                Button { press(key) } label: {
                                    Group { if key == "⌫" { Image(systemName: "delete.left") } else { Text(key) } }
                                        .font(.title).frame(width: 130, height: 84)
                                }
                            }
                        }
                    }
                }
            }.disabled(busy)
            // Only speaks up when something is wrong.
            Group {
                if busy { ProgressView() }
                else if let message { Text(message).foregroundStyle(.red) }
                else if finder.computers.isEmpty && searchTimedOut { Label("No encuentro tu computador", systemImage: "wifi.exclamationmark").foregroundStyle(.secondary) }
                else { Color.clear }
            }.frame(height: 50).font(.title3)
        }
        .padding(60)
        .onAppear { finder.start() }
        .onDisappear { finder.stop() }
        .onChange(of: digits) { _, value in if value.count == 8 { Task { await submit() } } }
        .onExitCommand { source = nil }
        .task { try? await Task.sleep(for: .seconds(8)); searchTimedOut = true }
    }

    private func press(_ key: String) {
        message = nil
        if key == "⌫" { if !digits.isEmpty { digits.removeLast() } }
        else if digits.count < 8 { digits.append(key) }
    }

    private func submit() async {
        busy = true; defer { busy = false }
        let code = digits
        do {
            guard let computer = finder.computers.first else { throw ShareError.message("No encuentro tu computador") }
            let fingerprint = try await readFingerprint(computer.address)
            let client = try ShareClient(address: computer.address, fingerprint: fingerprint)
            let result = try await client.decode(PairResult.self, path: "/v1/pair", code: code)
            try CredentialStore.save(Credentials(address: computer.address, fingerprint: fingerprint, token: result.token))
            model.client = try ShareClient(address: computer.address, fingerprint: fingerprint, token: result.token)
        } catch {
            let text = error.localizedDescription
            message = text.contains("403") ? "Código incorrecto" : text.contains("429") || text.contains("caducado") ? "Código caducado. Genera uno nuevo." : text
            digits = ""
        }
    }

    /// Reads the server certificate and pins it; the code is only sent over that pinned connection.
    private func readFingerprint(_ address: String) async throws -> String {
        let validation = try ShareClient(address: address, fingerprint: "")
        let delegate = CertificateProbe()
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 15
        let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        _ = try? await session.data(from: validation.base)
        guard let found = delegate.fingerprint else { throw ShareError.message("No se pudo conectar con el computador") }
        return found
    }
}

// MARK: - Home: choose a gallery

struct CoverImage: View {
    let path: String?
    let client: ShareClient
    var maxPixel = 800
    @State private var image: UIImage?
    var body: some View {
        ZStack {
            Color.white.opacity(0.08)
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else { Image(systemName: "photo.on.rectangle.angled").font(.system(size: 60)).foregroundStyle(.secondary) }
        }
        .task(id: path) {
            guard let path else { return }
            image = try? await ImageStore.shared.image(path, client: client, maxPixel: maxPixel)
        }
    }
}

struct HomeView: View {
    @Binding var source: PhotoSource?
    @EnvironmentObject private var model: LibraryModel
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("slideshowSeconds") private var seconds = 8
    @AppStorage("shuffle") private var shuffle = false
    @State private var opened: Gallery?
    @State private var browsing: Gallery?
    @State private var longPressed = false
    @State private var hint: String?
    private let intervals = [5, 8, 15, 30]
    private var folders: [Gallery] { model.galleries.filter { $0.kind != "collection" } }
    // Favoritos and collections are copies kept by the desktop app; empty ones are hidden.
    private var collections: [Gallery] { model.galleries.filter { $0.kind == "collection" && ($0.count ?? 0) > 0 } }

    /// Icon-only toolbar button; the accessibility label keeps VoiceOver working.
    private func toolButton(_ label: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Label(label, systemImage: symbol).labelStyle(.iconOnly).font(.title3).frame(width: 64, height: 40) }
    }

    private func flash(_ text: String) {
        withAnimation { hint = text }
        Task { try? await Task.sleep(for: .seconds(1.6)); withAnimation { if hint == text { hint = nil } } }
    }

    private func galleryGrid(_ items: [Gallery], client: ShareClient) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 440), spacing: 50)], spacing: 50) {
            ForEach(items) { gallery in
                Button {
                    if longPressed { longPressed = false } else { opened = gallery }
                } label: {
                    ZStack(alignment: .bottomLeading) {
                        CoverImage(path: gallery.cover, client: client).frame(height: 280).clipped()
                        LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(gallery.name).font(.title3).bold().lineLimit(1)
                            if let count = gallery.count { Text("\(count) fotos").font(.caption).foregroundStyle(.secondary) }
                        }.padding(20)
                    }
                }.buttonStyle(.card)
                // Holding Select opens the thumbnail grid instead of the slideshow.
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.6).onEnded { _ in longPressed = true; browsing = gallery })
            }
        }
    }

    var body: some View {
        if let client = model.client {
            ScrollView {
                VStack(alignment: .leading, spacing: 40) {
                    HStack(spacing: 28) {
                        Text("Galerías").font(.largeTitle).bold()
                        Spacer()
                        if let hint { Text(hint).font(.callout).foregroundStyle(.secondary).transition(.opacity) }
                        toolButton("Tiempo de presentación", "timer") {
                            seconds = intervals[((intervals.firstIndex(of: seconds) ?? -1) + 1) % intervals.count]
                            flash("Presentación: \(seconds) s")
                        }
                        toolButton(shuffle ? "Orden aleatorio" : "Orden secuencial", shuffle ? "shuffle" : "arrow.right") {
                            shuffle.toggle()
                            flash(shuffle ? "Orden aleatorio" : "Orden secuencial")
                        }
                        toolButton("Actualizar", "arrow.clockwise") { Task { await model.refresh() }; flash("Actualizando…") }
                        toolButton("Cambiar origen", "rectangle.2.swap") { source = nil }
                        toolButton("Desvincular computador", "power") { model.unlink() }
                    }
                    if folders.isEmpty && collections.isEmpty && model.loaded {
                        Text("No hay galerías disponibles. En el computador, abre carpetas en Image Viewer Pro y pulsa «Vincular TV».").foregroundStyle(.secondary)
                    }
                    galleryGrid(folders, client: client)
                    if !collections.isEmpty {
                        Text("Colecciones").font(.largeTitle).bold().padding(.top, 20)
                        galleryGrid(collections, client: client)
                    }
                }.padding(60)
            }
            .task { await model.refresh() }
            // Keeps the list equal to the desktop app while this screen is open (folders added or removed there).
            .task { while !Task.isCancelled { try? await Task.sleep(for: .seconds(8)); await model.refresh(silent: true) } }
            .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await model.refresh() } } }
            .fullScreenCover(item: $opened, onDismiss: { Task { await model.refresh() } }) { gallery in
                ViewerScreen(gallery: gallery, client: client, seconds: seconds, shuffle: shuffle)
            }
            .fullScreenCover(item: $browsing) { gallery in
                ThumbnailsScreen(gallery: gallery, client: client, seconds: seconds)
            }
        }
    }
}

// MARK: - Thumbnails

/// Grid of thumbnails for one gallery; selecting a photo opens the viewer on it.
struct ThumbnailsScreen: View {
    let gallery: Gallery
    let client: ShareClient
    let seconds: Int
    @State private var photos: [Photo] = []
    @State private var loading = true
    @State private var open: Photo?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            AuroraBackground().ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    Text(gallery.name).font(.largeTitle).bold()
                    if loading { ProgressView() }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 28), count: 6), spacing: 28) {
                        ForEach(photos) { photo in
                            Button { open = photo } label: {
                                // Fixed 4:3 cell; the photo fills it and is cropped, so every tile is identical.
                                Color.clear.aspectRatio(4.0 / 3.0, contentMode: .fit)
                                    .overlay(CoverImage(path: photo.thumbPath ?? photo.displayPath, client: client, maxPixel: 480))
                                    .clipped()
                            }.buttonStyle(.card)
                        }
                    }
                }.padding(60)
            }
        }
        .onExitCommand { dismiss() }
        .task {
            photos = (try? await client.decode(PhotoList.self, path: "/v1/galleries/\(gallery.id)").images) ?? []
            loading = false
        }
        .fullScreenCover(item: $open) { photo in
            ViewerScreen(gallery: gallery, client: client, seconds: seconds, shuffle: false, startID: photo.id)
        }
    }
}

// MARK: - Immersive viewer

/// Full-screen photo with no permanent controls.
/// Swipe left/right: change photo · Play/Pause: slideshow · Select: show the name · Menu: back.
struct ViewerScreen: View {
    let gallery: Gallery
    let client: ShareClient
    let seconds: Int
    let shuffle: Bool
    var startID: String? = nil

    @State private var photos: [Photo] = []
    @State private var index = 0
    @State private var shown: UIImage?
    @State private var shownIndex = -1
    @State private var playing = false
    @State private var status: LoadStatus = .loading
    @State private var infoVisible = false
    @State private var toast: String?
    @State private var infoTimer: Task<Void, Never>?
    @State private var zoomLevel = 0
    @State private var offset = CGSize.zero
    @State private var zoomImage: UIImage?
    @State private var zoomTask: Task<Void, Never>?
    @State private var viewSize = CGSize.zero
    @State private var zoomBadge: String?
    @FocusState private var focused: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    enum LoadStatus: Equatable { case loading, ready, failed(String) }
    private let screenPixels = 2560
    private let zoomPixels = 6144
    private let zoomScales: [CGFloat] = [1, 2, 3.5, 5, 8]
    private var scale: CGFloat { zoomScales[zoomLevel] }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let image = zoomImage ?? shown {
                Image(uiImage: image).resizable().scaledToFit()
                    .frame(width: viewSize.width, height: viewSize.height)
                    .scaleEffect(scale).offset(offset)
                    .ignoresSafeArea().id(shownIndex).transition(.opacity)
            }
            switch status {
            case .loading where shown == nil: ProgressView().scaleEffect(2)
            case .failed(let message) where shown == nil:
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle").font(.system(size: 60))
                    Text(message).multilineTextAlignment(.center)
                    Text("Pulsa para reintentar · Menú para volver").font(.caption).foregroundStyle(.secondary)
                }.padding(80)
            default: EmptyView()
            }
            if infoVisible, photos.indices.contains(index) {
                VStack { Spacer()
                    HStack { VStack(alignment: .leading, spacing: 6) {
                        Text(photos[index].name).font(.headline).lineLimit(1)
                        Text("\(index + 1) de \(photos.count)\(photos[index].folder.isEmpty ? "" : " · \(photos[index].folder)")").font(.caption).foregroundStyle(.secondary)
                    }; Spacer() }
                    .padding(.horizontal, 60).padding(.vertical, 28)
                    .background(LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom))
                }.transition(.opacity).allowsHitTesting(false)
            }
            if let zoomBadge {
                VStack { HStack { Spacer()
                    Label(zoomBadge, systemImage: "plus.magnifyingglass").font(.title3)
                        .padding(.horizontal, 24).padding(.vertical, 12).background(.ultraThinMaterial, in: Capsule())
                }; Spacer() }.padding(50).transition(.opacity).allowsHitTesting(false)
            }
            if let toast {
                Label(toast, systemImage: playing ? "play.fill" : "pause.fill").font(.title3)
                    .padding(.horizontal, 28).padding(.vertical, 16).background(.ultraThinMaterial, in: Capsule())
                    .transition(.opacity).allowsHitTesting(false)
            }
        }
        .background(GeometryReader { geo in Color.clear.onAppear { viewSize = geo.size }.onChange(of: geo.size) { _, size in viewSize = size } }.ignoresSafeArea())
        .focusable().focused($focused).focusEffectDisabled()
        .onMoveCommand { direction in
            if zoomLevel > 0 { pan(direction); return }
            if direction == .left { move(-1) }
            if direction == .right { move(1) }
            if direction == .up { flashInfo() }
        }
        // Select: zoom in (and keep zooming). Menu: zoom out one step, then close the viewer.
        .onTapGesture { if case .failed = status, shown == nil { Task { await load() } } else { zoomIn() } }
        .onPlayPauseCommand { if zoomLevel == 0 { togglePlaying() } }
        .onExitCommand { if zoomLevel > 0 { zoomOut() } else { dismiss() } }
        .onChange(of: scenePhase) { _, phase in if phase != .active { playing = false } }
        .onAppear { focused = true; UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { playing = false; UIApplication.shared.isIdleTimerDisabled = false }
        .task { await load() }
        .task(id: index) { resetZoom(); await show(index) }
        .task(id: SlideKey(playing: playing, index: index, shownIndex: shownIndex, seconds: seconds)) {
            guard playing, shownIndex == index else { return }
            do { try await Task.sleep(for: .seconds(seconds)); try Task.checkCancellation(); move(1) } catch {}
        }
    }

    struct SlideKey: Hashable { let playing: Bool; let index: Int; let shownIndex: Int; let seconds: Int }

    private func load() async {
        status = .loading
        do {
            var list = try await client.decode(PhotoList.self, path: "/v1/galleries/\(gallery.id)").images
            guard !list.isEmpty else { status = .failed("Esta galería no tiene fotos JPEG, PNG o HEIC."); return }
            if shuffle && startID == nil { list.shuffle() }
            photos = list
            let saved = shuffle ? 0 : UserDefaults.standard.integer(forKey: "position.\(gallery.id)")
            index = list.indices.contains(saved) ? saved : 0
            if let startID, let start = list.firstIndex(where: { $0.id == startID }) { index = start }
            await show(index)
        } catch { status = .failed(error.localizedDescription) }
    }

    private func path(_ photo: Photo) -> String { photo.displayPath ?? photo.mediaPath }

    private func show(_ target: Int) async {
        guard photos.indices.contains(target) else { return }
        if !shuffle { UserDefaults.standard.set(target, forKey: "position.\(gallery.id)") }
        do {
            let image = try await ImageStore.shared.image(path(photos[target]), client: client, maxPixel: screenPixels)
            try Task.checkCancellation()
            withAnimation(.easeInOut(duration: 0.45)) { shown = image; shownIndex = target }
            status = .ready
            for offset in [1, 2, -1] { // keep the next photos warm
                let next = (target + offset + photos.count) % photos.count
                ImageStore.shared.prefetch(path(photos[next]), client: client, maxPixel: screenPixels)
            }
        } catch is CancellationError {
        } catch {
            if shown == nil { status = .failed(error.localizedDescription) }
            else if playing { move(1) } // skip a photo that cannot be read
        }
    }

    private func fitSize(_ image: CGSize, in container: CGSize) -> CGSize {
        let ratio = min(container.width / image.width, container.height / image.height)
        return CGSize(width: image.width * ratio, height: image.height * ratio)
    }

    /// Keeps the zoomed photo from being dragged past its own edges.
    private func clamp(_ value: CGSize, level: Int) -> CGSize {
        guard let image = zoomImage ?? shown, viewSize.width > 0, image.size.width > 0 else { return .zero }
        let fit = fitSize(image.size, in: viewSize)
        let factor = zoomScales[level]
        let maxX = max(0, (fit.width * factor - viewSize.width) / 2)
        let maxY = max(0, (fit.height * factor - viewSize.height) / 2)
        return CGSize(width: min(max(value.width, -maxX), maxX), height: min(max(value.height, -maxY), maxY))
    }

    private func zoomIn() {
        guard shown != nil, photos.indices.contains(index) else { return }
        if zoomLevel == 0 {
            playing = false
            loadZoomImage()
        }
        let next = min(zoomLevel + 1, zoomScales.count - 1)
        withAnimation(.easeInOut(duration: 0.3)) { zoomLevel = next; offset = clamp(offset, level: next) }
        flashBadge()
    }

    private func zoomOut() {
        let next = max(zoomLevel - 1, 0)
        withAnimation(.easeInOut(duration: 0.3)) { zoomLevel = next; offset = next == 0 ? .zero : clamp(offset, level: next) }
        if next == 0 { zoomTask?.cancel(); zoomImage = nil } else { flashBadge() }
    }

    private func resetZoom() {
        zoomTask?.cancel(); zoomImage = nil; zoomLevel = 0; offset = .zero
    }

    private func pan(_ direction: MoveCommandDirection) {
        let stepX = viewSize.width * 0.14, stepY = viewSize.height * 0.14
        var next = offset
        switch direction { // moving right reveals the right side, so the photo shifts left
        case .left: next.width += stepX
        case .right: next.width -= stepX
        case .up: next.height += stepY
        case .down: next.height -= stepY
        @unknown default: break
        }
        withAnimation(.easeOut(duration: 0.18)) { offset = clamp(next, level: zoomLevel) }
    }

    /// The screen-size copy gets soft when magnified, so fetch the original at higher resolution.
    private func loadZoomImage() {
        zoomTask?.cancel()
        guard photos.indices.contains(index) else { return }
        let photo = photos[index]; let target = index
        zoomTask = Task {
            guard let image = try? await ImageStore.shared.image(photo.mediaPath, client: client, maxPixel: zoomPixels, cache: false),
                  !Task.isCancelled, zoomLevel > 0, index == target else { return }
            zoomImage = image
        }
    }

    private func flashBadge() {
        let text = String(format: "%g×", Double(zoomScales[zoomLevel]))
        withAnimation { zoomBadge = text }
        Task { try? await Task.sleep(for: .seconds(1.4)); withAnimation { if zoomBadge == text { zoomBadge = nil } } }
    }

    private func move(_ delta: Int) {
        guard photos.count > 1 else { return }
        index = (index + delta + photos.count) % photos.count
        if infoVisible { flashInfo() }
    }

    private func togglePlaying() {
        playing.toggle()
        flash(playing ? "Presentación" : "Pausa")
    }

    private func flash(_ text: String) {
        withAnimation { toast = text }
        Task { try? await Task.sleep(for: .seconds(1.4)); withAnimation { if toast == text { toast = nil } } }
    }

    private func flashInfo() {
        withAnimation { infoVisible = true }
        infoTimer?.cancel()
        infoTimer = Task { try? await Task.sleep(for: .seconds(3)); if !Task.isCancelled { withAnimation { infoVisible = false } } }
    }
}
