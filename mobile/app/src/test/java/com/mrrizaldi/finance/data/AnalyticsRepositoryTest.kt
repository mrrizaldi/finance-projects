package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.RpcSnapshot
import com.mrrizaldi.finance.data.local.SyncMeta
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.YearMonth

class AnalyticsRepositoryTest {
    private val api = FakeApi()
    private val categoryDao = FakeCategoryDao()
    private val snapshotDao = FakeSnapshotDao()
    private val syncMetaDao = FakeSyncMetaDao()
    private val repo = Repository(
        api,
        FakeAccountDao(),
        categoryDao,
        FakeTransactionDao(),
        snapshotDao,
        syncMetaDao
    ) { 1_000L }
    private val month = YearMonth.of(2026, 10)

    @Test
    fun `refreshAnalytics pakai tanggal jakarta lalu nyimpen semua`() = runTest {
        assertTrue(repo.refreshAnalytics(month).isSuccess)

        assertEquals(
            listOf(
                "get_period_comparison:2026-10-01:2026-10-31:2026-09-01:2026-09-30",
                "get_monthly_trend:12",
                "get_savings_rate_trend:12",
                "get_daily_spending:2026-10-01:2026-10-31",
                "get_top_transactions:2026-10-01:2026-10-31:5"
            ),
            api.analyticsCalls
        )
        assertEquals(4_000_000.0, repo.periodComparison(month).first()?.curr_income ?: 0.0, 0.0)
        assertEquals(12, repo.monthlyTrend().first().size)
        assertEquals(12, repo.savingsRateTrend().first().size)
        assertEquals(31, repo.dailySpending(month).first().size)
        val top = repo.topTransactions(month).first().single()
        assertEquals("top1", top.id)
        assertEquals("2026-10-13", top.toEntity().dateKey)
        assertEquals(250_000L, top.toEntity().amount)
        assertEquals(listOf("c1"), repo.categories().first().map { it.id })
        assertEquals(1_000L, repo.lastSuccessAt().first())
    }

    @Test
    fun `gagal di tengah refreshAnalytics cache utuh`() = runTest {
        snapshotDao.upsert(RpcSnapshot("get_monthly_trend:12", "[]", 1L))
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = 500L, ownerId = "u1"))
        api.failFrom = 4

        val result = repo.refreshAnalytics(month)

        assertTrue(result.exceptionOrNull() is SyncError.Offline)
        assertEquals(setOf("get_monthly_trend:12"), snapshotDao.data.value.keys)
        assertTrue(categoryDao.data.value.isEmpty())
        assertEquals(500L, repo.lastSuccessAt().first())
    }

    @Test
    fun `tanpa cache flow analytics kosong`() = runTest {
        assertNull(repo.periodComparison(month).first())
        assertTrue(repo.monthlyTrend().first().isEmpty())
        assertTrue(repo.savingsRateTrend().first().isEmpty())
        assertTrue(repo.dailySpending(month).first().isEmpty())
        assertTrue(repo.topTransactions(month).first().isEmpty())
    }
}
