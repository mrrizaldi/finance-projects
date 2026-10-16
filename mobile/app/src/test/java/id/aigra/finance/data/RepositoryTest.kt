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
import id.aigra.finance.data.remote.AccountDto
import id.aigra.finance.data.remote.CategoryBreakdownDto
import id.aigra.finance.data.remote.CategoryDto
import id.aigra.finance.data.remote.SummaryDto
import id.aigra.finance.data.remote.SupabaseApi
import id.aigra.finance.data.remote.TransactionDto
import id.aigra.finance.util.JakartaDate
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
    override suspend fun signOut() {}

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

    override suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    ): String {
        gate()
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
        return id
    }

    override suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String
    ): String {
        gate()
        return "tr1"
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
    override suspend fun deleteAll() { data.value = emptyList() }
    override suspend fun insertAll(rows: List<TransactionEntity>) {
        data.update { old -> (old.associateBy { it.id } + rows.associateBy { it.id }).values.toList() }
    }
}

class FakeSnapshotDao : SnapshotDao {
    val data = MutableStateFlow<Map<String, RpcSnapshot>>(emptyMap())
    override fun observe(key: String): Flow<RpcSnapshot?> = data.map { it[key] }
    override suspend fun upsert(row: RpcSnapshot) { data.update { it + (row.key to row) } }
    override suspend fun deleteAll() { data.value = emptyMap() }
}

class FakeSyncMetaDao : SyncMetaDao {
    val data = MutableStateFlow<SyncMeta?>(null)
    override fun observe(): Flow<SyncMeta?> = data
    override suspend fun upsert(row: SyncMeta) { data.value = row }
    override suspend fun deleteAll() { data.value = null }
}

class RepositoryTest {
    private val api = FakeApi()
    private val accountDao = FakeAccountDao()
    private val categoryDao = FakeCategoryDao()
    private val transactionDao = FakeTransactionDao()
    private val snapshotDao = FakeSnapshotDao()
    private val syncMetaDao = FakeSyncMetaDao()
    private val repo = Repository(api, accountDao, categoryDao, transactionDao, snapshotDao, syncMetaDao) { 1_000L }
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

        assertTrue(result.isSuccess)
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
}
