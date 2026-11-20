#!/usr/bin/env swift
// Renders the Busscope app icon (brand/icon-1024.png) from the same glyph as src/components/Logo.tsx:
// a horizontal service bus with services attached above and below. Run: swift brand/make_icon.swift
import AppKit

let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = ctx
let cg = ctx.cgContext
cg.translateBy(x: 0, y: CGFloat(size)); cg.scaleBy(x: 1, y: -1)

let space = CGColorSpaceCreateDeviceRGB()
func rgb(_ hex: UInt, _ a: CGFloat = 1) -> CGColor {
  CGColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: a)
}
func gradient(_ a: CGColor, _ b: CGColor) -> CGGradient { CGGradient(colorsSpace: space, colors: [a, b] as CFArray, locations: [0, 1])! }

// macOS icon grid: 824pt body centred on a 1024 canvas, with a soft drop shadow.
let body = CGRect(x: 100, y: 100, width: 824, height: 824)
let squircle = CGPath(roundedRect: body, cornerWidth: 185, cornerHeight: 185, transform: nil)
cg.saveGState()
cg.setShadow(offset: CGSize(width: 0, height: 12), blur: 28, color: rgb(0x000000, 0.45))
cg.addPath(squircle); cg.setFillColor(rgb(0x111111)); cg.fillPath()
cg.restoreGState()

cg.saveGState()
cg.addPath(squircle); cg.clip()
cg.drawLinearGradient(gradient(rgb(0x2b2b2b), rgb(0x0b0b0b)), start: CGPoint(x: 512, y: 100), end: CGPoint(x: 512, y: 924), options: [])
cg.setFillColor(rgb(0xffffff, 0.035)) // faint dot grid, like the topology canvas
for gx in stride(from: 140, through: 900, by: 44) { for gy in stride(from: 140, through: 900, by: 44) {
  cg.fillEllipse(in: CGRect(x: gx - 3, y: gy - 3, width: 6, height: 6)) } }
cg.drawRadialGradient(gradient(rgb(0x3b82f6, 0.30), rgb(0x3b82f6, 0)), startCenter: CGPoint(x: 512, y: 512), startRadius: 0,
                      endCenter: CGPoint(x: 512, y: 512), endRadius: 380, options: [])
cg.restoreGState()

cg.addPath(CGPath(roundedRect: body.insetBy(dx: 2, dy: 2), cornerWidth: 183, cornerHeight: 183, transform: nil))
cg.setStrokeColor(rgb(0xffffff, 0.10)); cg.setLineWidth(4); cg.strokePath()

// Glyph: 24-unit viewBox mapped into a 600px square.
let g = CGRect(x: 212, y: 212, width: 600, height: 600)
let u = g.width / 24
func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: g.minX + x * u, y: g.minY + y * u, width: w * u, height: h * u) }
func fill(_ rect: CGRect, radius: CGFloat, with grad: CGGradient) {
  cg.saveGState()
  cg.addPath(CGPath(roundedRect: rect, cornerWidth: radius * u, cornerHeight: radius * u, transform: nil)); cg.clip()
  cg.drawLinearGradient(grad, start: CGPoint(x: 0, y: rect.minY), end: CGPoint(x: 0, y: rect.maxY), options: [])
  cg.restoreGState()
}

cg.setLineCap(.round); cg.setLineWidth(1.6 * u); cg.setStrokeColor(rgb(0xededed, 0.55))
for (x, y0, y1) in [(7.0, 7.5, 10.5), (17.0, 7.5, 10.5), (12.0, 13.5, 16.5)] as [(CGFloat, CGFloat, CGFloat)] {
  cg.move(to: CGPoint(x: g.minX + x * u, y: g.minY + y0 * u))
  cg.addLine(to: CGPoint(x: g.minX + x * u, y: g.minY + y1 * u))
  cg.strokePath()
}
fill(r(2, 10.25, 20, 3.5), radius: 1.75, with: gradient(rgb(0x60a5fa), rgb(0x2563eb)))
for rect in [r(4, 2.5, 6, 5), r(14, 2.5, 6, 5), r(9, 16.5, 6, 5)] {
  fill(rect, radius: 1.5, with: gradient(rgb(0xffffff), rgb(0xd4d4d4)))
}

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "brand/icon-1024.png"))
print("brand/icon-1024.png")
