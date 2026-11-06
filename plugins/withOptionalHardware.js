/**
 * Marks camera and microphone as optional hardware on Android.
 *
 * Android infers "this app requires a camera" from the CAMERA permission
 * (which the live-audio library declares, though the app never turns a
 * camera on), and "requires a microphone" from RECORD_AUDIO. Google Play
 * then hides the app from devices without them: cars, most Chromebooks and
 * some tablets. Reading news and listening to Chautari need neither, and
 * the app already asks for the microphone only when someone speaks.
 */
const { withAndroidManifest } = require("expo/config-plugins");

const OPTIONAL_FEATURES = [
  "android.hardware.camera",
  "android.hardware.camera.any",
  "android.hardware.camera.autofocus",
  "android.hardware.camera.front",
  "android.hardware.microphone",
];

module.exports = function withOptionalHardware(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$["xmlns:tools"] = manifest.$["xmlns:tools"] || "http://schemas.android.com/tools";
    const features = (manifest["uses-feature"] = manifest["uses-feature"] || []);
    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((f) => f.$ && f.$["android:name"] === name);
      if (existing) {
        existing.$["android:required"] = "false";
        existing.$["tools:replace"] = "android:required";
      } else {
        features.push({
          $: { "android:name": name, "android:required": "false", "tools:replace": "android:required" },
        });
      }
    }
    return cfg;
  });
};
