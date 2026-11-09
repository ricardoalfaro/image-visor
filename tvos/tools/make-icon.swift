// Generates the tvOS app icon (camera on yellow) as a layered image stack.
// Run from the repository root:  swift tvos/tools/make-icon.swift
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let catalog = "tvos/ImageViewerPro/Assets.xcassets"
let brand = "\(catalog)/App Icon & Top Shelf Image.brandassets"
let info = ["author": "xcode", "version": 1] as [String: Any]
let rgb = CGColorSpaceCreateDeviceRGB()

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: rgb, components: [CGFloat((hex >> 16) & 255) / 255, CGFloat((hex >> 8) & 255) / 255, CGFloat(hex & 255) / 255, alpha])!
}

func roundedRect(_ rect: CGRect, _ radius: CGFloat) -> CGPath {
    CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
}

func gradient(_ stops: [(CGFloat, UInt32)]) -> CGGradient {
    CGGradient(colorsSpace: rgb, colors: stops.map { color($0.1) } as CFArray, locations: stops.map { $0.0 })!
}

// Everything is drawn in a 1280x768 design space and scaled to the requested size.
enum Layer { case back, middle, front }

func draw(_ layer: Layer, in ctx: CGContext) {
    let cx: CGFloat = 640, cy: CGFloat = 384
    let cream = color(0xFFF8EC)
    let stroke: CGFloat = 36
    switch layer {
    case .back:
        // Flat yellow with the same soft vertical shade as the reference icon.
        ctx.drawLinearGradient(gradient([(0, 0xFFB800), (1, 0xFFD02B)]), start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: 768), options: [])
    case .middle:
        // Camera body drawn as a thick outline, plus the viewfinder hump and shutter button.
        let body = CGRect(x: cx - 310, y: cy - 195, width: 620, height: 350)
        ctx.setStrokeColor(cream); ctx.setLineWidth(stroke); ctx.setLineJoin(.round)
        ctx.addPath(roundedRect(body.insetBy(dx: stroke / 2, dy: stroke / 2), 56)); ctx.strokePath()
        ctx.setFillColor(cream)
        ctx.addPath(roundedRect(CGRect(x: cx - 150, y: body.maxY - 8, width: 300, height: 84), 30)); ctx.fillPath()
        ctx.addPath(roundedRect(CGRect(x: cx + 190, y: body.maxY - 8, width: 84, height: 50), 18)); ctx.fillPath()
    case .front:
        // Lens: outlined ring with a translucent glass disc and a highlight.
        let center = CGPoint(x: cx, y: cy - 20)
        func circle(_ r: CGFloat) -> CGRect { CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r) }
        ctx.setStrokeColor(cream); ctx.setLineWidth(stroke)
        ctx.strokeEllipse(in: circle(112))
        ctx.saveGState(); ctx.addEllipse(in: circle(80)); ctx.clip()
        ctx.drawLinearGradient(CGGradient(colorsSpace: rgb, colors: [color(0xFFF8EC, 0.85), color(0xFFF8EC, 0.15)] as CFArray, locations: [0, 1])!,
                               start: CGPoint(x: center.x, y: center.y + 80), end: CGPoint(x: center.x, y: center.y - 80), options: [])
        ctx.restoreGState()
        ctx.setFillColor(color(0xFFB800, 0.55)); ctx.fillEllipse(in: CGRect(x: center.x + 16, y: center.y - 46, width: 22, height: 22))
        // small flash dot on the body
        ctx.setFillColor(cream); ctx.fillEllipse(in: CGRect(x: cx + 218, y: cy + 78, width: 34, height: 34))
    }
}

func render(_ layer: Layer, width: Int, height: Int, to url: URL) throws {
    let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: rgb,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.scaleBy(x: CGFloat(width) / 1280, y: CGFloat(height) / 768)
    draw(layer, in: ctx)
    let image = ctx.makeImage()!
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw CocoaError(.fileWriteUnknown) }
}

func writeJSON(_ object: Any, to path: String) throws {
    try FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path))
}

try? FileManager.default.removeItem(atPath: catalog)
try writeJSON(["info": info], to: "\(catalog)/Contents.json")

let stacks: [(name: String, width: Int, height: Int)] = [("App Icon - Large", 1280, 768), ("App Icon - Small", 400, 240)]
try writeJSON([
    "assets": stacks.map { ["filename": "\($0.name).imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "\($0.width)x\($0.height)"] },
    "info": info,
] as [String: Any], to: "\(brand)/Contents.json")

for stack in stacks {
    let root = "\(brand)/\(stack.name).imagestack"
    let layers: [(String, Layer)] = [("Front", .front), ("Middle", .middle), ("Back", .back)]
    try writeJSON(["layers": layers.map { ["filename": "\($0.0).imagestacklayer"] }, "info": info] as [String: Any], to: "\(root)/Contents.json")
    for (name, layer) in layers {
        let layerRoot = "\(root)/\(name).imagestacklayer"
        try writeJSON(["info": info], to: "\(layerRoot)/Contents.json")
        let set = "\(layerRoot)/Content.imageset"
        try writeJSON(["images": [
            ["idiom": "tv", "filename": "\(name.lowercased()).png", "scale": "1x"],
            ["idiom": "tv", "filename": "\(name.lowercased())@2x.png", "scale": "2x"],
        ], "info": info] as [String: Any], to: "\(set)/Contents.json")
        try render(layer, width: stack.width, height: stack.height, to: URL(fileURLWithPath: "\(set)/\(name.lowercased()).png"))
        try render(layer, width: stack.width * 2, height: stack.height * 2, to: URL(fileURLWithPath: "\(set)/\(name.lowercased())@2x.png"))
    }
}
// Flat logo (all layers composited) used inside the app, e.g. on the source chooser.
let logoSet = "\(catalog)/AppLogo.imageset"
try writeJSON(["images": [["idiom": "universal", "filename": "logo.png", "scale": "1x"], ["idiom": "universal", "filename": "logo@2x.png", "scale": "2x"]], "info": info] as [String: Any], to: "\(logoSet)/Contents.json")
for (name, scaleFactor) in [("logo", 1), ("logo@2x", 2)] {
    let w = 1280 * scaleFactor / 2, h = 768 * scaleFactor / 2
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: rgb, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.scaleBy(x: CGFloat(w) / 1280, y: CGFloat(h) / 768)
    for layer in [Layer.back, .middle, .front] { draw(layer, in: ctx) }
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "\(logoSet)/\(name).png") as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(dest) else { throw CocoaError(.fileWriteUnknown) }
}
print("Icon written to \(catalog)")
