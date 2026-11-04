package news.icn.audioservice

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps a Chautari room's audio alive while the app is in the background.
 *
 * It does no audio work itself: LiveKit carries the call. Its only job is to
 * be a foreground service with an ongoing notification, which is what Android
 * requires before it lets an app keep playing and, for speakers, keep using
 * the microphone after the screen locks or the reader switches apps.
 */
class ChautariAudioService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() } ?: "Chautari"
    val speaking = intent?.getBooleanExtra(EXTRA_SPEAKING, false) ?: false
    val notification = buildNotification(title, speaking)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val micAllowed = speaking && checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED
      val playback = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      val withMic = playback or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      try {
        startForeground(NOTIFICATION_ID, notification, if (micAllowed) withMic else playback)
      } catch (e: Exception) {
        // The microphone type is refused when Android thinks the app is not
        // in use; listening in the background still works.
        try {
          startForeground(NOTIFICATION_ID, notification, playback)
        } catch (_: Exception) {
          stopSelf()
        }
      }
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_NOT_STICKY
  }

  /** Swiping the app away ends the call, so the notification goes too. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun buildNotification(title: String, speaking: Boolean): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Chautari live audio",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Shown while you are in a Chautari conversation"
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val tap = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setContentTitle(title)
      .setContentText(if (speaking) "You're on stage in Chautari" else "Listening in Chautari")
      .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_CALL)
      .setContentIntent(tap)
      .build()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_SPEAKING = "speaking"
    private const val CHANNEL_ID = "chautari-live-audio"
    private const val NOTIFICATION_ID = 4107
  }
}
