package news.icn.audioservice

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS face of [ChautariAudioService]: start it when a Chautari room connects,
 * update it when the reader's role changes, stop it when they leave.
 */
class ChautariAudioServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChautariAudioService")

    Function("start") { title: String, speaking: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, ChautariAudioService::class.java)
        .putExtra(ChautariAudioService.EXTRA_TITLE, title)
        .putExtra(ChautariAudioService.EXTRA_SPEAKING, speaking)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (e: Exception) {
        // Android 12+ refuses to start a foreground service from the
        // background. The room keeps working while the app is open.
        false
      }
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function null
      context.stopService(Intent(context, ChautariAudioService::class.java))
      null
    }
  }
}
