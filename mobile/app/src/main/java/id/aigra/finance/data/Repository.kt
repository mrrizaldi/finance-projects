package id.aigra.finance.data

import id.aigra.finance.data.local.AccountDao
import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryDao
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.RpcSnapshot
import id.aigra.finance.data.local.SnapshotDao
import id.aigra.finance.data.local.SyncMeta
import id.aigra.finance.data.local.SyncMetaDao
import id.aigra.finance.data.local.TransactionDao
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.data.remote.CategoryBreakdownDto
import id.aigra.finance.data.remote.SummaryDto
import id.aigra.finance.data.remote.SupabaseApi
import id.aigra.finance.data.remote.TransactionDto
import id.aigra.finance.util.JakartaDate
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

    fun lastSuccessAt(): Flow<Long?> = syncMetaDao.observe().map { it?.lastSuccessAt }

    suspend fun refreshHome(month: YearMonth): Result<Unit> = guard {
        val start = JakartaDate.monthStart(month)
        val end = JakartaDate.monthEnd(month)
        val accounts = api.listAccounts()
        val categories = api.listCategories()
        val summary = api.getSummary(start, end)
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
        val rows = fetchMonth(start, end)
        accountDao.replaceAll(accounts.map { it.toEntity() })
        categoryDao.replaceAll(categories.map { it.toEntity() })
        snapshotDao.upsert(RpcSnapshot(summaryKey(month), json.encodeToString(summary), clock()))
        snapshotDao.upsert(RpcSnapshot(breakdownKey(month), json.encodeToString(breakdown), clock()))
        transactionDao.replaceRange(start, end, rows)
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

    private fun breakdownKey(month: YearMonth) =
        "get_category_breakdown:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}:expense"

    private companion object {
        const val PAGE_SIZE = 1000
    }
}
