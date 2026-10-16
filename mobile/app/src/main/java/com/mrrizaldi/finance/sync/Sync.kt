package com.mrrizaldi.finance.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.mrrizaldi.finance.App
import com.mrrizaldi.finance.data.FlushResult
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.util.JakartaDate
import java.time.Duration

object Sync {
    private const val FLUSH = "flush-outbox"
    private const val REFRESH = "refresh-home"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun flush(context: Context) {
        val request = OneTimeWorkRequestBuilder<FlushOutboxWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(FLUSH, ExistingWorkPolicy.KEEP, request)
    }

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<RefreshWorker>(Duration.ofHours(1))
            .setConstraints(online)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(REFRESH, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}

class FlushOutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = (applicationContext as App).container.repository
        return if (repo.flushOutbox() == FlushResult.RETRY) Result.retry() else Result.success()
    }
}

class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = (applicationContext as App).container.repository
        val error = repo.refreshHome(JakartaDate.currentMonth()).exceptionOrNull()
        return if (error is SyncError.Offline) Result.retry() else Result.success()
    }
}
