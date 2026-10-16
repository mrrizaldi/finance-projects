package id.aigra.finance.data.remote

import id.aigra.finance.util.JakartaDate
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
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

    override suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    ): String =
        client.postgrest.rpc("record_manual_entry", buildJsonObject {
            put("p_account", account)
            put("p_type", type)
            put("p_amount", amount)
            put("p_category", category)
            put("p_description", description)
            put("p_merchant", merchant)
            put("p_date", date)
        }).decodeAs()

    override suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String
    ): String =
        client.postgrest.rpc("record_manual_transfer", buildJsonObject {
            put("p_from_account", fromAccount)
            put("p_to_account", toAccount)
            put("p_amount", amount)
            put("p_to_amount", toAmount)
            put("p_description", description)
            put("p_date", date)
        }).decodeAs()

    private companion object {
        val TX_COLUMNS = Columns.list(
            "id", "type", "amount", "to_amount", "description", "merchant",
            "category_id", "account_id", "to_account_id", "source", "is_adjustment",
            "balance_after", "transaction_date", "created_at",
            "category_name", "category_color", "account_name", "to_account_name"
        )
    }
}
