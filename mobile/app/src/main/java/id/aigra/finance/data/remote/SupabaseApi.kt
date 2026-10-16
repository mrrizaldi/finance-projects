package id.aigra.finance.data.remote

import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.flow.StateFlow

interface SupabaseApi {
    val sessionStatus: StateFlow<SessionStatus>
    fun currentSession(): UserSession? = (sessionStatus.value as? SessionStatus.Authenticated)?.session
    suspend fun signIn(email: String, password: String)
    suspend fun signOut()
    suspend fun clearLocalSession()
    suspend fun listAccounts(): List<AccountDto>
    suspend fun listCategories(): List<CategoryDto>
    suspend fun listTransactions(start: String, end: String, limit: Int, offset: Int): List<TransactionDto>
    suspend fun getSummary(start: String, end: String): SummaryDto
    suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto>
    suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    ): String
    suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String
    ): String
}
