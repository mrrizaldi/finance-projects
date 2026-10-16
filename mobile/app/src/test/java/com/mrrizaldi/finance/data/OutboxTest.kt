package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.Outbox
import com.mrrizaldi.finance.data.local.OutboxKind
import com.mrrizaldi.finance.data.local.TransactionEntity
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime

class OutboxTest {
    private val api = FakeApi()
    private val transactionDao = FakeTransactionDao()
    private val outboxDao = FakeOutboxDao()
    private var now = 1_000L
    private var ids = 0
    private var flushes = 0
    private val repo = Repository(
        api,
        FakeAccountDao(),
        FakeCategoryDao(),
        transactionDao,
        FakeSnapshotDao(),
        FakeSyncMetaDao(),
        outboxDao,
        scheduleFlush = { flushes++ },
        newId = { "c${++ids}" }
    ) { now++ }
    private val day = LocalDate.of(2026, 10, 16)

    private suspend fun expense(amount: Long, description: String) =
        repo.addEntry("a1", "expense", amount, "c1", description, null, day, LocalTime.of(9, 30))

    @Test
    fun `online langsung terkirim pakai client id dan antrean kosong`() = runTest {
        val result = expense(25_000, "Kopi")

        assertEquals(SaveStatus.SENT, result.getOrNull())
        assertEquals(listOf("c1"), api.clientIds)
        assertTrue(outboxDao.data.value.isEmpty())
        assertEquals(listOf("tx1"), transactionDao.data.value.map { it.id })
        assertEquals(0, flushes)
    }

    @Test
    fun `offline masuk antrean lalu dikirim urut createdAt`() = runTest {
        api.failFrom = 1
        assertEquals(SaveStatus.QUEUED, expense(1_000, "Satu").getOrNull())
        assertEquals(SaveStatus.QUEUED, expense(2_000, "Dua").getOrNull())
        assertEquals(2, flushes)
        assertEquals(listOf("c1", "c2"), transactionDao.data.value.filter { it.pending }.map { it.id }.sorted())

        api.failFrom = 0
        assertEquals(FlushResult.DONE, repo.flushOutbox())

        assertEquals(listOf("c1", "c2"), api.clientIds)
        assertTrue(outboxDao.data.value.isEmpty())
        assertEquals(listOf("tx1", "tx2"), transactionDao.data.value.map { it.id }.sorted())
    }

    @Test
    fun `respon hilang setelah server simpan - kirim ulang gak dobel`() = runTest {
        api.loseNextResponse = true
        assertEquals(SaveStatus.QUEUED, expense(5_000, "Parkir").getOrNull())

        assertEquals(FlushResult.DONE, repo.flushOutbox())

        assertEquals(1, api.entries.size)
        assertEquals(1, api.transactions.size)
        assertTrue(outboxDao.data.value.isEmpty())
    }

    @Test
    fun `ditolak saat replay - baris tetap dengan pesan, baris lain jalan, coba lagi berhasil`() = runTest {
        api.failFrom = 1
        expense(1_000, "Satu")
        expense(2_000, "Dua")
        api.failFrom = 0
        api.rejectClientIds = setOf("c1")

        assertEquals(FlushResult.DONE, repo.flushOutbox())

        assertEquals(listOf("c2"), api.clientIds)
        val left = outboxDao.data.value.single()
        assertEquals("c1", left.clientId)
        assertEquals("Akun tidak ditemukan", left.lastError)
        assertEquals(3, left.attempts)

        api.rejectClientIds = emptySet()
        repo.retry("c1")

        assertEquals(listOf("c2", "c1"), api.clientIds)
        assertTrue(outboxDao.data.value.isEmpty())
    }

    @Test
    fun `ditolak saat simpan online - dibuang dan pesan aman dikembalikan`() = runTest {
        api.rejectClientIds = setOf("c1")

        val result = expense(1_000, "Salah akun")

        assertTrue(result.exceptionOrNull() is SyncError.Server)
        assertEquals("Akun tidak ditemukan", result.exceptionOrNull()?.message)
        assertTrue(outboxDao.data.value.isEmpty())
        assertTrue(transactionDao.data.value.isEmpty())
    }

    @Test
    fun `hapus tertunda buang antrean dan baris pending`() = runTest {
        api.failFrom = 1
        expense(1_000, "Batal")

        repo.discard("c1")

        assertTrue(outboxDao.data.value.isEmpty())
        assertTrue(transactionDao.data.value.isEmpty())
    }

    @Test
    fun `logout tetap simpan antrean dan baris pending`() = runTest {
        api.failFrom = 1
        expense(1_000, "Nunggu")
        transactionDao.insertAll(listOf(TransactionEntity("lama", "expense", 1, "2026-10-01T05:00:00+00:00", "2026-10-01")))

        repo.logout()

        assertEquals(listOf("c1"), outboxDao.data.value.map { it.clientId })
        assertEquals(listOf("c1"), transactionDao.data.value.map { it.id })
    }

    @Test
    fun `antrean user lain gak dikirim`() = runTest {
        outboxDao.insert(
            Outbox(
                clientId = "x1",
                ownerId = "u2",
                kind = OutboxKind.ENTRY,
                payloadJson = """{"account":"a9","type":"expense","amount":1,"category":null,"description":null,"merchant":null,"date":"2026-10-16T09:30:00+07:00"}""",
                createdAt = 1L
            )
        )

        assertEquals(FlushResult.DONE, repo.flushOutbox())

        assertTrue(api.clientIds.isEmpty())
        assertEquals(1, outboxDao.data.value.size)
    }

    @Test
    fun `transfer offline lalu terkirim sekali`() = runTest {
        api.failFrom = 1
        val result = repo.addTransfer("a1", "a2", 50_000, null, "Pindah", day, LocalTime.of(10, 0))
        assertEquals(SaveStatus.QUEUED, result.getOrNull())
        assertEquals("transfer", transactionDao.data.value.single().type)

        api.failFrom = 0
        repo.flushOutbox()

        assertEquals(listOf("c1"), api.clientIds)
        assertTrue(outboxDao.data.value.isEmpty())
    }

    @Test
    fun `aturan kirim ulang dan teks error`() {
        assertTrue(listOf(401, 408, 429, 500, 503).all(::retryableStatus))
        assertFalse(listOf(400, 403, 404, 409, 422).any(::retryableStatus))
        assertTrue(retryable(IOException("x")))
        assertFalse(retryable(SerializationException("x")))
        assertFalse(retryable(IllegalArgumentException("x")))
        assertEquals("x", errorText(IllegalArgumentException("x")))
    }
}
