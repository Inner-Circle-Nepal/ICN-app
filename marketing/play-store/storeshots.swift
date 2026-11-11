// Google Play store screenshots (1080x1920) and feature graphic (1024x500) for ICN.
// Real app frames from the iOS screen recording, framed in a phone with
// bilingual (English / Nepali) captions in the app's own fonts and colours.
// Usage: storeshots <assetDir> <rawDir> <outDir>
import AppKit

let dir = CommandLine.arguments[1], raw = CommandLine.arguments[2], out = CommandLine.arguments[3]
func hex(_ s: String, _ a: CGFloat = 1) -> NSColor {
  var v: UInt64 = 0; Scanner(string: s).scanHexInt64(&v)
  return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: a)
}
let paper = hex("fbfaf7"), paper2 = hex("f4f2ed"), ink = hex("14130f"), ink2 = hex("35332c"), quiet = hex("6f6b60"), rule = hex("e0ddd4"), red = hex("db0a12")
func font(_ file: String, _ size: CGFloat) -> NSFont {
  let d = (CTFontManagerCreateFontDescriptorsFromURL(URL(fileURLWithPath: "\(dir)/fonts/\(file).ttf") as CFURL) as! [CTFontDescriptor])[0]
  return CTFontCreateWithFontDescriptor(d, size, nil) as NSFont
}
func serif(_ s: CGFloat) -> NSFont { font("Newsreader_500Medium", s) }
func serifR(_ s: CGFloat) -> NSFont { font("Newsreader_400Regular", s) }
func serifI(_ s: CGFloat) -> NSFont { font("Newsreader_500Medium_Italic", s) }
func sansB(_ s: CGFloat) -> NSFont { font("Archivo_600SemiBold", s) }
func sans(_ s: CGFloat) -> NSFont { font("Archivo_500Medium", s) }
func deva(_ s: CGFloat) -> NSFont { font("Mukta_500Medium", s) }

func para(_ align: NSTextAlignment, _ lh: CGFloat? = nil) -> NSParagraphStyle {
  let p = NSMutableParagraphStyle(); p.alignment = align; if let lh = lh { p.minimumLineHeight = lh; p.maximumLineHeight = lh }; return p
}
func draw(_ s: NSAttributedString, _ r: CGRect) { s.draw(with: r, options: [.usesLineFragmentOrigin]) }
func A(_ s: String, _ f: NSFont, _ c: NSColor, align: NSTextAlignment = .center, kern: CGFloat = 0, lh: CGFloat? = nil) -> NSAttributedString {
  NSAttributedString(string: s, attributes: [.font: f, .foregroundColor: c, .kern: kern, .paragraphStyle: para(align, lh)])
}
func fill(_ r: CGRect, _ c: NSColor, _ rad: CGFloat = 0) { c.setFill(); (rad > 0 ? NSBezierPath(roundedRect: r, xRadius: rad, yRadius: rad) : NSBezierPath(rect: r)).fill() }

/// A raw frame with the iPhone status bar (and its recording dot) replaced by a clean one,
/// plus optional text patches drawn over the original pixels.
func cleaned(_ name: String, patches: [(CGRect, () -> Void)] = []) -> NSImage {
  let src = NSImage(contentsOfFile: "\(raw)/\(name)")!
  let cg = src.cgImage(forProposedRect: nil, context: nil, hints: nil)!
  let W = cg.width, H = cg.height
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: W, pixelsHigh: H, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  let g = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.current = g
  let c = g.cgContext
  c.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
  // flip to top-left origin for our drawing
  c.translateBy(x: 0, y: CGFloat(H)); c.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: c, flipped: true)
  // status bar
  let bg = paper
  fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: 196), bg)
  draw(A("9:41", sansB(46), ink, align: .left), CGRect(x: 120, y: 66, width: 200, height: 60))
  for i in 0..<4 { fill(CGRect(x: 880 + CGFloat(i) * 17, y: 104 - CGFloat(i) * 9, width: 11, height: 14 + CGFloat(i) * 9), ink, 2) }
  ink.setStroke(); let b = NSBezierPath(roundedRect: CGRect(x: 1000, y: 76, width: 66, height: 34), xRadius: 10, yRadius: 10); b.lineWidth = 3; b.stroke()
  fill(CGRect(x: 1006, y: 82, width: 48, height: 22), ink, 6)
  for (r, f) in patches { fill(r, paper); f() }
  NSGraphicsContext.restoreGraphicsState()
  let img = NSImage(size: NSSize(width: W, height: H)); img.addRepresentation(rep); return img
}


func initials(_ c: CGPoint, _ r: CGFloat, _ t: String) {
  fill(CGRect(x: c.x - r - 6, y: c.y - r - 6, width: 2 * r + 12, height: 2 * r + 12), paper)
  paper2.setFill(); NSBezierPath(ovalIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)).fill()
  hex("c8c4b8").setStroke(); let o = NSBezierPath(ovalIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)); o.lineWidth = 3; o.stroke()
  let a = A(t, serif(r * 0.75), ink); let z = a.size(); a.draw(at: CGPoint(x: c.x - z.width / 2, y: c.y - z.height / 2))
}

struct Slide {
  let file: String; let img: NSImage; let kicker: String; let line1: NSAttributedString; let line2: NSAttributedString
  let nepali: String; let dark: Bool; let callout: CGRect?; let chip: String?
}
func headline(_ parts: [(String, Bool)], dark: Bool) -> NSAttributedString {
  let m = NSMutableAttributedString()
  for (s, accent) in parts {
    m.append(NSAttributedString(string: s, attributes: [.font: accent ? serifI(88) : serif(88), .foregroundColor: accent ? (dark ? hex("ff6b70") : red) : (dark ? paper : ink), .kern: -1.5, .paragraphStyle: para(.center)]))
  }
  return m
}

// The live room was titled "Test" when recorded: give it a realistic title, set in the app's own type.
let liveRoom = cleaned("f052.5.png", patches: [
  (CGRect(x: 380, y: 215, width: 450, height: 80), { draw(A("Budget talk", serif(40), ink), CGRect(x: 380, y: 226, width: 450, height: 60)) }),
  (CGRect(x: 40, y: 470, width: 1120, height: 110), { draw(A("Who pays for the budget?", serifR(76), ink, align: .left), CGRect(x: 60, y: 474, width: 1120, height: 100)) }),
  (CGRect(x: 0, y: 0, width: 0, height: 0), { initials(CGPoint(x: 196, y: 896), 62, "Y") }),
])

let slides: [Slide] = [
  Slide(file: "01-news.png", img: cleaned("f003.6.png"), kicker: "INNER CIRCLE NEPAL",
        line1: headline([("Nepal's news.", false)], dark: false), line2: headline([("Just ", false), ("scroll.", true)], dark: false),
        nepali: "नेपालको समाचार, एक स्क्रोलमै", dark: false, callout: nil, chip: nil),
  Slide(file: "02-earn.png", img: cleaned("f020.5.png", patches: [(CGRect(x: 250, y: 552, width: 140, height: 56), { let a = NSMutableAttributedString(attributedString: A("Reader", sans(32), ink, align: .left)); a.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: NSRange(location: 0, length: 6)); draw(a, CGRect(x: 262, y: 556, width: 200, height: 44)) }), (CGRect(x: 0, y: 0, width: 0, height: 0), { initials(CGPoint(x: 1092, y: 260), 46, "R") })]), kicker: "CHAUTARI",
        line1: headline([("Host a room.", false)], dark: true), line2: headline([("Earn", true), (" on Chautari.", false)], dark: true),
        nepali: "चौतारीमा रुम चलाउनुहोस्, कमाउनुहोस्", dark: true, callout: CGRect(x: 705, y: 540, width: 470, height: 76), chip: "HOST EARNINGS · OPENING SOON"),
  Slide(file: "03-open-room.png", img: cleaned("f021.5.png", patches: [(CGRect(x: 370, y: 990, width: 560, height: 56), { draw(A("ICN Newsroom", serifR(38), ink, align: .left), CGRect(x: 380, y: 994, width: 600, height: 50)) })]), kicker: "HOST A CONVERSATION",
        line1: headline([("Your topic.", false)], dark: false), line2: headline([("Your ", false), ("audience.", true)], dark: false),
        nepali: "तपाईंको विषय, तपाईंकै श्रोता", dark: false, callout: nil, chip: nil),
  Slide(file: "04-go-live.png", img: liveRoom, kicker: "LIVE AUDIO",
        line1: headline([("Go live.", false)], dark: true), line2: headline([("Get ", false), ("heard.", true)], dark: true),
        nepali: "लाइभ जानुहोस्, आफ्नो आवाज सुनाउनुहोस्", dark: true, callout: nil, chip: nil),
  Slide(file: "05-newsroom.png", img: cleaned("f018.5.png"), kicker: "NEWSROOM",
        line1: headline([("Every desk.", false)], dark: false), line2: headline([("Forex & ", false), ("NEPSE.", true)], dark: false),
        nepali: "हरेक डेस्क, विदेशी विनिमय दर र नेप्से", dark: false, callout: nil, chip: nil),
  Slide(file: "06-language.png", img: cleaned("f084.5.png", patches: [(CGRect(x: 230, y: 950, width: 860, height: 125), { draw(A("ICN Reader", serifR(44), ink, align: .left), CGRect(x: 240, y: 956, width: 800, height: 58)); draw(A("reader@icn.news", sans(31), quiet, align: .left), CGRect(x: 240, y: 1022, width: 800, height: 44)) }), (CGRect(x: 0, y: 0, width: 0, height: 0), { initials(CGPoint(x: 130, y: 1016), 64, "R") })]), kicker: "BILINGUAL",
        line1: headline([("English or", false)], dark: false), line2: headline([("नेपाली.", true)], dark: false),
        nepali: "आफ्नो भाषामा पढ्नुहोस्", dark: false, callout: nil, chip: nil),
]

func canvas(_ w: Int, _ h: Int, _ body: (CGContext) -> Void) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  let g = NSGraphicsContext(bitmapImageRep: rep)!; let c = g.cgContext
  c.translateBy(x: 0, y: CGFloat(h)); c.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: c, flipped: true)
  c.interpolationQuality = .high
  body(c)
  NSGraphicsContext.restoreGraphicsState()
  return rep
}
func ringArc(center c: CGPoint, r: CGFloat, width: CGFloat, color: NSColor) {
  let p = NSBezierPath()
  for i in 0...200 {
    let th = (6.0 + 328.0 * Double(i) / 200) * .pi / 180
    let pt = CGPoint(x: c.x + r * CGFloat(cos(th)), y: c.y + r * CGFloat(sin(th)))
    i == 0 ? p.move(to: pt) : p.line(to: pt)
  }
  color.setStroke(); p.lineWidth = width; p.lineCapStyle = .round; p.stroke()
}

for s in slides {
  let rep = canvas(1080, 1920) { c in
    fill(CGRect(x: 0, y: 0, width: 1080, height: 1920), s.dark ? ink : paper2)
    // a quiet, oversized ICN ring behind the phone
    ringArc(center: CGPoint(x: 540, y: 1250), r: 640, width: 28, color: s.dark ? hex("26241f") : rule)
    // captions
    fill(CGRect(x: 510, y: 96, width: 60, height: 6), red)
    draw(A(s.kicker, sansB(26), s.dark ? hex("ff6b70") : red, kern: 6), CGRect(x: 0, y: 122, width: 1080, height: 40))
    draw(s.line1, CGRect(x: 30, y: 168, width: 1020, height: 110))
    draw(s.line2, CGRect(x: 30, y: 262, width: 1020, height: 110))
    draw(A(s.nepali, deva(42), s.dark ? hex("c9c5ba") : quiet), CGRect(x: 30, y: 382, width: 1020, height: 60))
    // phone
    let scale: CGFloat = 0.69
    let iw = s.img.size.width * scale, ih = s.img.size.height * scale
    let px = (1080 - iw) / 2, py: CGFloat = 486
    let frame = CGRect(x: px - 20, y: py - 20, width: iw + 40, height: ih + 40)
    NSGraphicsContext.saveGraphicsState()
    let sh = NSShadow(); sh.shadowBlurRadius = 60; sh.shadowOffset = NSSize(width: 0, height: -24); sh.shadowColor = NSColor(white: 0, alpha: s.dark ? 0.6 : 0.25); sh.set()
    fill(frame, hex("0b0a08"), 96)
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: CGRect(x: px, y: py, width: iw, height: ih), xRadius: 78, yRadius: 78).addClip()
    s.img.draw(in: CGRect(x: px, y: py, width: iw, height: ih), from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high.rawValue])
    NSGraphicsContext.restoreGraphicsState()
    fill(CGRect(x: 540 - 88, y: py + 26, width: 176, height: 50), hex("0b0a08"), 25) // camera island
    // callout on the Earn link
    if let co = s.callout {
      let r = CGRect(x: px + co.minX * scale, y: py + co.minY * scale, width: co.width * scale, height: co.height * scale).insetBy(dx: -10, dy: -8)
      red.setStroke(); let p = NSBezierPath(roundedRect: r, xRadius: r.height / 2, yRadius: r.height / 2); p.lineWidth = 6; p.stroke()
    }
    if let chip = s.chip {
      let f = sansB(22); let w = A(chip, f, paper, kern: 3).size().width + 56
      let r = CGRect(x: (1080 - w) / 2, y: 1560, width: w, height: 62)
      NSGraphicsContext.saveGraphicsState(); let sh2 = NSShadow(); sh2.shadowBlurRadius = 24; sh2.shadowColor = NSColor(white: 0, alpha: 0.35); sh2.set(); fill(r, red, 31); NSGraphicsContext.restoreGraphicsState()
      draw(A(chip, f, paper, kern: 3), CGRect(x: r.minX, y: r.minY + 17, width: w, height: 30))
    }
  }
  try! rep.representation(using: .jpeg, properties: [.compressionFactor: 0.95])!.write(to: URL(fileURLWithPath: "\(out)/\(s.file.replacingOccurrences(of: ".png", with: ".jpg"))"))
}

// Feature graphic 1024x500
let fg = canvas(1024, 500) { c in
  fill(CGRect(x: 0, y: 0, width: 1024, height: 500), ink)
  ringArc(center: CGPoint(x: 820, y: 250), r: 330, width: 20, color: hex("26241f"))
  // logo
  let lc = CGPoint(x: 150, y: 250), lr: CGFloat = 92
  ringArc(center: lc, r: lr, width: 9, color: paper)
  let dth = -10.0 * .pi / 180
  let dot = CGPoint(x: lc.x + lr * CGFloat(cos(dth)), y: lc.y + lr * CGFloat(sin(dth)))
  NSColor(cgColor: red.cgColor)!.setFill(); NSBezierPath(ovalIn: CGRect(x: dot.x - 16, y: dot.y - 16, width: 32, height: 32)).fill()
  let icn = A("ICN", font("Archivo_500Medium", 56), paper, kern: 3); let isz = icn.size()
  icn.draw(at: CGPoint(x: lc.x - isz.width / 2 + 2, y: lc.y - isz.height / 2))
  // words
  draw(A("INNER CIRCLE NEPAL", sansB(20), hex("ff6b70"), align: .left, kern: 5), CGRect(x: 300, y: 128, width: 700, height: 30))
  let h = NSMutableAttributedString()
  h.append(A("News for Nepalis,\n", serif(56), paper, align: .left, lh: 62))
  h.append(NSAttributedString(string: "everywhere.", attributes: [.font: serifI(56), .foregroundColor: hex("ff6b70"), .paragraphStyle: para(.left, 62)]))
  draw(h, CGRect(x: 298, y: 162, width: 700, height: 140))
  draw(A("Live audio rooms on Chautari · Host & earn", sans(22), hex("c9c5ba"), align: .left), CGRect(x: 300, y: 312, width: 700, height: 32))
  draw(A("नेपालका लागि, नेपालीबाट", deva(26), hex("918c80"), align: .left), CGRect(x: 300, y: 350, width: 700, height: 40))
}
try! fg.representation(using: .jpeg, properties: [.compressionFactor: 0.95])!.write(to: URL(fileURLWithPath: "\(out)/feature-graphic-1024x500.jpg"))
print("done")
