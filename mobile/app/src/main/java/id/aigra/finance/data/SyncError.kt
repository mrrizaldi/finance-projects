package id.aigra.finance.data

sealed class SyncError(message: String? = null, cause: Throwable? = null) : Exception(message, cause) {
    object Offline : SyncError("offline")
    object Unauthorized : SyncError("unauthorized")
    class Server(cause: Throwable) : SyncError(cause.message, cause)
}
