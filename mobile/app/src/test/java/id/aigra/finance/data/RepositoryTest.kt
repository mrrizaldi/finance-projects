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
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth

class FakeApi : SupabaseApi {
    var failWithIo = false
    var accounts = listOf(AccountDto("a1", "BCA", "bank", 1000.0, "#000000", true))
    var categories = listOf(CategoryDto("c1", "Makan", "expense", "#ff0000", 500000.0, 0, true))
    val transactions = mutableListOf<TransactionDto>()
    val entries = mutableListOf<String>()
    var listAccountCalls = 0

    override val sessionStatus = MutableStateFlow<SessionStatus>(SessionStatus.NotAuthenticated())

    private fun gate() {
        if (failWithIo) throw IOException("offline")
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
        return transactions.drop(offset).take(limit)
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
        api.failWithIo = true

        val result = repo.refreshHome(month)

        assertTrue(result.isFailure)
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
    fun `pencarian dan filter tipe jalan di cache`() = runTest {
        transactionDao.insertAll(
            listOf(
                TransactionEntity("t1", "expense", 1, "2026-10-01T05:00:00+00:00", "2026-10-01", description = "Kopi pagi"),
                TransactionEntity("t2", "income", 1, "2026-10-01T06:00:00+00:00", "2026-10-01", merchant = "Kantor")
            )
        )
        assertEquals(listOf("t1"), repo.transactions(TxFilter(month, search = "kopi")).first().map { it.id })
        assertEquals(listOf("t2"), repo.transactions(TxFilter(month, type = "income")).first().map { it.id })
    }
}
