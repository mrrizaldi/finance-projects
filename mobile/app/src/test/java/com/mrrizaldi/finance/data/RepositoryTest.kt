package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.AccountDao
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryDao
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.Outbox
import com.mrrizaldi.finance.data.local.OutboxDao
import com.mrrizaldi.finance.data.local.RpcSnapshot
import com.mrrizaldi.finance.data.local.SnapshotDao
import com.mrrizaldi.finance.data.local.SyncMeta
import com.mrrizaldi.finance.data.local.SyncMetaDao
import com.mrrizaldi.finance.data.local.TransactionDao
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.AccountDto
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import com.mrrizaldi.finance.data.remote.CategoryDto
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import com.mrrizaldi.finance.data.remote.TopTransactionDto
import com.mrrizaldi.finance.data.remote.TransactionDto
import com.mrrizaldi.finance.util.JakartaDate
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserInfo
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth

fun sessionFor(userId: String) = UserSession(
    accessToken = "token-$userId",
    refreshToken = "refresh-$userId",
    expiresIn = 3600,
    tokenType = "bearer",
    user = UserInfo(aud = "authenticated", id = userId)
)

class FakeApi : SupabaseApi {
    var session: UserSession? = sessionFor("u1")
    var failFrom = 0
    var failure: Exception = IOException("offline")
    var calls = 0
    var accounts = listOf(AccountDto("a1", "BCA", "bank", 1000.0, "#000000", true))
    var categories = listOf(CategoryDto("c1", "Makan", "expense", "#ff0000", 500000.0, 0, true))
    val transactions = mutableListOf<TransactionDto>()
    val entries = mutableListOf<String>()
    var listAccountCalls = 0

    override val sessionStatus = MutableStateFlow<SessionStatus>(SessionStatus.NotAuthenticated())

    override fun currentSession(): UserSession? = session

    private fun gate() {
        calls++
        if (failFrom in 1..calls) throw failure
    }

    override suspend fun signIn(email: String, password: String) {}
    var signOutFailure: Exception? = null

    override suspend fun signOut() {
        signOutFailure?.let { throw it }
        session = null
    }

    override suspend fun clearLocalSession() {
        session = null
    }

    override suspend fun listAccounts(): List<AccountDto> {
        gate()
        listAccountCalls++
        return accounts
    }

    override suspend fun listCategories(): List<CategoryDto> {
        gate()
        return categories
    }

    override suspend fun listTransactions(start: String, end: String, limit: Int, offset: Int): List<TransactionDto> {
        gate()
        return transactions.filter { JakartaDate.dateKey(it.transaction_date) in start..end }.drop(offset).take(limit)
    }

    override suspend fun getSummary(start: String, end: String): SummaryDto {
        gate()
        return SummaryDto(0.0, 0.0, 0.0, 0, 0.0, "-", 0.0)
    }

    override suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto> {
        gate()
        return emptyList()
    }

    val analyticsCalls = mutableListOf<String>()

    override suspend fun getPeriodComparison(
        start: String,
        end: String,
        prevStart: String,
        prevEnd: String
    ): PeriodComparisonDto {
        gate()
        analyticsCalls += "get_period_comparison:$start:$end:$prevStart:$prevEnd"
        return PeriodComparisonDto(
            curr_income = 4_000_000.0,
            curr_expense = 1_500_000.0,
            curr_net = 2_500_000.0,
            curr_tx_count = 20,
            curr_avg_daily = 48_387.0,
            prev_income = 3_000_000.0,
            prev_expense = 2_000_000.0,
            prev_net = 1_000_000.0,
            prev_tx_count = 25,
            prev_avg_daily = 66_667.0
        )
    }

    private fun window(months: Int): List<YearMonth> =
        (months - 1 downTo 0).map { YearMonth.of(2026, 10).minusMonths(it.toLong()) }

    override suspend fun getMonthlyTrend(months: Int): List<MonthlyTrendDto> {
        gate()
        analyticsCalls += "get_monthly_trend:$months"
        return window(months).map { MonthlyTrendDto(it.toString(), "$it-01", 1_000_000.0, 800_000.0, 200_000.0) }
    }

    override suspend fun getSavingsRateTrend(months: Int): List<SavingsRateDto> {
        gate()
        analyticsCalls += "get_savings_rate_trend:$months"
        return window(months).map { SavingsRateDto(it.toString(), "$it-01", 1_000_000.0, 800_000.0, 20.0, 0.0, 0.0) }
    }

    override suspend fun getDailySpending(start: String, end: String): List<DailySpendingDto> {
        gate()
        analyticsCalls += "get_daily_spending:$start:$end"
        val last = LocalDate.parse(end)
        return generateSequence(LocalDate.parse(start)) { it.plusDays(1) }
            .takeWhile { it <= last }
            .map { DailySpendingDto(it.toString(), 0.0, 0.0) }
            .toList()
    }

    override suspend fun getTopTransactions(start: String, end: String, limit: Int): List<TopTransactionDto> {
        gate()
        analyticsCalls += "get_top_transactions:$start:$end:$limit"
        return listOf(
            TopTransactionDto(
                id = "top1",
                amount = 250_000.0,
                transaction_date = "2026-10-13T05:00:00+00:00",
                description = "Sepatu",
                category_name = "Belanja"
            )
        ).take(limit)
    }

    val clientIds = mutableListOf<String>()
    var rejectClientIds = setOf<String>()
    var loseNextResponse = false
    private val byClient = mutableMapOf<String, String>()

    private fun acceptOnce(clientId: String): String? {
        if (clientId in rejectClientIds) throw IllegalArgumentException("Akun tidak ditemukan")
        return byClient[clientId]
    }

    private fun answer(clientId: String, id: String): String {
        clientIds += clientId
        byClient[clientId] = id
        if (loseNextResponse) {
            loseNextResponse = false
            throw IOException("respon hilang")
        }
        return id
    }

    override suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String,
        clientId: String
    ): String {
        gate()
        acceptOnce(clientId)?.let { return it }
        val id = "tx${entries.size + 1}"
        entries += id
        transactions += TransactionDto(
            id = id,
            type = type,
            amount = amount.toDouble(),
            transaction_date = date,
            account_id = account,
            category_id = category,
            description = description,
            merchant = merchant
        )
        return answer(clientId, id)
    }

    override suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String,
        clientId: String
    ): String {
        gate()
        acceptOnce(clientId)?.let { return it }
        val id = "tr${entries.size + 1}"
        entries += id
        transactions += TransactionDto(
            id = id,
            type = "transfer",
            amount = amount.toDouble(),
            transaction_date = date,
            to_amount = toAmount?.toDouble(),
            account_id = fromAccount,
            to_account_id = toAccount,
            description = description
        )
        return answer(clientId, id)
    }
}

class FakeAccountDao : AccountDao {
    val data = MutableStateFlow<List<AccountEntity>>(emptyList())
    override fun observeActive(): Flow<List<AccountEntity>> =
        data.map { list -> list.filter { it.isActive }.sortedByDescending { it.balance } }
    override suspend fun deleteAll() { data.value = emptyList() }
    override suspend fun insertAll(rows: List<AccountEntity>) {
        data.update { old -> (old.associateBy { it.id } + rows.associateBy { it.id }).values.toList() }
    }
}

class FakeCategoryDao : CategoryDao {
    val data = MutableStateFlow<List<CategoryEntity>>(emptyList())
    override fun observeActive(): Flow<List<CategoryEntity>> =
        data.map { list -> list.filter { it.isActive }.sortedBy { it.sortOrder } }
    override suspend fun deleteAll() { data.value = emptyList() }
    override suspend fun insertAll(rows: List<CategoryEntity>) {
        data.update { old -> (old.associateBy { it.id } + rows.associateBy { it.id }).values.toList() }
    }
}

class FakeTransactionDao : TransactionDao {
    val data = MutableStateFlow<List<TransactionEntity>>(emptyList())
    override fun observe(
        start: String,
        end: String,
        type: String?,
        accountId: String?,
        categoryId: String?,
        search: String?
    ): Flow<List<TransactionEntity>> = data.map { list ->
        list.filter { it.dateKey in start..end }
            .filter { type == null || it.type == type }
            .filter { accountId == null || it.accountId == accountId || it.toAccountId == accountId }
            .filter { categoryId == null || it.categoryId == categoryId }
            .filter {
                search == null ||
                    (it.description?.contains(search, ignoreCase = true) == true) ||
                    (it.merchant?.contains(search, ignoreCase = true) == true)
            }
            .sortedByDescending { it.transactionDate }
    }
    override fun observeRecent(limit: Int): Flow<List<TransactionEntity>> =
        data.map { list -> list.sortedByDescending { it.transactionDate }.take(limit) }
    override suspend fun deleteRange(start: String, end: String) {
        data.update { list -> list.filterNot { it.dateKey in start..end && !it.pending } }
    }
    override suspend fun deleteSynced() { data.update { list -> list.filter { it.pending } } }
    override suspend fun deleteById(id: String) { data.update { list -> list.filterNot { it.id == id } } }
    override suspend fun markSynced(id: String) {
        data.update { list -> list.map { if (it.id == id) it.copy(pending = false) else it } }
    }
    override suspend fun insertAll(rows: List<TransactionEntity>) {
        data.update { old -> (old.associateBy { it.id } + rows.associateBy { it.id }).values.toList() }
    }
}

class FakeSnapshotDao : SnapshotDao {
    val data = MutableStateFlow<Map<String, RpcSnapshot>>(emptyMap())
    override fun observe(key: String): Flow<RpcSnapshot?> = data.map { it[key] }
    override suspend fun upsert(row: RpcSnapshot) { data.update { it + (row.key to row) } }
    override suspend fun upsertAll(rows: List<RpcSnapshot>) { data.update { it + rows.associateBy { r -> r.key } } }
    override suspend fun deleteAll() { data.value = emptyMap() }
}

class FakeSyncMetaDao : SyncMetaDao {
    val data = MutableStateFlow<SyncMeta?>(null)
    override fun observe(): Flow<SyncMeta?> = data
    override suspend fun upsert(row: SyncMeta) { data.value = row }
    override suspend fun deleteAll() { data.value = null }
}

class FakeOutboxDao : OutboxDao {
    val data = MutableStateFlow<List<Outbox>>(emptyList())
    override suspend fun insert(row: Outbox) { data.update { it + row } }
    override suspend fun nextSendable(owner: String): Outbox? =
        data.value.filter { it.ownerId == owner && it.lastError == null }.minByOrNull { it.createdAt }
    override suspend fun get(clientId: String): Outbox? = data.value.firstOrNull { it.clientId == clientId }
    override fun observe(owner: String): Flow<List<Outbox>> =
        data.map { list -> list.filter { it.ownerId == owner }.sortedBy { it.createdAt } }
    override suspend fun markAttempt(clientId: String, error: String?) {
        data.update { list ->
            list.map { if (it.clientId == clientId) it.copy(attempts = it.attempts + 1, lastError = error) else it }
        }
    }
    override suspend fun clearError(clientId: String) {
        data.update { list -> list.map { if (it.clientId == clientId) it.copy(lastError = null) else it } }
    }
    override suspend fun delete(clientId: String) { data.update { list -> list.filterNot { it.clientId == clientId } } }
}

class RepositoryTest {
    private val api = FakeApi()
    private val accountDao = FakeAccountDao()
    private val categoryDao = FakeCategoryDao()
    private val transactionDao = FakeTransactionDao()
    private val snapshotDao = FakeSnapshotDao()
    private val syncMetaDao = FakeSyncMetaDao()
    private val repo = Repository(api, accountDao, categoryDao, transactionDao, snapshotDao, syncMetaDao, FakeOutboxDao()) { 1_000L }
    private val month = YearMonth.of(2026, 10)

    @Test
    fun `refresh gagal tidak mengosongkan cache`() = runTest {
        val cached = TransactionEntity(
            id = "old",
            type = "expense",
            amount = 10_000,
            transactionDate = "2026-10-02T05:00:00+00:00",
            dateKey = "2026-10-02",
            description = "Kopi"
        )
        transactionDao.insertAll(listOf(cached))
        accountDao.insertAll(listOf(AccountEntity("a1", "BCA", "bank", 5_000, null, true)))
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = null, ownerId = "u1"))
        api.failFrom = 1

        val result = repo.refreshHome(month)

        assertTrue(result.exceptionOrNull() is SyncError.Offline)
        assertEquals(listOf(cached), repo.transactions(TxFilter(month)).first())
        assertEquals(5_000L, repo.accounts().first().single().balance)
        assertNull(repo.lastSuccessAt().first())
    }

    @Test
    fun `entry sukses memicu refresh`() = runTest {
        val result = repo.addEntry(
            account = "a1",
            type = "expense",
            amount = 25_000,
            category = "c1",
            description = "Kopi",
            merchant = null,
            date = LocalDate.of(2026, 10, 16),
            time = LocalTime.of(9, 30)
        )

        assertEquals(SaveStatus.SENT, result.getOrNull())
        assertEquals(listOf("tx1"), api.entries)
        assertEquals(1, api.listAccountCalls)
        val tx = repo.transactions(TxFilter(month)).first().single()
        assertEquals("tx1", tx.id)
        assertEquals(25_000L, tx.amount)
        assertEquals("2026-10-16", tx.dateKey)
        assertEquals(1_000L, repo.accounts().first().single().balance)
        assertEquals(1_000L, repo.lastSuccessAt().first())
    }

    @Test
    fun `tanpa sesi refresh ditolak dan cache utuh`() = runTest {
        val cached = TransactionEntity("old", "expense", 10_000, "2026-10-02T05:00:00+00:00", "2026-10-02")
        transactionDao.insertAll(listOf(cached))
        accountDao.insertAll(listOf(AccountEntity("a1", "BCA", "bank", 5_000, null, true)))
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = 500L, ownerId = "u1"))
        api.session = null

        val result = repo.refreshHome(month)

        assertTrue(result.exceptionOrNull() is SyncError.Unauthorized)
        assertEquals(0, api.calls)
        assertEquals(listOf(cached), transactionDao.data.value)
        assertEquals(5_000L, accountDao.data.value.single().balance)
        assertEquals(500L, repo.lastSuccessAt().first())
    }

    @Test
    fun `gagal di tengah refresh gak geser lastSuccessAt`() = runTest {
        accountDao.insertAll(listOf(AccountEntity("a1", "BCA", "bank", 5_000, null, true)))
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = 500L, ownerId = "u1"))
        api.failFrom = 2
        api.failure = SerializationException("json rusak")

        val result = repo.refreshHome(month)

        assertTrue(result.exceptionOrNull() is SyncError.Server)
        assertEquals(5_000L, accountDao.data.value.single().balance)
        assertEquals(500L, repo.lastSuccessAt().first())
    }

    @Test
    fun `ganti user mengosongkan cache sebelum nulis`() = runTest {
        transactionDao.insertAll(
            listOf(TransactionEntity("punya-lama", "expense", 1, "2026-09-02T05:00:00+00:00", "2026-09-02"))
        )
        accountDao.insertAll(listOf(AccountEntity("a-lama", "Lama", "bank", 9, null, true)))
        snapshotDao.upsert(RpcSnapshot("get_summary:2026-09-01:2026-09-30", "{}", 1L))
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = 500L, ownerId = "u-lama"))

        val result = repo.refreshHome(month)

        assertTrue(result.isSuccess)
        assertTrue(transactionDao.data.value.none { it.id == "punya-lama" })
        assertEquals(listOf("a1"), accountDao.data.value.map { it.id })
        assertFalse(snapshotDao.data.value.containsKey("get_summary:2026-09-01:2026-09-30"))
        assertEquals("u1", syncMetaDao.data.value?.ownerId)
        assertEquals(1_000L, repo.lastSuccessAt().first())
    }

    @Test
    fun `refresh bulan lain gak buang cache bulan pertama`() = runTest {
        api.transactions += TransactionDto("okt", "expense", 1.0, "2026-10-10T05:00:00+00:00")
        api.transactions += TransactionDto("nov", "expense", 1.0, "2026-11-10T05:00:00+00:00")

        assertTrue(repo.refreshTransactions(month).isSuccess)
        assertTrue(repo.refreshTransactions(month.plusMonths(1)).isSuccess)

        assertEquals(listOf("nov", "okt"), transactionDao.data.value.map { it.id }.sorted())
    }

    @Test
    fun `logout offline tetap hapus sesi lokal dan cache`() = runTest {
        transactionDao.insertAll(listOf(TransactionEntity("t1", "expense", 1, "2026-10-01T05:00:00+00:00", "2026-10-01")))
        accountDao.insertAll(listOf(AccountEntity("a1", "BCA", "bank", 5_000, null, true)))
        snapshotDao.upsert(RpcSnapshot("k", "{}", 1L))
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = 500L, ownerId = "u1"))
        api.signOutFailure = IOException("offline")

        val result = repo.logout()

        assertTrue(result.isSuccess)
        assertNull(api.currentSession())
        assertTrue(transactionDao.data.value.isEmpty())
        assertTrue(accountDao.data.value.isEmpty())
        assertTrue(snapshotDao.data.value.isEmpty())
        assertNull(syncMetaDao.data.value)
    }

    @Test
    fun `cuma refresh sukses yang nyegerin widget`() = runTest {
        var updates = 0
        val withWidget = Repository(
            api, accountDao, categoryDao, transactionDao, snapshotDao, syncMetaDao, FakeOutboxDao(),
            onRefreshed = { updates++ }
        ) { 1_000L }

        assertTrue(withWidget.refreshHome(month).isSuccess)
        assertEquals(1, updates)

        api.failFrom = api.calls + 1
        assertTrue(withWidget.refreshHome(month).isFailure)
        assertEquals(1, updates)
    }

    @Test
    fun `escapeLike bikin persen garis bawah backslash jadi literal`() {
        assertEquals("50\\% off\\_x\\\\y", escapeLike("50% off_x\\y"))
        assertEquals("indomaret", escapeLike("indomaret"))
    }
}
