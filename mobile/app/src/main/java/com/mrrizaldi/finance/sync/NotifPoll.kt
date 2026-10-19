package com.mrrizaldi.finance.sync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.mrrizaldi.finance.App
import com.mrrizaldi.finance.MainActivity
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.remote.NotificationDto
import java.time.Instant

const val NOTIF_CHANNEL = "finance_notif"
private const val PREFS = "notif_poll"
private const val KEY_LAST = "last_notified_at"

fun latestCreatedAt(rows: List<NotificationDto>, fallback: String): String =
    rows.maxOfOrNull { it.createdAt } ?: fallback

class NotifPollWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val api = (applicationContext as App).container.api
        if (api.awaitSession() == null) return Result.success()

        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val since = prefs.getString(KEY_LAST, null)
        if (since == null) {
            prefs.edit().putString(KEY_LAST, Instant.now().toString()).apply()
            return Result.success()
        }

        val rows = runCatching { api.listNotifications(since, 20) }.getOrElse { return Result.retry() }
        if (rows.isEmpty()) return Result.success()

        ensureChannel()
        val open = PendingIntent.getActivity(
            applicationContext,
            0,
            Intent(applicationContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val manager = NotificationManagerCompat.from(applicationContext)
        rows.forEach { row ->
            val notification = NotificationCompat.Builder(applicationContext, NOTIF_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(row.title)
                .setContentText(row.body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(row.body))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            runCatching { manager.notify(row.id.hashCode(), notification) }
        }

        prefs.edit().putString(KEY_LAST, latestCreatedAt(rows, since)).apply()
        return Result.success()
    }

    private fun ensureChannel() {
        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(NOTIF_CHANNEL, "Finance", NotificationManager.IMPORTANCE_DEFAULT)
        manager.createNotificationChannel(channel)
    }
}
