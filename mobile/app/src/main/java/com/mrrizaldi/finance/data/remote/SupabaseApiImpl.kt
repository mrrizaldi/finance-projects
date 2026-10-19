package com.mrrizaldi.finance.data.remote

import com.mrrizaldi.finance.util.JakartaDate
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserSession
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class SupabaseApiImpl(private val client: SupabaseClient) : SupabaseApi {

    override val sessionStatus: StateFlow<SessionStatus>
        get() = client.auth.sessionStatus

    override suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    override suspend fun signOut() {
        client.auth.signOut()
    }

    override suspend fun clearLocalSession() {
        client.auth.clearSession()
    }

    override suspend fun awaitSession(): UserSession? {
        client.auth.awaitInitialization()
        return currentSession()
    }

    override suspend fun listAccounts(): List<AccountDto> =
        client.from("accounts").select(Columns.list("id", "name", "type", "balance", "color", "is_active")) {
            filter { eq("is_active", true) }
            order("balance", Order.DESCENDING)
        }.decodeList()

    override suspend fun listCategories(): List<CategoryDto> =
        client.from("categories").select(
            Columns.list("id", "name", "type", "color", "budget_monthly", "sort_order", "is_active")
        ) {
            filter { eq("is_active", true) }
            order("sort_order", Order.ASCENDING)
        }.decodeList()

    override suspend fun listNotifications(since: String, limit: Int, ascending: Boolean): List<NotificationDto> =
        client.from("notifications").select(Columns.list("id", "kind", "title", "body", "created_at", "read_at")) {
            filter { gt("created_at", since) }
            order("created_at", if (ascending) Order.ASCENDING else Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList()

    override suspend fun countUnreadNotifications(): Int =
        client.from("notifications").select(Columns.list("id")) {
            count(Count.EXACT)
            filter { exact("read_at", null) }
            limit(1)
        }.countOrNull()?.toInt() ?: 0

    override suspend fun markAllNotificationsRead() {
        client.from("notifications").update(buildJsonObject { put("read_at", JakartaDate.now().toOffsetDateTime().toString()) }) {
            filter { exact("read_at", null) }
        }
    }

    override suspend fun listTransactions(start: String, end: String, limit: Int, offset: Int): List<TransactionDto> =
        client.from("v_transactions").select(TX_COLUMNS) {
            filter {
                gte("transaction_date", "${start}T00:00:00+07:00")
                lt("transaction_date", JakartaDate.nextDayStart(end))
            }
            order("transaction_date", Order.DESCENDING)
            order("id", Order.DESCENDING)
            range(offset.toLong(), (offset + limit - 1).toLong())
        }.decodeList()

    override suspend fun firstTransactionDate(): String? =
        client.from("v_transactions").select(TX_COLUMNS) {
            order("transaction_date", Order.ASCENDING)
            limit(1)
        }.decodeList<TransactionDto>().firstOrNull()?.transaction_date

    override suspend fun getSummary(start: String, end: String): SummaryDto =
        client.postgrest.rpc("get_summary", buildJsonObject {
            put("p_start_date", start)
            put("p_end_date", end)
        }).decodeSingle()

    override suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto> =
        client.postgrest.rpc("get_category_breakdown", buildJsonObject {
            put("p_start_date", start)
            put("p_end_date", end)
            put("p_type", type)
        }).decodeList()

    override suspend fun getPeriodComparison(
        start: String,
        end: String,
        prevStart: String,
        prevEnd: String
    ): PeriodComparisonDto =
        client.postgrest.rpc("get_period_comparison", buildJsonObject {
            put("p_start", start)
            put("p_end", end)
            put("p_prev_start", prevStart)
            put("p_prev_end", prevEnd)
        }).decodeSingle()

    override suspend fun getMonthlyTrend(months: Int): List<MonthlyTrendDto> =
        client.postgrest.rpc("get_monthly_trend", buildJsonObject {
            put("p_months", months)
        }).decodeList()

    override suspend fun getSavingsRateTrend(months: Int): List<SavingsRateDto> =
        client.postgrest.rpc("get_savings_rate_trend", buildJsonObject {
            put("p_months", months)
        }).decodeList()

    override suspend fun getDailySpending(start: String, end: String): List<DailySpendingDto> =
        client.postgrest.rpc("get_daily_spending", buildJsonObject {
            put("p_start", start)
            put("p_end", end)
        }).decodeList()

    override suspend fun getTopTransactions(start: String, end: String, limit: Int): List<TopTransactionDto> =
        client.postgrest.rpc("get_top_transactions", buildJsonObject {
            put("p_start", start)
            put("p_end", end)
            put("p_limit", limit)
        }).decodeList()

    override suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String,
        clientId: String
    ): String =
        client.postgrest.rpc("record_manual_entry", buildJsonObject {
            put("p_account", account)
            put("p_type", type)
            put("p_amount", amount)
            put("p_category", category)
            put("p_description", description)
            put("p_merchant", merchant)
            put("p_date", date)
            put("p_client_id", clientId)
        }).decodeAs()

    override suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String,
        clientId: String
    ): String =
        client.postgrest.rpc("record_manual_transfer", buildJsonObject {
            put("p_from_account", fromAccount)
            put("p_to_account", toAccount)
            put("p_amount", amount)
            put("p_to_amount", toAmount)
            put("p_description", description)
            put("p_date", date)
            put("p_client_id", clientId)
        }).decodeAs()

    override suspend fun updateManualTransaction(
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
    ) {
        client.postgrest.rpc("update_manual_transaction", buildJsonObject {
            put("p_id", id)
            put("p_type", type)
            put("p_amount", amount)
            put("p_account", account)
            put("p_to_account", toAccount)
            put("p_to_amount", toAmount)
            put("p_category", category)
            put("p_description", description)
            put("p_merchant", merchant)
            put("p_date", date)
        })
    }

    override suspend fun deleteManualTransaction(id: String): Boolean =
        client.postgrest.rpc("delete_manual_transaction", buildJsonObject { put("p_id", id) }).decodeAs()

    private companion object {
        val TX_COLUMNS = Columns.list(
            "id", "type", "amount", "to_amount", "description", "merchant",
            "category_id", "account_id", "to_account_id", "source", "is_adjustment",
            "balance_after", "transaction_date", "created_at",
            "category_name", "category_color", "account_name", "to_account_name"
        )
    }
}
