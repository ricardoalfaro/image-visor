import ImageIO

import SwiftUI
import UIKit

@main
struct ImageViewerProApp: App {
    @StateObject private var model = LibraryModel()
    var body: some Scene { WindowGroup { RootView().environmentObject(model).preferredColorScheme(.dark) } }
}

@MainActor
final class LibraryModel: ObservableObject {
    @Published var client: ShareClient?
    @Published var galleries: [Gallery] = []
    @Published var error: String?
    init() {
        if let saved = CredentialStore.load() { client = try? ShareClient(address: saved.address, fingerprint: saved.fingerprint, token: saved.token) }
    }
    func refresh() async {
        do { galleries = try await client?.decode(GalleryList.self, path: "/v1/galleries").galleries ?? [] }
        catch { self.error = error.localizedDescription }
    }
    func unlink() { CredentialStore.clear(); client = nil; galleries = []; error = nil }
}
struct RootView: View {
    @EnvironmentObject private var model: LibraryModel
    var body: some View {
        Group {
            if model.client != nil {
                NavigationStack {
                    List {
                        Section("Carpetas compartidas") {
                            ForEach(model.galleries) { gallery in
                                NavigationLink(value: gallery.id) { Label(gallery.name, systemImage: "photo.on.rectangle.angled") }
                            }
                            if model.galleries.isEmpty { Text("No hay galerías disponibles. Comprueba el computador y actualiza.") }
                        }
                        Button("Actualizar") { Task { await model.refresh() } }
                        Button("Desvincular computador", role: .destructive) { model.unlink() }
                    }
                    .navigationTitle("Image Viewer Pro")
                    .navigationDestination(for: String.self) { id in
                        if let gallery = model.galleries.first(where: { $0.id == id }), let client = model.client {
                            GalleryView(gallery: gallery, client: client)
                        }
                    }
                }.task { await model.refresh() }
            } else { PairView() }
        }
        .alert("No se pudo conectar", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("Aceptar") { model.error = nil }
        } message: { Text(model.error ?? "") }
    }
}
struct PairView: View {
    @EnvironmentObject private var model: LibraryModel
    @State private var address = "https://"
    @State private var code = ""
    @State private var fingerprint: String?
    @State private var verifiedAddress = ""
    @State private var busy = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Label("Image Viewer Pro", systemImage: "photo.on.rectangle.angled").font(.largeTitle)
                Text("Tus galerías, en la pantalla grande").font(.title2)
                Text("Inicia tv-server.js en tu computador. Ambos dispositivos deben estar en la misma red.").foregroundStyle(.secondary)
                TextField("Dirección HTTPS del computador", text: $address).autocorrectionDisabled().textInputAutocapitalization(.never)
                    .onChange(of: address) { _, _ in fingerprint = nil }
                Button(busy ? "Conectando…" : "Comprobar computador") { Task { await probe() } }.disabled(busy)
                if let fingerprint {
                    Text("Compara esta huella SHA-256 con la que muestra la terminal del computador. Continúa solo si coinciden.")
                    Text(fingerprint).font(.system(size: 24, design: .monospaced))
                    TextField("Código de 8 dígitos", text: $code).keyboardType(.numberPad)
                    Button("La huella coincide · Vincular") { Task { await pair(fingerprint) } }.disabled(busy || code.count != 8)
                }
            }.frame(maxWidth: 1100).padding(70)
        }
    }
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
            let result = try await client.decode(PairResult.self, path: "/v1/pair", code: code)
            try CredentialStore.save(Credentials(address: verifiedAddress, fingerprint: fingerprint, token: result.token))
            model.client = try ShareClient(address: verifiedAddress, fingerprint: fingerprint, token: result.token)
        } catch { model.error = error.localizedDescription }
    }
}

struct RemotePhoto: View {
    let photo: Photo
    let client: ShareClient
    var onLoaded: (() -> Void)? = nil
    var maxPixelSize = 3840
    @State private var image: UIImage?
    @State private var error: String?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFit() }
            else if let error { VStack { Image(systemName: "exclamationmark.triangle"); Text(error).font(.caption) } }
            else { ProgressView() }
        }
        .task(id: photo.id) {
            image = nil; error = nil
            do {
                let data = try await client.request(photo.mediaPath)
                try Task.checkCancellation()
                // Downsample to TV resolution, avoiding a full-resolution UIImage decode.
                let source = CGImageSourceCreateWithData(data as CFData, nil)
                let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceThumbnailMaxPixelSize: maxPixelSize, kCGImageSourceCreateThumbnailWithTransform: true]
                guard let source, let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                    throw ShareError.message("Formato de imagen no compatible")
                }
                image = UIImage(cgImage: cg); onLoaded?()
            } catch is CancellationError {} catch { self.error = error.localizedDescription }
        }
    }
}

struct GalleryView: View {
    let gallery: Gallery
    let client: ShareClient
    @State private var photos: [Photo] = []
    @State private var selected: Int?
    @State private var loading = true
    @State private var error: String?
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 300))], spacing: 40) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                    Button { selected = index } label: {
                        VStack {
                            RemotePhoto(photo: photo, client: client, maxPixelSize: 600).frame(width: 280, height: 180)
                            Text(photo.name).font(.caption).lineLimit(1)
                            if !photo.folder.isEmpty { Text(photo.folder).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
                        }.padding(16)
                    }.buttonStyle(.card)
                }
            }.padding(50)
            if loading { ProgressView("Leyendo galería…") }
            if let error { Text(error); Button("Reintentar") { Task { await load() } } }
            if !loading && photos.isEmpty && error == nil { Text("Esta carpeta no contiene imágenes JPEG, PNG o HEIC.") }
        }
        .navigationTitle(gallery.name)
        .task { await load() }
        .fullScreenCover(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } })) {
            if let index = selected { SlideshowView(photos: photos, client: client, index: index) }
        }
    }
    private func load() async {
        loading = true; error = nil; defer { loading = false }
        do { photos = try await client.decode(PhotoList.self, path: "/v1/galleries/\(gallery.id)").images }
        catch { self.error = error.localizedDescription }
    }
}

struct SlideshowView: View {
    let photos: [Photo]
    let client: ShareClient
    @State var index: Int
    @State private var playing = false
    @State private var loaded = false
    @State private var interval = 5
    enum FocusTarget: Hashable { case image, play }
    @FocusState private var focus: FocusTarget?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            RemotePhoto(photo: photos[index], client: client, onLoaded: { loaded = true }).id(photos[index].id).padding(.bottom, 150)
                .focusable().focused($focus, equals: .image).focusEffectDisabled()
                .onMoveCommand { direction in
                    if direction == .left { move(-1) }
                    if direction == .right { move(1) }
                    if direction == .down { focus = .play }
                }
            VStack { Spacer()
                Text("\(index + 1) / \(photos.count) · \(photos[index].name)").font(.caption).lineLimit(1)
                HStack(spacing: 28) {
                    Button("Anterior", systemImage: "backward.end.fill") { move(-1) }
                    Button(playing ? "Pausar" : "Reproducir", systemImage: playing ? "pause.fill" : "play.fill") { playing.toggle() }.focused($focus, equals: .play)
                    Button("Siguiente", systemImage: "forward.end.fill") { move(1) }
                    Button("\(interval) s") { interval = interval == 5 ? 10 : interval == 10 ? 15 : 5 }
                    Button("Cerrar", systemImage: "xmark") { dismiss() }
                }.padding(.bottom, 40)
                Text("Izquierda / derecha: cambiar · Play/Pausa: presentación · Atrás: galería").font(.caption2).foregroundStyle(.secondary)
            }.padding(35)
        }
        .onPlayPauseCommand { playing.toggle() }
        .onExitCommand { dismiss() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { playing = false } }
        .onAppear { focus = .image; UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { playing = false; UIApplication.shared.isIdleTimerDisabled = false }
        .task(id: "\(playing)-\(index)-\(loaded)-\(interval)") {
            guard playing && loaded else { return }
            do { try await Task.sleep(for: .seconds(interval)); try Task.checkCancellation(); move(1) } catch {}
        }
    }
    private func move(_ delta: Int) { guard photos.count > 1 else { return }; loaded = false; index = (index + delta + photos.count) % photos.count }
}
