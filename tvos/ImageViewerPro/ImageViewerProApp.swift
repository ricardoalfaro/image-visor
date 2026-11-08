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

    func image(_ path: String, client: ShareClient, maxPixel: Int) async throws -> UIImage {
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
        cache.setObject(image, forKey: cacheKey, cost: Int(image.size.width * image.size.height * 4))
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
        Group {
            switch source {
            case .none: SourceChooser(source: $source)
            case .local: if model.client != nil { HomeView(source: $source) } else { PairView(source: $source) }
            }
        }
        .alert("No se pudo conectar", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("Aceptar") { model.error = nil }
        } message: { Text(model.error ?? "") }
    }
}

enum PhotoSource { case local }

/// First screen on every launch: where do the photos come from?
struct SourceChooser: View {
    @Binding var source: PhotoSource?
    var body: some View {
        VStack(spacing: 60) {
            VStack(spacing: 12) {
                Image(systemName: "photo.on.rectangle.angled").font(.system(size: 90))
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

struct PairView: View {
    @EnvironmentObject private var model: LibraryModel
    @Binding var source: PhotoSource?
    @StateObject private var finder = ComputerFinder()
    @State private var address = "https://"
    @State private var code = ""
    @State private var fingerprint: String?
    @State private var verifiedAddress = ""
    @State private var busy = false
    @State private var manual = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Label("Esperando el código", systemImage: "link").font(.largeTitle)
                Text("En tu computador abre Image Viewer Pro y pulsa «Vincular TV». Escribe aquí el código que aparece.").font(.title3)
                if finder.computers.isEmpty {
                    Text("Buscando tu computador… Comprueba que el servicio esté activo y que ambos equipos estén en la misma red.").foregroundStyle(.secondary)
                } else if fingerprint == nil {
                    Text("Computadores encontrados").font(.headline)
                    ForEach(finder.computers) { computer in
                        Button { address = computer.address; Task { await probe() } } label: {
                            Label(computer.name, systemImage: "desktopcomputer")
                        }
                    }
                }
                Button(manual ? "Ocultar dirección manual" : "Introducir la dirección a mano") { manual.toggle() }
                if manual {
                    TextField("Dirección HTTPS del computador", text: $address).autocorrectionDisabled().textInputAutocapitalization(.never)
                    Button(busy ? "Conectando…" : "Comprobar computador") { Task { await probe() } }.disabled(busy)
                }
                if let fingerprint {
                    Text("Comprueba que esta huella sea la misma que muestra «Vincular TV» en el computador. Si no coincide, no continúes.")
                    Text(fingerprint).font(.system(size: 24, design: .monospaced))
                    TextField("Código de 8 dígitos", text: $code)
                    Button("La huella coincide · Vincular") { Task { await pair(fingerprint) } }.disabled(busy || digits.count != 8)
                }
                Button("Cambiar origen") { source = nil }.foregroundStyle(.secondary)
            }.frame(maxWidth: 1100).padding(70)
        }
        .onAppear { finder.start() }
        .onDisappear { finder.stop() }
        .onChange(of: address) { _, _ in fingerprint = nil }
        // With a single computer on the network there is nothing to choose: read its certificate right away.
        .onChange(of: finder.computers) { _, computers in
            if computers.count == 1, fingerprint == nil, !busy, let only = computers.first { address = only.address; Task { await probe() } }
        }
    }
    private var digits: String { code.filter(\.isNumber) }
    private func probe() async {
        busy = true; fingerprint = nil; defer { busy = false }
        do {
            let validation = try ShareClient(address: address, fingerprint: "")
            let delegate = CertificateProbe()
            let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 15
            let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            _ = try? await session.data(from: validation.base)
            guard let found = delegate.fingerprint else { throw ShareError.message("No se pudo leer el certificado. Revisa dirección, Wi-Fi y firewall.") }
            verifiedAddress = address; fingerprint = found
        } catch { model.error = error.localizedDescription }
    }
    private func pair(_ fingerprint: String) async {
        busy = true; defer { busy = false }
        do {
            guard verifiedAddress == address else { throw ShareError.message("Comprueba de nuevo el computador.") }
            let client = try ShareClient(address: verifiedAddress, fingerprint: fingerprint)
            let result = try await client.decode(PairResult.self, path: "/v1/pair", code: digits)
            try CredentialStore.save(Credentials(address: verifiedAddress, fingerprint: fingerprint, token: result.token))
            model.client = try ShareClient(address: verifiedAddress, fingerprint: fingerprint, token: result.token)
        } catch { model.error = error.localizedDescription }
    }
}

// MARK: - Home: choose a gallery

struct CoverImage: View {
    let path: String?
    let client: ShareClient
    @State private var image: UIImage?
    var body: some View {
        ZStack {
            Color.white.opacity(0.08)
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else { Image(systemName: "photo.on.rectangle.angled").font(.system(size: 60)).foregroundStyle(.secondary) }
        }
        .task(id: path) {
            guard let path else { return }
            image = try? await ImageStore.shared.image(path, client: client, maxPixel: 800)
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
    private let intervals = [5, 8, 15, 30]
    private var folders: [Gallery] { model.galleries.filter { $0.kind != "collection" } }
    // Favoritos and collections are copies kept by the desktop app; empty ones are hidden.
    private var collections: [Gallery] { model.galleries.filter { $0.kind == "collection" && ($0.count ?? 0) > 0 } }

    private func galleryGrid(_ items: [Gallery], client: ShareClient) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 440), spacing: 50)], spacing: 50) {
            ForEach(items) { gallery in
                Button { opened = gallery } label: {
                    ZStack(alignment: .bottomLeading) {
                        CoverImage(path: gallery.cover, client: client).frame(height: 280).clipped()
                        LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(gallery.name).font(.title3).bold().lineLimit(1)
                            if let count = gallery.count { Text("\(count) fotos").font(.caption).foregroundStyle(.secondary) }
                        }.padding(20)
                    }
                }.buttonStyle(.card)
            }
        }
    }

    var body: some View {
        if let client = model.client {
            ScrollView {
                VStack(alignment: .leading, spacing: 40) {
                    Text("Galerías").font(.largeTitle).bold()
                    if folders.isEmpty && collections.isEmpty && model.loaded {
                        Text("No hay galerías disponibles. En el computador, abre carpetas en Image Viewer Pro y pulsa «Vincular TV».").foregroundStyle(.secondary)
                    }
                    galleryGrid(folders, client: client)
                    if !collections.isEmpty {
                        Text("Colecciones").font(.largeTitle).bold().padding(.top, 20)
                        galleryGrid(collections, client: client)
                    }
                    HStack(spacing: 30) {
                        Button("Presentación: \(seconds) s") { seconds = intervals[((intervals.firstIndex(of: seconds) ?? -1) + 1) % intervals.count] }
                        Button(shuffle ? "Orden: aleatorio" : "Orden: secuencial") { shuffle.toggle() }
                        Button("Actualizar") { Task { await model.refresh() } }
                        Button("Cambiar origen") { source = nil }
                        Button("Desvincular", role: .destructive) { model.unlink() }
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

    @State private var photos: [Photo] = []
    @State private var index = 0
    @State private var shown: UIImage?
    @State private var shownIndex = -1
    @State private var playing = false
    @State private var status: LoadStatus = .loading
    @State private var infoVisible = false
    @State private var toast: String?
    @State private var infoTimer: Task<Void, Never>?
    @FocusState private var focused: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    enum LoadStatus: Equatable { case loading, ready, failed(String) }
    private let screenPixels = 2560

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let shown {
                Image(uiImage: shown).resizable().scaledToFit().ignoresSafeArea()
                    .id(shownIndex).transition(.opacity)
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
            if let toast {
                Label(toast, systemImage: playing ? "play.fill" : "pause.fill").font(.title3)
                    .padding(.horizontal, 28).padding(.vertical, 16).background(.ultraThinMaterial, in: Capsule())
                    .transition(.opacity).allowsHitTesting(false)
            }
        }
        .focusable().focused($focused).focusEffectDisabled()
        .onMoveCommand { direction in
            if direction == .left { move(-1) }
            if direction == .right { move(1) }
        }
        .onTapGesture { if case .failed = status, shown == nil { Task { await load() } } else { flashInfo() } }
        .onPlayPauseCommand { togglePlaying() }
        .onExitCommand { dismiss() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { playing = false } }
        .onAppear { focused = true; UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { playing = false; UIApplication.shared.isIdleTimerDisabled = false }
        .task { await load() }
        .task(id: index) { await show(index) }
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
            if shuffle { list.shuffle() }
            photos = list
            let saved = shuffle ? 0 : UserDefaults.standard.integer(forKey: "position.\(gallery.id)")
            index = list.indices.contains(saved) ? saved : 0
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
