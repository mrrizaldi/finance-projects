package com.mrrizaldi.finance.data.remote

import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.flow.StateFlow

interface SupabaseApi {
    val sessionStatus: StateFlow<SessionStatus>
    fun currentSession(): UserSession? = (sessionStatus.value as? SessionStatus.Authenticated)?.session
    suspend fun awaitSession(): UserSession? = currentSession()
    suspend fun signIn(email: String, password: String)
    suspend fun signOut()
    suspend fun clearLocalSession()
    suspend fun listAccounts(): List<AccountDto>
    suspend fun listCategories(): List<CategoryDto>
    suspend fun listNotifications(since: String, limit: Int, ascending: Boolean = true): List<NotificationDto>
    suspend fun countUnreadNotifications(): Int
    suspend fun markAllNotificationsRead()
    suspend fun listTransactions(start: String, end: String, limit: Int, offset: Int): List<TransactionDto>
    suspend fun firstTransactionDate(): String?
    suspend fun getSummary(start: String, end: String): SummaryDto
    suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto>
    suspend fun getPeriodComparison(start: String, end: String, prevStart: String, prevEnd: String): PeriodComparisonDto
    suspend fun getMonthlyTrend(months: Int): List<MonthlyTrendDto>
    suspend fun getSavingsRateTrend(months: Int): List<SavingsRateDto>
    suspend fun getDailySpending(start: String, end: String): List<DailySpendingDto>
    suspend fun getTopTransactions(start: String, end: String, limit: Int): List<TopTransactionDto>
    suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String,
        clientId: String
    ): String
    suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String,
        clientId: String
    ): String
    suspend fun updateManualTransaction(
        id: String,
        type: String,
        amount: Long,
        account: String,
        toAccount: String?,
        toAmount: Long?,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    )
    suspend fun deleteManualTransaction(id: String): Boolean
}
