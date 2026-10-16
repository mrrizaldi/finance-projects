package com.mrrizaldi.finance.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.mrrizaldi.finance.App
import com.mrrizaldi.finance.data.FlushResult
import java.time.Duration

object Sync {
    private const val FLUSH = "flush-outbox"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun flush(context: Context) {
        val request = OneTimeWorkRequestBuilder<FlushOutboxWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(FLUSH, ExistingWorkPolicy.KEEP, request)
    }
}

class FlushOutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = (applicationContext as App).container.repository
        return if (repo.flushOutbox() == FlushResult.RETRY) Result.retry() else Result.success()
    }
}
