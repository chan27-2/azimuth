#!/usr/bin/env swift
// Renders the Azimuth app icon (brand/icon-1024.png) from the same mark as AzimuthGlyph in src/ui/Logo.tsx:
// a bearing ring with north marked and a needle swung off it. Run: swift brand/make_icon.swift
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
cg.setFillColor(rgb(0xffffff, 0.035)) // faint dot grid
for gx in stride(from: 140, through: 900, by: 44) { for gy in stride(from: 140, through: 900, by: 44) {
  cg.fillEllipse(in: CGRect(x: gx - 3, y: gy - 3, width: 6, height: 6)) } }
cg.drawRadialGradient(gradient(rgb(0x3b82f6, 0.30), rgb(0x3b82f6, 0)), startCenter: CGPoint(x: 512, y: 512), startRadius: 0,
                      endCenter: CGPoint(x: 512, y: 512), endRadius: 380, options: [])
cg.restoreGState()

cg.addPath(CGPath(roundedRect: body.insetBy(dx: 2, dy: 2), cornerWidth: 183, cornerHeight: 183, transform: nil))
cg.setStrokeColor(rgb(0xffffff, 0.10)); cg.setLineWidth(4); cg.strokePath()

// Glyph: 24-unit viewBox mapped into a 600px square (y grows downward, as in the SVG).
let g = CGRect(x: 212, y: 212, width: 600, height: 600)
let u = g.width / 24
func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: g.minX + x * u, y: g.minY + y * u) }
let centre = p(12, 12)

// The bearing: the angle from north to the needle, shaded.
let r: CGFloat = 6.6
cg.saveGState()
cg.move(to: centre)
for i in 0...24 { let a = CGFloat(i) / 24 * .pi / 4; cg.addLine(to: p(12 + r * sin(a), 12 - r * cos(a))) }
cg.closePath()
cg.setFillColor(rgb(0x3b82f6, 0.4)); cg.fillPath()
cg.restoreGState()

cg.setLineCap(.round)
cg.setStrokeColor(rgb(0xededed, 0.6)); cg.setLineWidth(1.5 * u)
cg.strokeEllipse(in: CGRect(x: centre.x - 9 * u, y: centre.y - 9 * u, width: 18 * u, height: 18 * u))
// Cardinal ticks; north is the bright one.
cg.setStrokeColor(rgb(0xededed, 0.45)); cg.setLineWidth(1.3 * u)
for (a0, b0) in [(p(19.4, 12), p(17.6, 12)), (p(12, 19.4), p(12, 17.6)), (p(4.6, 12), p(6.4, 12))] { cg.move(to: a0); cg.addLine(to: b0); cg.strokePath() }
cg.setStrokeColor(rgb(0xffffff)); cg.setLineWidth(1.7 * u)
cg.move(to: p(12, 4.4)); cg.addLine(to: p(12, 6.8)); cg.strokePath()

// Compass needle: blue tip on the bearing, grey tail opposite.
func poly(_ pts: [CGPoint]) { cg.move(to: pts[0]); for q in pts.dropFirst() { cg.addLine(to: q) }; cg.closePath() }
cg.saveGState()
cg.setShadow(offset: .zero, blur: 44, color: rgb(0x3b82f6, 0.85))
poly([p(16.67, 7.33), p(13.13, 13.13), p(10.87, 10.87)]); cg.setFillColor(rgb(0x60a5fa)); cg.fillPath()
cg.restoreGState()
poly([p(9.03, 14.97), p(13.13, 13.13), p(10.87, 10.87)]); cg.setFillColor(rgb(0xededed, 0.6)); cg.fillPath()
cg.setFillColor(rgb(0xffffff))
cg.fillEllipse(in: CGRect(x: centre.x - 0.9 * u, y: centre.y - 0.9 * u, width: 1.8 * u, height: 1.8 * u))

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "brand/icon-1024.png"))
print("brand/icon-1024.png")
