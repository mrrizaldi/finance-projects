package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.TransactionDto
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

class EditDeleteTest {
    private val api = FakeApi()
    private val transactionDao = FakeTransactionDao()
    private val repo = Repository(
        api, FakeAccountDao(), FakeCategoryDao(), transactionDao, FakeSnapshotDao(), FakeSyncMetaDao(), FakeOutboxDao()
    ) { 1_000L }
    private val cached = TransactionEntity(
        id = "tx1",
        type = "expense",
        amount = 1_000,
        transactionDate = "2026-10-16T02:30:00+00:00",
        dateKey = "2026-10-16",
        description = "tes",
        accountId = "a1"
    )

    private suspend fun seed() {
        transactionDao.insertAll(listOf(cached))
        api.transactions += TransactionDto("tx1", "expense", 1_000.0, "2026-10-16T02:30:00+00:00", account_id = "a1", description = "tes")
    }

    private suspend fun update(amount: Long = 2_000, description: String = "tes ubah") = repo.updateTransaction(
        id = "tx1",
        type = "expense",
        amount = amount,
        account = "a1",
        toAccount = null,
        toAmount = null,
        category = "c1",
        description = description,
        merchant = null,
        date = LocalDate.of(2026, 10, 16),
        time = LocalTime.of(9, 30)
    )

    @Test
    fun `update sukses - rpc dipanggil, cache diperbarui, refresh jalan`() = runTest {
        seed()

        val result = update()

        assertTrue(result.isSuccess)
        val call = api.updates.single()
        assertEquals("tx1", call[0])
        assertEquals(2_000L, call[2])
        assertEquals("2026-10-16T09:30:00+07:00", call[9])
        val row = transactionDao.data.value.single()
        assertEquals(2_000L, row.amount)
        assertEquals("tes ubah", row.description)
        assertEquals("2026-10-16", row.dateKey)
        assertEquals(1, api.listAccountCalls)
    }

    @Test
    fun `update offline - gagal Offline, cache utuh`() = runTest {
        seed()
        api.failFrom = 1

        val result = update()

        assertTrue(result.exceptionOrNull() is SyncError.Offline)
        assertTrue(api.updates.isEmpty())
        assertEquals(listOf(cached), transactionDao.data.value)
    }

    @Test
    fun `update ditolak server - pesan server, cache utuh`() = runTest {
        seed()
        api.failFrom = 1
        api.failure = SerializationException("Akun tidak ditemukan")

        val result = update()

        assertEquals("Akun tidak ditemukan", (result.exceptionOrNull() as SyncError.Server).message)
        assertEquals(listOf(cached), transactionDao.data.value)
    }

    @Test
    fun `delete sukses - baris hilang dari cache, refresh jalan`() = runTest {
        seed()

        val result = repo.deleteTransaction("tx1")

        assertTrue(result.isSuccess)
        assertEquals(listOf("tx1"), api.deletes)
        assertTrue(transactionDao.data.value.isEmpty())
        assertEquals(1, api.listAccountCalls)
    }

    @Test
    fun `delete offline - baris tetap`() = runTest {
        seed()
        api.failFrom = 1

        val result = repo.deleteTransaction("tx1")

        assertTrue(result.exceptionOrNull() is SyncError.Offline)
        assertEquals(listOf(cached), transactionDao.data.value)
    }
}
