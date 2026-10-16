package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.AccountDao
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryDao
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.RpcSnapshot
import com.mrrizaldi.finance.data.local.SnapshotDao
import com.mrrizaldi.finance.data.local.SyncMeta
import com.mrrizaldi.finance.data.local.SyncMetaDao
import com.mrrizaldi.finance.data.local.TransactionDao
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import com.mrrizaldi.finance.data.remote.TopTransactionDto
import com.mrrizaldi.finance.data.remote.TransactionDto
import com.mrrizaldi.finance.util.JakartaDate
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.exceptions.UnauthorizedRestException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth

data class TxFilter(
    val month: YearMonth,
    val type: String? = null,
    val accountId: String? = null,
    val categoryId: String? = null,
    val search: String? = null
)

internal fun escapeLike(query: String): String =
    query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

class Repository(
    private val api: SupabaseApi,
    private val accountDao: AccountDao,
    private val categoryDao: CategoryDao,
    private val transactionDao: TransactionDao,
    private val snapshotDao: SnapshotDao,
    private val syncMetaDao: SyncMetaDao,
    private val clock: () -> Long = System::currentTimeMillis
) {
    private val json = Json { ignoreUnknownKeys = true }

    fun accounts(): Flow<List<AccountEntity>> = accountDao.observeActive()

    fun categories(): Flow<List<CategoryEntity>> = categoryDao.observeActive()

    fun transactions(filter: TxFilter): Flow<List<TransactionEntity>> = transactionDao.observe(
        start = JakartaDate.monthStart(filter.month),
        end = JakartaDate.monthEnd(filter.month),
        type = filter.type,
        accountId = filter.accountId,
        categoryId = filter.categoryId,
        search = filter.search?.let(::escapeLike)
    )

    fun recent(limit: Int): Flow<List<TransactionEntity>> = transactionDao.observeRecent(limit)

    fun summary(month: YearMonth): Flow<SummaryDto?> =
        snapshotDao.observe(summaryKey(month)).map { row -> row?.let { json.decodeFromString<SummaryDto>(it.json) } }

    fun breakdown(month: YearMonth): Flow<List<CategoryBreakdownDto>> =
        snapshotDao.observe(breakdownKey(month)).map { row ->
            row?.let { json.decodeFromString<List<CategoryBreakdownDto>>(it.json) } ?: emptyList()
        }

    fun previousSummary(month: YearMonth): Flow<SummaryDto?> =
        snapshotDao.observe(previousSummaryKey(month)).map { row -> row?.let { json.decodeFromString<SummaryDto>(it.json) } }

    fun periodComparison(month: YearMonth): Flow<PeriodComparisonDto?> = cached<PeriodComparisonDto>(comparisonKey(month))

    fun monthlyTrend(): Flow<List<MonthlyTrendDto>> = cached<List<MonthlyTrendDto>>(TREND_KEY).map { it.orEmpty() }

    fun savingsRateTrend(): Flow<List<SavingsRateDto>> =
        cached<List<SavingsRateDto>>(SAVINGS_KEY).map { it.orEmpty() }

    fun dailySpending(month: YearMonth): Flow<List<DailySpendingDto>> =
        cached<List<DailySpendingDto>>(dailyKey(month)).map { it.orEmpty() }

    fun topTransactions(month: YearMonth): Flow<List<TopTransactionDto>> =
        cached<List<TopTransactionDto>>(topKey(month)).map { it.orEmpty() }

    fun lastSuccessAt(): Flow<Long?> = syncMetaDao.observe().map { it?.lastSuccessAt }

    private inline fun <reified T> cached(key: String): Flow<T?> =
        snapshotDao.observe(key).map { row -> row?.let { json.decodeFromString<T>(it.json) } }

    suspend fun refreshHome(month: YearMonth): Result<Unit> = guard {
        val start = JakartaDate.monthStart(month)
        val end = JakartaDate.monthEnd(month)
        val accounts = api.listAccounts()
        val categories = api.listCategories()
        val summary = api.getSummary(start, end)
        val previousMonth = month.minusMonths(1)
        val previous = api.getSummary(JakartaDate.monthStart(previousMonth), JakartaDate.monthEnd(previousMonth))
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
        val rows = fetchMonth(start, end)
        accountDao.replaceAll(accounts.map { it.toEntity() })
        categoryDao.replaceAll(categories.map { it.toEntity() })
        snapshotDao.upsert(RpcSnapshot(summaryKey(month), json.encodeToString(summary), clock()))
        snapshotDao.upsert(RpcSnapshot(previousSummaryKey(month), json.encodeToString(previous), clock()))
        snapshotDao.upsert(RpcSnapshot(breakdownKey(month), json.encodeToString(breakdown), clock()))
        transactionDao.replaceRange(start, end, rows)
    }

    suspend fun refreshAnalytics(month: YearMonth): Result<Unit> = guard {
        val start = JakartaDate.monthStart(month)
        val end = JakartaDate.monthEnd(month)
        val previous = month.minusMonths(1)
        val categories = api.listCategories()
        val comparison = api.getPeriodComparison(
            start,
            end,
            JakartaDate.monthStart(previous),
            JakartaDate.monthEnd(previous)
        )
        val trend = api.getMonthlyTrend(TREND_MONTHS)
        val savings = api.getSavingsRateTrend(TREND_MONTHS)
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
        val daily = api.getDailySpending(start, end)
        val top = api.getTopTransactions(start, end, TOP_LIMIT)
        val now = clock()
        categoryDao.replaceAll(categories.map { it.toEntity() })
        snapshotDao.upsertAll(
            listOf(
                RpcSnapshot(comparisonKey(month), json.encodeToString(comparison), now),
                RpcSnapshot(TREND_KEY, json.encodeToString(trend), now),
                RpcSnapshot(SAVINGS_KEY, json.encodeToString(savings), now),
                RpcSnapshot(breakdownKey(month), json.encodeToString(breakdown), now),
                RpcSnapshot(dailyKey(month), json.encodeToString(daily), now),
                RpcSnapshot(topKey(month), json.encodeToString(top), now)
            )
        )
    }

    suspend fun refreshTransactions(month: YearMonth): Result<Unit> = guard {
        val start = JakartaDate.monthStart(month)
        val end = JakartaDate.monthEnd(month)
        transactionDao.replaceRange(start, end, fetchMonth(start, end))
    }

    suspend fun refreshAccounts(): Result<Unit> = guard {
        accountDao.replaceAll(api.listAccounts().map { it.toEntity() })
    }

    suspend fun refreshCategories(): Result<Unit> = guard {
        categoryDao.replaceAll(api.listCategories().map { it.toEntity() })
    }

    suspend fun addEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: LocalDate,
        time: LocalTime
    ): Result<Unit> = write {
        api.recordManualEntry(account, type, amount, category, description, merchant, JakartaDate.toTimestamp(date, time))
        refreshHome(YearMonth.from(date))
    }

    suspend fun addTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: LocalDate,
        time: LocalTime
    ): Result<Unit> = write {
        api.recordManualTransfer(fromAccount, toAccount, amount, toAmount, description, JakartaDate.toTimestamp(date, time))
        refreshHome(YearMonth.from(date))
    }

    suspend fun logout(): Result<Unit> = write {
        if (write { api.signOut() }.isFailure) api.clearLocalSession()
        clearCache()
    }

    private suspend fun fetchMonth(start: String, end: String): List<TransactionEntity> {
        val rows = mutableListOf<TransactionDto>()
        var offset = 0
        while (true) {
            val page = api.listTransactions(start, end, PAGE_SIZE, offset)
            rows += page
            if (page.size < PAGE_SIZE) break
            offset += PAGE_SIZE
        }
        return rows.map { it.toEntity() }
    }

    private suspend fun clearCache() {
        transactionDao.deleteAll()
        accountDao.deleteAll()
        categoryDao.deleteAll()
        snapshotDao.deleteAll()
        syncMetaDao.deleteAll()
    }

    private suspend fun guard(block: suspend () -> Unit): Result<Unit> {
        val owner = api.currentSession()?.user?.id ?: return Result.failure(SyncError.Unauthorized)
        return write {
            val meta = syncMetaDao.observe().first()
            if (meta?.ownerId != owner) {
                clearCache()
                syncMetaDao.upsert(SyncMeta(ownerId = owner))
            }
            block()
            syncMetaDao.upsert(SyncMeta(lastSuccessAt = clock(), ownerId = owner))
        }
    }

    private suspend fun write(block: suspend () -> Unit): Result<Unit> = try {
        block()
        Result.success(Unit)
    } catch (e: IOException) {
        Result.failure(SyncError.Offline)
    } catch (e: UnauthorizedRestException) {
        Result.failure(SyncError.Unauthorized)
    } catch (e: RestException) {
        Result.failure(if (e.statusCode == 401) SyncError.Unauthorized else SyncError.Server(e))
    } catch (e: SerializationException) {
        Result.failure(SyncError.Server(e))
    }

    private fun summaryKey(month: YearMonth) = "get_summary:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun previousSummaryKey(month: YearMonth) =
        "get_summary_prev:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun breakdownKey(month: YearMonth) =
        "get_category_breakdown:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}:expense"

    private fun comparisonKey(month: YearMonth) =
        "get_period_comparison:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun dailyKey(month: YearMonth) =
        "get_daily_spending:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun topKey(month: YearMonth) =
        "get_top_transactions:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}:$TOP_LIMIT"

    private companion object {
        const val PAGE_SIZE = 1000
        const val TREND_MONTHS = 12
        const val TOP_LIMIT = 5
        const val TREND_KEY = "get_monthly_trend:$TREND_MONTHS"
        const val SAVINGS_KEY = "get_savings_rate_trend:$TREND_MONTHS"
    }
}
