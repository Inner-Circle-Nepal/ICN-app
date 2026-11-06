// ICN app ad: 1080x1920, 30 fps, rendered frame by frame with CoreGraphics.
// Usage: render <assetDir> <out.mp4>            full video
//        render <assetDir> <outDir> 1.0,5.2,...   PNG stills at those seconds
import AppKit
import AVFoundation
import CoreImage

let W: CGFloat = 1080, H: CGFloat = 1920
let FPS: Int32 = 30
let DUR = 25.0
let dir = CommandLine.arguments[1]

// MARK: palette (from the app's theme tokens)
func hex(_ s: String, _ a: CGFloat = 1) -> NSColor {
  var v: UInt64 = 0; Scanner(string: s).scanHexInt64(&v)
  return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: a)
}
let paper = hex("fbfaf7"), paper2 = hex("f4f2ed"), ink = hex("14130f"), ink2 = hex("35332c")
let quiet = hex("6f6b60"), rule = hex("e0ddd4"), rule2 = hex("c8c4b8"), red = hex("db0a12")

// MARK: fonts (the app's own: Newsreader, Archivo, Mukta)
func font(_ file: String, _ size: CGFloat) -> NSFont {
  let url = URL(fileURLWithPath: "\(dir)/fonts/\(file).ttf") as CFURL
  let d = (CTFontManagerCreateFontDescriptorsFromURL(url) as! [CTFontDescriptor])[0]
  return CTFontCreateWithFontDescriptor(d, size, nil) as NSFont
}
func serif(_ s: CGFloat) -> NSFont { font("Newsreader_500Medium", s) }
func serifR(_ s: CGFloat) -> NSFont { font("Newsreader_400Regular", s) }
func serifI(_ s: CGFloat) -> NSFont { font("Newsreader_500Medium_Italic", s) }
func sans(_ s: CGFloat) -> NSFont { font("Archivo_500Medium", s) }
func sansR(_ s: CGFloat) -> NSFont { font("Archivo_400Regular", s) }
func sansB(_ s: CGFloat) -> NSFont { font("Archivo_600SemiBold", s) }
func sansX(_ s: CGFloat) -> NSFont { font("Archivo_700Bold", s) }
func deva(_ s: CGFloat) -> NSFont { font("Mukta_500Medium", s) }

// MARK: easing
func cl(_ x: Double) -> Double { max(0, min(1, x)) }
func pr(_ t: Double, _ a: Double, _ b: Double) -> Double { cl((t - a) / (b - a)) }
func eo(_ x: Double) -> Double { 1 - pow(1 - x, 3) }
func eio(_ x: Double) -> Double { x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2 }
func back(_ x: Double) -> Double { let c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2) }
func lerp(_ a: CGFloat, _ b: CGFloat, _ x: Double) -> CGFloat { a + (b - a) * CGFloat(x) }
/// 0 -> 1 in over [a, a+fin], 1 -> 0 out over [b-fout, b]
func window(_ t: Double, _ a: Double, _ b: Double, fin: Double = 0.45, fout: Double = 0.3) -> Double {
  min(eo(pr(t, a, a + fin)), 1 - pr(t, b - fout, b))
}

// MARK: drawing helpers (flipped context: y grows downward)
var ctx: CGContext!
func fill(_ r: CGRect, _ c: NSColor, radius: CGFloat = 0) {
  c.setFill(); (radius > 0 ? NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius) : NSBezierPath(rect: r)).fill()
}
func stroke(_ r: CGRect, _ c: NSColor, _ w: CGFloat, radius: CGFloat = 0) {
  c.setStroke(); let p = radius > 0 ? NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius) : NSBezierPath(rect: r); p.lineWidth = w; p.stroke()
}
func line(_ a: CGPoint, _ b: CGPoint, _ c: NSColor, _ w: CGFloat) {
  c.setStroke(); let p = NSBezierPath(); p.move(to: a); p.line(to: b); p.lineWidth = w; p.lineCapStyle = .round; p.stroke()
}
func circle(_ c: CGPoint, _ r: CGFloat, _ col: NSColor) { col.setFill(); NSBezierPath(ovalIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)).fill() }
func ring(_ c: CGPoint, _ r: CGFloat, _ col: NSColor, _ w: CGFloat) {
  col.setStroke(); let p = NSBezierPath(ovalIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)); p.lineWidth = w; p.stroke()
}
func attr(_ s: String, _ f: NSFont, _ c: NSColor, align: NSTextAlignment = .left, kern: CGFloat = 0, lh: CGFloat? = nil) -> NSAttributedString {
  let ps = NSMutableParagraphStyle(); ps.alignment = align
  if let lh = lh { ps.minimumLineHeight = lh; ps.maximumLineHeight = lh }
  ps.lineBreakMode = .byWordWrapping
  return NSAttributedString(string: s, attributes: [.font: f, .foregroundColor: c, .kern: kern, .paragraphStyle: ps])
}
func text(_ s: String, _ f: NSFont, _ c: NSColor, _ r: CGRect, align: NSTextAlignment = .left, kern: CGFloat = 0, lh: CGFloat? = nil) {
  attr(s, f, c, align: align, kern: kern, lh: lh).draw(with: r, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
}
func textW(_ s: String, _ f: NSFont, kern: CGFloat = 0) -> CGFloat { attr(s, f, ink, kern: kern).size().width }
func alpha(_ a: Double, _ body: () -> Void) {
  if a <= 0.001 { return }
  ctx.saveGState(); ctx.setAlpha(CGFloat(a)); ctx.beginTransparencyLayer(auxiliaryInfo: nil); body(); ctx.endTransparencyLayer(); ctx.restoreGState()
}
func withState(_ body: () -> Void) { ctx.saveGState(); NSGraphicsContext.saveGraphicsState(); body(); NSGraphicsContext.restoreGraphicsState(); ctx.restoreGState() }
func clip(_ r: CGRect, radius: CGFloat = 0) { (radius > 0 ? NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius) : NSBezierPath(rect: r)).addClip() }
func img(_ i: NSImage, fill r: CGRect, alpha a: CGFloat = 1) {
  let s = i.size; let sc = max(r.width / s.width, r.height / s.height)
  let w = s.width * sc, h = s.height * sc
  withState { clip(r); i.draw(in: CGRect(x: r.midX - w / 2, y: r.midY - h / 2, width: w, height: h), from: .zero, operation: .sourceOver, fraction: a, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high.rawValue]) }
}

// MARK: assets
func load(_ name: String) -> NSImage { NSImage(contentsOfFile: "\(dir)/img/\(name)")! }
let ciCtx = CIContext()
func blurred(_ i: NSImage) -> NSImage {
  let ci = CIImage(data: i.tiffRepresentation!)!
  let out = ci.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: ["inputRadius": 40]).cropped(to: ci.extent)
  let cg = ciCtx.createCGImage(out, from: ci.extent)!
  return NSImage(cgImage: cg, size: i.size)
}
struct Story { let photo: NSImage; let soft: NSImage; let section: String; let ago: String; let title: String; let caption: String }
let stories: [Story] = [
  ("s1.jpg", "NEPAL", "2H AGO", "Nagdhunga Tunnel starts charging tolls from Rs 60", "Nepal’s first major road tunnel began toll collection on November 1, ending the free trial period."),
  ("s2.png", "IMMIGRATION", "1D AGO", "UK doubles settlement wait to 10 years for most migrants", "Doctors, nurses and teachers keep shorter routes. Here is what it means for Nepalis in Britain."),
  ("s3.jpg", "NEPAL", "3H AGO", "US overtakes India as Nepal’s top tourist source", "Nepal received 132,814 international visitors in October, up 3.4 percent from a year earlier."),
  ("s4.jpg", "NEPAL", "1D AGO", "Morang’s Rs 1 billion Keraun substation begins operation", "The 148.5 MVA substation is expected to improve electricity supply across northern Morang."),
].map { let p = load($0.0); return Story(photo: p, soft: blurred(p), section: $0.1, ago: $0.2, title: $0.3, caption: $0.4) }

// MARK: phone (screen designed in 390x844 points)
let SW: CGFloat = 390, SH: CGFloat = 844
let screenScale: CGFloat = 1.36
let phoneW = SW * screenScale + 32, phoneH = SH * screenScale + 32
func phone(centerX: CGFloat, top: CGFloat, scale: CGFloat = 1, rotate: CGFloat = 0, screen: () -> Void) {
  withState {
    ctx.translateBy(x: centerX, y: top + phoneH / 2)
    ctx.rotate(by: rotate); ctx.scaleBy(x: scale, y: scale)
    ctx.translateBy(x: -phoneW / 2, y: -phoneH / 2)
    let body = CGRect(x: 0, y: 0, width: phoneW, height: phoneH)
    withState {
      let sh = NSShadow(); sh.shadowBlurRadius = 70; sh.shadowOffset = NSSize(width: 0, height: -30); sh.shadowColor = NSColor(white: 0, alpha: 0.28); sh.set()
      fill(body, ink, radius: 78)
    }
    stroke(body.insetBy(dx: 3, dy: 3), hex("3a3832"), 3, radius: 75)
    let scr = body.insetBy(dx: 16, dy: 16)
    withState {
      clip(scr, radius: 62)
      fill(scr, paper)
      ctx.translateBy(x: scr.minX, y: scr.minY); ctx.scaleBy(x: screenScale, y: screenScale)
      screen()
      statusBar()
    }
    fill(CGRect(x: phoneW / 2 - 62, y: 30, width: 124, height: 36), ink, radius: 18) // camera island
  }
}
func statusBar() {
  text("9:41", sansB(15), ink, CGRect(x: 30, y: 15, width: 80, height: 20))
  for i in 0..<4 { fill(CGRect(x: 300 + CGFloat(i) * 5, y: 26 - CGFloat(i) * 3, width: 3.2, height: 4 + CGFloat(i) * 3), ink, radius: 1) }
  stroke(CGRect(x: 330, y: 17, width: 24, height: 12), ink, 1.2, radius: 3.5); fill(CGRect(x: 332.5, y: 19.5, width: 16, height: 7), ink, radius: 2)
}
func bottomNav(active: Int) {
  let y: CGFloat = 780
  fill(CGRect(x: 0, y: y, width: SW, height: SH - y), paper)
  line(CGPoint(x: 0, y: y), CGPoint(x: SW, y: y), rule, 1)
  let labels = ["HOME", "NEWSROOM", "CHAUTARI", "SAVED", "SETTINGS"]
  for (i, l) in labels.enumerated() {
    let cx = SW / 10 * CGFloat(2 * i + 1)
    let c = i == active ? ink : quiet
    switch i {
    case 0: let p = NSBezierPath(); p.move(to: CGPoint(x: cx - 8, y: y + 23)); p.line(to: CGPoint(x: cx, y: y + 15)); p.line(to: CGPoint(x: cx + 8, y: y + 23)); p.line(to: CGPoint(x: cx + 8, y: y + 32)); p.line(to: CGPoint(x: cx - 8, y: y + 32)); p.close(); c.setStroke(); p.lineWidth = 1.6; if i == active { c.setFill(); p.fill() }; p.stroke()
    case 1: stroke(CGRect(x: cx - 8, y: y + 15, width: 16, height: 17), c, 1.6, radius: 2); line(CGPoint(x: cx - 4, y: y + 21), CGPoint(x: cx + 4, y: y + 21), c, 1.4); line(CGPoint(x: cx - 4, y: y + 26), CGPoint(x: cx + 4, y: y + 26), c, 1.4)
    case 2: circle(CGPoint(x: cx, y: y + 23), 2.6, c); ring(CGPoint(x: cx, y: y + 23), 6.5, c, 1.5); if i == active { ring(CGPoint(x: cx, y: y + 23), 10.5, c, 1.5) }
    case 3: let p = NSBezierPath(); p.move(to: CGPoint(x: cx - 6, y: y + 14)); p.line(to: CGPoint(x: cx + 6, y: y + 14)); p.line(to: CGPoint(x: cx + 6, y: y + 32)); p.line(to: CGPoint(x: cx, y: y + 27)); p.line(to: CGPoint(x: cx - 6, y: y + 32)); p.close(); c.setStroke(); p.lineWidth = 1.6; p.stroke()
    default: for k in 0..<3 { line(CGPoint(x: cx - 8, y: y + 16 + CGFloat(k) * 7), CGPoint(x: cx + 8, y: y + 16 + CGFloat(k) * 7), c, 1.6) }
    }
    text(l, i == active ? sansB(8.5) : sans(8.5), c, CGRect(x: cx - 40, y: y + 38, width: 80, height: 14), align: .center, kern: 0.9)
  }
}

// MARK: screens
func feedCard(_ s: Story, y0: CGFloat) {
  let r = CGRect(x: 0, y: y0, width: SW, height: 736)
  fill(r, paper)
  img(s.soft, fill: r, alpha: 1)
  fill(r, paper.withAlphaComponent(0.66))
  fill(CGRect(x: 20, y: y0 + 58, width: 30, height: 3.5), red)
  let kick = attr("\(s.section)  ·  ", sansB(10.5), red, kern: 1.4).mutableCopy() as! NSMutableAttributedString
  kick.append(attr(s.ago, sans(10.5), quiet, kern: 1.4))
  kick.draw(at: CGPoint(x: 20, y: y0 + 70))
  img(s.photo, fill: CGRect(x: 20, y: y0 + 104, width: 350, height: 350 * 795 / 1080))
  text(s.title, serif(26), ink, CGRect(x: 20, y: y0 + 382, width: 350, height: 100), lh: 30)
  text(s.caption, sansR(13.5), ink2, CGRect(x: 20, y: y0 + 490, width: 350, height: 44), lh: 19)
  line(CGPoint(x: 20, y: y0 + 690), CGPoint(x: 370, y: y0 + 690), rule2, 1)
  text("Save", sans(12), ink, CGRect(x: 40, y: y0 + 705, width: 80, height: 16))
  stroke(CGRect(x: 21, y: y0 + 706, width: 11, height: 13), ink, 1.3, radius: 1.5)
  text("TAP TO READ", sansB(10), quiet, CGRect(x: 120, y: y0 + 707, width: 150, height: 16), align: .center, kern: 1.6)
  text("Share", sans(12), ink, CGRect(x: 300, y: y0 + 705, width: 70, height: 16), align: .right)
}
func feedScreen(scroll: CGFloat) {
  fill(CGRect(x: 0, y: 0, width: SW, height: SH), paper)
  withState {
    clip(CGRect(x: 0, y: 0, width: SW, height: 780))
    for (i, s) in stories.enumerated() {
      let y = 44 + CGFloat(i) * 736 - scroll
      if y > -740 && y < 800 { feedCard(s, y0: y) }
    }
    // top bar over the feed
    fill(CGRect(x: 0, y: 0, width: SW, height: 44), paper.withAlphaComponent(0.92))
  }
  bottomNav(active: 0)
}
func chautariHeader() {
  text("CHAUTARI KO CHAYAMA SWAGAT CHA", serif(12.5), ink, CGRect(x: 40, y: 54, width: SW - 80, height: 18), align: .center, kern: 0.3)
  ring(CGPoint(x: 362, y: 61), 11, rule2, 1); text("Y", serif(11), ink, CGRect(x: 351, y: 54, width: 22, height: 14), align: .center)
  fill(CGRect(x: 0, y: 82, width: SW, height: 28), ink)
}
func chautariList(pressOpen: Double, pressRoom: Double, t: Double) {
  fill(CGRect(x: 0, y: 0, width: SW, height: SH), paper)
  chautariHeader()
  circle(CGPoint(x: 22, y: 96), 3, red)
  text("ON AIR  ·  1 ROOM LIVE FROM THE NEWSROOM", sansB(9), paper, CGRect(x: 32, y: 90, width: 280, height: 14), kern: 1.1)
  text("21:30 NPT", sans(9), paper, CGRect(x: 300, y: 90, width: 72, height: 14), align: .right, kern: 1)
  text("Listen · Speak · Host", sansR(10.5), quiet, CGRect(x: 20, y: 128, width: 200, height: 16))
  text("EARN ON CHAUTARI →", sansB(9.5), ink, CGRect(x: 200, y: 129, width: 170, height: 16), align: .right, kern: 1.1)
  line(CGPoint(x: 20, y: 152), CGPoint(x: 370, y: 152), rule, 1)
  text("ON AIR NOW", sansB(9.5), ink, CGRect(x: 20, y: 172, width: 150, height: 14), kern: 1.2)
  text("1 LIVE", sans(9.5), quiet, CGRect(x: 250, y: 172, width: 120, height: 14), align: .right, kern: 1.2)
  line(CGPoint(x: 20, y: 192), CGPoint(x: 370, y: 192), ink, 1.2)
  // room card
  let card = CGRect(x: 12, y: 204, width: 366, height: 132)
  if pressRoom > 0 { fill(card, paper2.blended(withFraction: CGFloat(pressRoom) * 0.5, of: rule)!, radius: 8) }
  let pulse = 0.55 + 0.45 * sin(t * 6)
  circle(CGPoint(x: 23, y: 222), 3.2, red.withAlphaComponent(CGFloat(pulse)))
  text("LIVE", sansB(9.5), red, CGRect(x: 31, y: 216, width: 40, height: 14), kern: 1.2)
  text("·  On air 12:04", sansR(9.5), quiet, CGRect(x: 60, y: 216, width: 120, height: 14))
  text("Kathmandu tonight: your questions, our newsroom", serifR(23), ink, CGRect(x: 20, y: 236, width: 340, height: 60), lh: 27)
  ring(CGPoint(x: 34, y: 312), 13, rule2, 1); text("IC", serif(11), ink, CGRect(x: 21, y: 305, width: 26, height: 14), align: .center)
  let host = attr("ICN Newsroom ", sans(12), ink).mutableCopy() as! NSMutableAttributedString
  host.append(attr("HOST", sansB(8), quiet, kern: 1)); host.draw(at: CGPoint(x: 55, y: 298))
  text("38 listening · 3 on stage", sansR(10.5), quiet, CGRect(x: 55, y: 315, width: 200, height: 14))
  // open a room
  let b = CGRect(x: 20, y: 700, width: 350, height: 48)
  fill(b, ink.blended(withFraction: CGFloat(pressOpen) * 0.35, of: red)!)
  text("+  OPEN A ROOM", sansB(11.5), paper, CGRect(x: b.minX, y: b.minY + 16, width: b.width, height: 18), align: .center, kern: 1.8)
  bottomNav(active: 2)
}
struct Person { let initials: String; let name: String }
func roomScreen(host: Bool, t: Double, speakingIdx: Int) {
  fill(CGRect(x: 0, y: 0, width: SW, height: SH), paper)
  text("← ALL ROOMS", sansB(9.5), ink, CGRect(x: 20, y: 56, width: 100, height: 14), kern: 1.1)
  text(host ? "Your room" : "Kathmandu tonight", serif(13), ink, CGRect(x: 110, y: 54, width: 170, height: 18), align: .center)
  text("SHARE", sansB(9.5), ink, CGRect(x: 300, y: 56, width: 70, height: 14), align: .right, kern: 1.1)
  fill(CGRect(x: 0, y: 82, width: SW, height: 28), ink)
  circle(CGPoint(x: 22, y: 96), 3, red)
  let secs = host ? Int(max(0, t - 16.9)) : 724 + Int(t - 13)
  let clock = String(format: "%d:%02d", secs / 60, secs % 60)
  text("LIVE  ·  ON AIR \(clock)  ·  \(host ? 12 + Int(max(0, t - 17) * 3) : 38) IN THE ROOM", sansB(9), paper, CGRect(x: 32, y: 90, width: 340, height: 14), kern: 1.1)
  text(host ? "Diaspora hour: life after the UK rule change" : "Kathmandu tonight", serifR(25), ink, CGRect(x: 20, y: 130, width: 350, height: 64), lh: 29)
  let hy: CGFloat = host ? 194 : 166
  text(host ? "Hosted by you" : "Hosted by ICN Newsroom", sansR(11), quiet, CGRect(x: 20, y: hy, width: 220, height: 16))
  let tag = host ? "YOU · HOST" : "YOU · LISTENER"
  let tw = textW(tag, sansB(8), kern: 1) + 16
  stroke(CGRect(x: 370 - tw, y: hy - 2, width: tw, height: 18), host ? red : rule2, 1)
  text(tag, sansB(8), host ? red : quiet, CGRect(x: 370 - tw, y: hy + 2, width: tw, height: 12), align: .center, kern: 1)
  let sy: CGFloat = hy + 40
  let stage: [Person] = host ? [Person(initials: "Y", name: "You"), Person(initials: "AS", name: "Anjali S."), Person(initials: "RK", name: "Rabin K.")]
                             : [Person(initials: "IC", name: "ICN Newsroom"), Person(initials: "PG", name: "Priya G."), Person(initials: "BT", name: "Bikash T.")]
  text("ON STAGE · \(stage.count)", sansB(9.5), ink, CGRect(x: 20, y: sy, width: 200, height: 14), kern: 1.2)
  line(CGPoint(x: 20, y: sy + 20), CGPoint(x: 370, y: sy + 20), ink, 1.2)
  for (i, p) in stage.enumerated() {
    let c = CGPoint(x: 60 + CGFloat(i) * 105, y: sy + 70)
    let speaking = i == speakingIdx
    if speaking {
      let ph = (t * 1.6).truncatingRemainder(dividingBy: 1)
      ring(c, 31 + CGFloat(ph) * 14, red.withAlphaComponent(CGFloat(0.55 * (1 - ph))), 2)
    }
    circle(c, 30, paper); ring(c, 30, speaking ? red : rule2, speaking ? 2.2 : 1.2)
    text(p.initials, serif(18), ink, CGRect(x: c.x - 30, y: c.y - 12, width: 60, height: 24), align: .center)
    text(p.name, sans(11), ink, CGRect(x: c.x - 50, y: c.y + 38, width: 100, height: 16), align: .center)
    text(speaking ? "● SPEAKING" : "ON STAGE", sansB(7.5), speaking ? red : quiet, CGRect(x: c.x - 50, y: c.y + 55, width: 100, height: 12), align: .center, kern: 1)
  }
  let ry = sy + 160
  let readers = host ? min(9, 2 + Int(max(0, t - 17) * 3)) : 35
  text("READERS IN THE ROOM · \(readers)", sansB(9.5), ink, CGRect(x: 20, y: ry, width: 250, height: 14), kern: 1.2)
  line(CGPoint(x: 20, y: ry + 20), CGPoint(x: 370, y: ry + 20), rule2, 1)
  let letters = ["S", "M", "A", "K", "P", "D", "R", "N", "B", "T", "G", "U", "H", "J", "L", "Y", "S", "M", "A", "K", "P", "D", "R", "N"]
  for i in 0..<min(readers, 24) {
    let c = CGPoint(x: 38 + CGFloat(i % 8) * 45, y: ry + 52 + CGFloat(i / 8) * 46)
    var a = 1.0
    if host { a = eo(pr(t, 17.2 + Double(i) * 0.33, 17.6 + Double(i) * 0.33)) }
    alpha(a) {
      ring(c, 16, rule2, 1); text(letters[i], sans(10), ink2, CGRect(x: c.x - 16, y: c.y - 7, width: 32, height: 14), align: .center)
    }
  }
  if !host { text("You are listening. Raise a hand if you would like to speak.", sansR(10.5), quiet, CGRect(x: 20, y: ry + 190, width: 350, height: 16)) }
  line(CGPoint(x: 0, y: 772), CGPoint(x: SW, y: 772), rule, 1)
  text(host ? "END" : "LEAVE", sansB(9.5), quiet, CGRect(x: 20, y: 796, width: 60, height: 14), kern: 1.2)
  let bb = CGRect(x: 90, y: 786, width: 280, height: 36)
  if host { fill(bb, ink); text("●  LIVE · TAP TO MUTE", sansB(9.5), paper, CGRect(x: bb.minX, y: bb.minY + 11, width: bb.width, height: 14), align: .center, kern: 1.4) }
  else { stroke(bb, rule2, 1); text("RAISE HAND", sansB(9.5), ink, CGRect(x: bb.minX, y: bb.minY + 11, width: bb.width, height: 14), align: .center, kern: 1.4) }
}
func earnSheet(_ k: Double) {
  if k <= 0 { return }
  let y = lerp(SH, 540, eo(k))
  alpha(min(1, k * 3)) { fill(CGRect(x: 0, y: 0, width: SW, height: SH), ink.withAlphaComponent(0.25 * CGFloat(k))) }
  let r = CGRect(x: 0, y: y, width: SW, height: SH - 540 + 40)
  withState {
    let sh = NSShadow(); sh.shadowBlurRadius = 30; sh.shadowColor = NSColor(white: 0, alpha: 0.2); sh.set()
    fill(r, paper, radius: 22)
  }
  fill(CGRect(x: SW / 2 - 20, y: y + 10, width: 40, height: 4), rule2, radius: 2)
  fill(CGRect(x: 24, y: y + 36, width: 30, height: 3.5), red)
  text("EARN ON CHAUTARI", sansB(10), red, CGRect(x: 24, y: y + 48, width: 300, height: 14), kern: 1.6)
  text("Your room. Your audience. Your income.", serif(24), ink, CGRect(x: 24, y: y + 70, width: 340, height: 64), lh: 28)
  text("Hosts earn from the conversations they lead.", sansR(13), ink2, CGRect(x: 24, y: y + 138, width: 340, height: 40), lh: 18)
  fill(CGRect(x: 24, y: y + 196, width: 342, height: 46), ink)
  text("LEARN HOW  →", sansB(11), paper, CGRect(x: 24, y: y + 211, width: 342, height: 16), align: .center, kern: 1.8)
}

// MARK: scene: the boring portal
func portal(t: Double) {
  let enter = eo(pr(t, 0.15, 0.8))
  let exitK = eio(pr(t, 3.55, 4.4))
  let r0 = CGRect(x: 120, y: 640, width: 840, height: 1060)
  withState {
    ctx.translateBy(x: r0.midX, y: r0.midY + CGFloat(1 - enter) * 120 + CGFloat(exitK) * 900)
    ctx.rotate(by: CGFloat(-0.02 + exitK * 0.18))
    let s = 1 - 0.12 * exitK
    ctx.scaleBy(x: s, y: s)
    ctx.translateBy(x: -r0.width / 2, y: -r0.height / 2)
    let r = CGRect(x: 0, y: 0, width: r0.width, height: r0.height)
    alpha(enter * (1 - exitK)) {
      withState { let sh = NSShadow(); sh.shadowBlurRadius = 50; sh.shadowOffset = NSSize(width: 0, height: -20); sh.shadowColor = NSColor(white: 0, alpha: 0.18); sh.set(); fill(r, hex("ffffff"), radius: 16) }
      withState {
        clip(r, radius: 16)
        // browser chrome
        fill(CGRect(x: 0, y: 0, width: r.width, height: 64), hex("e4e4e4"))
        for i in 0..<3 { circle(CGPoint(x: 30 + CGFloat(i) * 26, y: 32), 8, [hex("c9c9c9"), hex("d2d2d2"), hex("dadada")][i]) }
        fill(CGRect(x: 120, y: 16, width: 600, height: 32), hex("f6f6f6"), radius: 16)
        text("www.yet-another-news-portal.com", NSFont.systemFont(ofSize: 17), hex("8a8a8a"), CGRect(x: 145, y: 22, width: 560, height: 22))
        // masthead
        text("DAILY NEWS PORTAL 24×7", NSFont(name: "Times New Roman Bold", size: 46) ?? NSFont.boldSystemFont(ofSize: 46), hex("1d3f8f"), CGRect(x: 30, y: 86, width: 780, height: 60))
        fill(CGRect(x: 0, y: 156, width: r.width, height: 44), hex("1d3f8f"))
        for (i, n) in ["HOME", "POLITICS", "BIZ", "SPORTS", "ENTMT", "GALLERY", "MORE ▾"].enumerated() {
          text(n, NSFont.boldSystemFont(ofSize: 15), .white, CGRect(x: 24 + CGFloat(i) * 112, y: 168, width: 110, height: 20))
        }
        // ticker
        fill(CGRect(x: 0, y: 200, width: r.width, height: 38), hex("f3f3f3"))
        fill(CGRect(x: 0, y: 200, width: 130, height: 38), hex("c8161d"))
        text("BREAKING", NSFont.boldSystemFont(ofSize: 15), .white, CGRect(x: 18, y: 210, width: 120, height: 20))
        withState {
          clip(CGRect(x: 130, y: 200, width: r.width - 130, height: 38))
          let off = CGFloat((t * 160).truncatingRemainder(dividingBy: 900))
          text("Click here to read more ... Click here to read more ... You won't believe what happened next ... Click here", NSFont.systemFont(ofSize: 16), hex("444444"), CGRect(x: 150 - off, y: 209, width: 1800, height: 22))
        }
        // ad banner
        let ad = CGRect(x: 30, y: 262, width: r.width - 60, height: 150)
        fill(ad, hex("eeeeee"))
        for k in stride(from: -200, to: Int(ad.width) + 200, by: 28) {
          withState { clip(ad); line(CGPoint(x: ad.minX + CGFloat(k), y: ad.maxY), CGPoint(x: ad.minX + CGFloat(k) + 150, y: ad.minY), hex("e2e2e2"), 10) }
        }
        text("ADVERTISEMENT", NSFont.boldSystemFont(ofSize: 18), hex("9a9a9a"), CGRect(x: ad.minX, y: ad.midY - 12, width: ad.width, height: 24), align: .center, kern: 4)
        // dense link grid
        for row in 0..<3 {
          for col in 0..<3 {
            let x = 30 + CGFloat(col) * 266, y = 436 + CGFloat(row) * 196
            fill(CGRect(x: x, y: y, width: 246, height: 110), hex("d9d9d9"))
            for l in 0..<3 { fill(CGRect(x: x, y: y + 122 + CGFloat(l) * 20, width: CGFloat([236, 200, 150][l]), height: 9), hex(l == 0 ? "3a5fb5" : "b9b9b9")) }
          }
        }
        // cookie banner + popup
        let ck = eo(pr(t, 2.0, 2.4))
        fill(CGRect(x: 0, y: r.height - 120 * CGFloat(ck), width: r.width, height: 120), hex("2b2b2b"))
        text("We use cookies to improve your experience.  ACCEPT ALL", NSFont.systemFont(ofSize: 16), hex("dddddd"), CGRect(x: 30, y: r.height - 120 * CGFloat(ck) + 48, width: 780, height: 22))
        let pk = back(pr(t, 1.3, 1.75))
        if pk > 0 {
          withState {
            let pr0 = CGRect(x: 170, y: 420, width: 500, height: 240)
            ctx.translateBy(x: pr0.midX, y: pr0.midY); ctx.scaleBy(x: CGFloat(pk), y: CGFloat(pk)); ctx.translateBy(x: -pr0.midX, y: -pr0.midY)
            fill(r, NSColor(white: 0, alpha: 0.0))
            withState { let sh = NSShadow(); sh.shadowBlurRadius = 30; sh.shadowColor = NSColor(white: 0, alpha: 0.35); sh.set(); fill(pr0, .white, radius: 10) }
            text("🔔  Allow notifications?", NSFont.boldSystemFont(ofSize: 24), hex("222222"), CGRect(x: pr0.minX + 34, y: pr0.minY + 40, width: 440, height: 34))
            text("Get 47 breaking alerts a day!", NSFont.systemFont(ofSize: 18), hex("777777"), CGRect(x: pr0.minX + 34, y: pr0.minY + 86, width: 440, height: 26))
            fill(CGRect(x: pr0.minX + 34, y: pr0.minY + 150, width: 200, height: 54), hex("1d3f8f"), radius: 6)
            text("ALLOW", NSFont.boldSystemFont(ofSize: 18), .white, CGRect(x: pr0.minX + 34, y: pr0.minY + 166, width: 200, height: 24), align: .center)
            stroke(CGRect(x: pr0.minX + 262, y: pr0.minY + 150, width: 200, height: 54), hex("bbbbbb"), 2, radius: 6)
            text("LATER", NSFont.boldSystemFont(ofSize: 18), hex("666666"), CGRect(x: pr0.minX + 262, y: pr0.minY + 166, width: 200, height: 24), align: .center)
          }
        }
        // greyed-out dullness
        fill(r, NSColor(white: 0.5, alpha: 0.06))
      }
    }
  }
  // red strike through the portal
  let st = eio(pr(t, 2.75, 3.2))
  if st > 0 {
    alpha(1 - exitK) {
      let a = CGPoint(x: 90, y: 1500), b = CGPoint(x: 990, y: 860)
      let e = CGPoint(x: a.x + (b.x - a.x) * CGFloat(st), y: a.y + (b.y - a.y) * CGFloat(st))
      line(a, e, red, 26)
    }
  }
}

// MARK: captions
func caption(_ lines: [NSAttributedString], top: CGFloat, t: Double, a: Double, b: Double, lineGap: CGFloat) {
  var y = top
  for (i, l) in lines.enumerated() {
    let k = eo(pr(t, a + Double(i) * 0.12, a + 0.55 + Double(i) * 0.12))
    let out = pr(t, b - 0.3, b)
    let h = l.size().height
    alpha(k * (1 - out)) {
      l.draw(with: CGRect(x: 60, y: y + CGFloat(1 - k) * 46 - CGFloat(out) * 30, width: W - 120, height: h + 20), options: [.usesLineFragmentOrigin])
    }
    y += lineGap
  }
}
func headline(_ s: String, size: CGFloat = 96, color: NSColor = ink, italic: Bool = false) -> NSAttributedString {
  attr(s, italic ? serifI(size) : serif(size), color, align: .center, kern: -1.5)
}
func mixed(_ parts: [(String, NSFont, NSColor)]) -> NSAttributedString {
  let m = NSMutableAttributedString()
  let ps = NSMutableParagraphStyle(); ps.alignment = .center
  for p in parts { m.append(NSAttributedString(string: p.0, attributes: [.font: p.1, .foregroundColor: p.2, .kern: -1.5, .paragraphStyle: ps])) }
  return m
}
func kicker(_ s: String, _ c: NSColor = red) -> NSAttributedString { attr(s, sansB(28), c, align: .center, kern: 6) }
func sub(_ s: String) -> NSAttributedString { attr(s, sansR(36), ink2, align: .center) }

// MARK: background
func backdrop(t: Double) {
  fill(CGRect(x: 0, y: 0, width: W, height: H), paper2)
  // a huge, quiet version of the ICN ring behind everything
  let c = CGPoint(x: 540, y: 1260), r: CGFloat = 640
  let rot = CGFloat(t * 0.05)
  let p = NSBezierPath()
  let start = 6.0 * .pi / 180, sweep = 328.0 * .pi / 180
  for i in 0...180 {
    let th = start + sweep * Double(i) / 180 + Double(rot)
    let pt = CGPoint(x: c.x + r * CGFloat(cos(th)), y: c.y + r * CGFloat(sin(th)))
    i == 0 ? p.move(to: pt) : p.line(to: pt)
  }
  rule.setStroke(); p.lineWidth = 26; p.lineCapStyle = .round; p.stroke()
  let dth = -10.0 * .pi / 180 + Double(rot)
  circle(CGPoint(x: c.x + r * CGFloat(cos(dth)), y: c.y + r * CGFloat(sin(dth))), 70, red.withAlphaComponent(0.12))
}

// MARK: end card logo
func logo(center c: CGPoint, r: CGFloat, k: Double, t: Double, t0: Double) {
  let draw = eio(pr(t, t0, t0 + 1.0))
  let p = NSBezierPath()
  let start = 6.0 * .pi / 180, sweep = 328.0 * .pi / 180 * draw
  if draw > 0 {
    for i in 0...200 {
      let th = start + sweep * Double(i) / 200
      let pt = CGPoint(x: c.x + r * CGFloat(cos(th)), y: c.y + r * CGFloat(sin(th)))
      i == 0 ? p.move(to: pt) : p.line(to: pt)
    }
    ink.setStroke(); p.lineWidth = r * 0.056; p.lineCapStyle = .round; p.stroke()
  }
  let dk = back(pr(t, t0 + 0.85, t0 + 1.25))
  let dth = -10.0 * .pi / 180
  if dk > 0 { circle(CGPoint(x: c.x + r * CGFloat(cos(dth)), y: c.y + r * CGFloat(sin(dth))), r * 0.168 * CGFloat(dk), red) }
  let tk = eo(pr(t, t0 + 0.45, t0 + 1.05))
  alpha(tk) {
    let f = font("Archivo_500Medium", r * 0.6)
    let s = attr("ICN", f, ink, align: .center, kern: r * 0.035)
    let sz = s.size()
    s.draw(at: CGPoint(x: c.x - sz.width / 2 + r * 0.02, y: c.y - sz.height / 2 + CGFloat(1 - tk) * 20))
  }
}

// MARK: frame
func drawFrame(_ t: Double) {
  backdrop(t: t)

  // Scene 1 — boring portals
  portal(t: t)
  caption([headline("Stop reading"), mixed([("boring", serifI(96), red), (" news portals.", serif(96), ink)])], top: 200, t: t, a: 0.2, b: 4.3, lineGap: 112)

  // Phone visibility across scenes 2–4
  let pin = eo(pr(t, 4.1, 5.0)), pout = eio(pr(t, 20.7, 21.5))
  if pin > 0 && pout < 1 {
    let top = 610 + CGFloat(1 - pin) * 1400 + CGFloat(pout) * 1500
    phone(centerX: W / 2, top: top, scale: 1, rotate: CGFloat((1 - pin) * 0.08 - pout * 0.1)) {
      // which screen?
      let toChautari = eio(pr(t, 10.15, 10.75))
      let toRoom = eio(pr(t, 12.95, 13.5))
      let backToList = eio(pr(t, 15.55, 16.05))
      let toHost = eio(pr(t, 16.75, 17.3))
      if toChautari < 1 {
        // feed scroll: snap to each next story
        var scroll: CGFloat = 0
        for (i, at) in [5.9, 7.15, 8.45].enumerated() { scroll += 736 * CGFloat(eio(pr(t, at, at + 0.55))); _ = i }
        // a little finger-drag anticipation before each snap
        withState { ctx.translateBy(x: -SW * CGFloat(toChautari), y: 0); feedScreen(scroll: scroll) }
      }
      if toChautari > 0 && toHost < 1 {
        withState {
          ctx.translateBy(x: SW * CGFloat(1 - toChautari) - SW * CGFloat(toRoom) + SW * CGFloat(toRoom * backToList), y: 0)
          chautariList(pressOpen: pr(t, 16.35, 16.55) * (1 - pr(t, 16.7, 16.9)), pressRoom: pr(t, 12.6, 12.8) * (1 - pr(t, 13.3, 13.5)), t: t)
        }
        if toRoom > 0 && backToList < 1 {
          withState {
            ctx.translateBy(x: SW * CGFloat(1 - toRoom) + SW * CGFloat(backToList), y: 0)
            roomScreen(host: false, t: t, speakingIdx: Int(t * 0.9) % 3)
          }
        }
      }
      if toHost > 0 {
        withState {
          ctx.translateBy(x: 0, y: SH * CGFloat(1 - toHost))
          roomScreen(host: true, t: t, speakingIdx: 0)
          earnSheet(pr(t, 18.55, 19.2))
        }
      }
      // taps
      for (at, pt) in [(12.6, CGPoint(x: 190, y: 270)), (16.35, CGPoint(x: 195, y: 724)), (19.9, CGPoint(x: 195, y: 759))] {
        let k = pr(t, at, at + 0.5)
        if k > 0 && k < 1 {
          circle(pt, 14 + 26 * CGFloat(k), ink.withAlphaComponent(0.18 * CGFloat(1 - k)))
          circle(pt, 13, ink.withAlphaComponent(0.25 * CGFloat(1 - k)))
        }
      }
      // swipe hints on the feed
      for at in [5.75, 7.0, 8.3] {
        let k = pr(t, at, at + 0.6)
        if k > 0 && k < 1 {
          let y = 560 - 260 * CGFloat(eo(k))
          circle(CGPoint(x: 290, y: y), 15, ink.withAlphaComponent(0.22 * CGFloat(sin(k * .pi))))
        }
      }
    }
  }

  // Scene 2 captions — just scroll
  caption([headline("Just scroll.")], top: 250, t: t, a: 4.7, b: 7.3, lineGap: 110)
  caption([headline("Be cool."), mixed([("Stay ", serif(96), ink), ("informed.", serifI(96), red)])], top: 200, t: t, a: 7.3, b: 10.2, lineGap: 112)

  // Scene 3 — Chautari
  caption([kicker("INTRODUCING")], top: 150, t: t, a: 10.3, b: 13.1, lineGap: 70)
  caption([headline("Chautari", size: 130)], top: 196, t: t, a: 10.42, b: 13.1, lineGap: 70)
  caption([sub("Live audio rooms on the news.")], top: 360, t: t, a: 10.55, b: 13.1, lineGap: 70)
  caption([headline("Listen. Speak."), mixed([("Be ", serif(96), ink), ("heard.", serifI(96), red)])], top: 200, t: t, a: 13.1, b: 16.0, lineGap: 112)

  // Scene 4 — host and earn
  caption([headline("Host a room.")], top: 250, t: t, a: 16.0, b: 18.5, lineGap: 110)
  caption([mixed([("Earn", serifI(110), red), (" on Chautari.", serif(96), ink)]), sub("Your voice. Your audience.")], top: 190, t: t, a: 18.5, b: 21.1, lineGap: 130)

  // Scene 5 — end card
  let ek = eo(pr(t, 21.0, 21.6))
  if ek > 0 {
    alpha(ek) { fill(CGRect(x: 0, y: 0, width: W, height: H), paper) }
    logo(center: CGPoint(x: 540, y: 760), r: 250, k: ek, t: t, t0: 21.4)
    caption([headline("For Nepal,", size: 92), mixed([("from ", serif(92), ink), ("Nepali.", serifI(92), red)])], top: 1120, t: t, a: 22.5, b: 99, lineGap: 104)
    caption([attr("नेपालका लागि, नेपालीबाट", deva(40), quiet, align: .center)], top: 1350, t: t, a: 23.0, b: 99, lineGap: 60)
    alpha(eo(pr(t, 23.4, 23.9))) {
      line(CGPoint(x: 470, y: 1478), CGPoint(x: 610, y: 1478), rule2, 2)
      text("ICN.NEWS", sansB(30), ink, CGRect(x: 0, y: 1510, width: W, height: 40), align: .center, kern: 7)
    }
  }
}

// MARK: render
func makeContext(_ data: UnsafeMutableRawPointer?, bytesPerRow: Int) -> CGContext {
  let c = CGContext(data: data, width: Int(W), height: Int(H), bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  c.translateBy(x: 0, y: H); c.scaleBy(x: 1, y: -1)
  return c
}
func render(into c: CGContext, t: Double) {
  ctx = c
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: c, flipped: true)
  c.setShouldAntialias(true); c.interpolationQuality = .high
  drawFrame(t)
  NSGraphicsContext.restoreGraphicsState()
}

let out = CommandLine.arguments[2]
if CommandLine.arguments.count > 3 {
  for ts in CommandLine.arguments[3].split(separator: ",") {
    let t = Double(ts)!
    let c = makeContext(nil, bytesPerRow: 0)
    render(into: c, t: t)
    let rep = NSBitmapImageRep(cgImage: c.makeImage()!)
    try! rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85])!.write(to: URL(fileURLWithPath: String(format: "%@/still_%05.2f.jpg", out, t)))
  }
  exit(0)
}

try? FileManager.default.removeItem(atPath: out)
let writer = try! AVAssetWriter(outputURL: URL(fileURLWithPath: out), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: Int(W), AVVideoHeightKey: Int(H),
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: Int(W), kCVPixelBufferHeightKey as String: Int(H),
])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let frames = Int(DUR * Double(FPS))
for f in 0..<frames {
  while !input.isReadyForMoreMediaData { usleep(1000) }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  CVPixelBufferLockBaseAddress(pb!, [])
  let c = makeContext(CVPixelBufferGetBaseAddress(pb!), bytesPerRow: CVPixelBufferGetBytesPerRow(pb!))
  autoreleasepool { render(into: c, t: Double(f) / Double(FPS)) }
  CVPixelBufferUnlockBaseAddress(pb!, [])
  adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(f), timescale: FPS))
  if f % 75 == 0 { print("frame \(f)/\(frames)") }
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
print("done", writer.status.rawValue, writer.error?.localizedDescription ?? "")
