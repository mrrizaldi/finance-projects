package com.mrrizaldi.finance.data

import io.github.jan.supabase.exceptions.RestException
import kotlinx.serialization.Serializable
import java.io.IOException

@Serializable
data class EntryPayload(
    val account: String,
    val type: String,
    val amount: Long,
    val category: String?,
    val description: String?,
    val merchant: String?,
    val date: String
)

@Serializable
data class TransferPayload(
    val fromAccount: String,
    val toAccount: String,
    val amount: Long,
    val toAmount: Long?,
    val description: String?,
    val date: String
)

enum class SaveStatus { SENT, QUEUED }

enum class FlushResult { DONE, RETRY }

sealed interface SendOutcome {
    data class Sent(val date: String) : SendOutcome
    data object Retry : SendOutcome
    data class Failed(val message: String) : SendOutcome
}

internal fun retryableStatus(code: Int): Boolean = code == 401 || code == 408 || code == 429 || code >= 500

internal fun retryable(e: Throwable): Boolean = when (e) {
    is IOException -> true
    is RestException -> retryableStatus(e.statusCode)
    else -> false
}

internal fun errorText(e: Throwable): String = when (e) {
    is RestException -> e.error
    else -> e.message ?: e.javaClass.simpleName
}
