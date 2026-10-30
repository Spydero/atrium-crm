// Usage: swift pdf-to-png.swift in.pdf outPrefix [scale]
// Renders every page of a PDF to outPrefix-<page>.png using macOS PDFKit.
import Cocoa
import PDFKit

let args = CommandLine.arguments
guard args.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  print("usage: pdf-to-png.swift in.pdf outPrefix [scale]")
  exit(1)
}
let scale = args.count > 3 ? CGFloat(Double(args[3]) ?? 1.5) : 1.5
for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { continue }
  let box = page.bounds(for: .mediaBox)
  let size = NSSize(width: box.width * scale, height: box.height * scale)
  let img = NSImage(size: size)
  img.lockFocus()
  NSColor.white.set()
  NSRect(origin: .zero, size: size).fill()
  if let ctx = NSGraphicsContext.current?.cgContext {
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
  }
  img.unlockFocus()
  if let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
    let png = rep.representation(using: .png, properties: [:])
  {
    try? png.write(to: URL(fileURLWithPath: "\(args[2])-\(i + 1).png"))
  }
}
print("pages: \(doc.pageCount)")
