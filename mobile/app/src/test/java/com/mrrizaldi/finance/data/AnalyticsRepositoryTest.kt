package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.RpcSnapshot
import com.mrrizaldi.finance.data.local.SyncMeta
import com.mrrizaldi.finance.util.AnalyticsPeriod
import com.mrrizaldi.finance.util.periodBounds
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

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
    private val bounds = periodBounds(AnalyticsPeriod.MONTH, LocalDate.of(2026, 10, 16))

    @Test
    fun `refreshAnalytics pakai tanggal jakarta lalu nyimpen semua`() = runTest {
        assertTrue(repo.refreshAnalytics(bounds).isSuccess)

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
        assertTrue(
            snapshotDao.data.value.keys.containsAll(
                listOf(
                    "get_period_comparison:month:2026-10-01:2026-10-31",
                    "get_monthly_trend:12",
                    "get_savings_rate_trend:12",
                    "get_category_breakdown:month:2026-10-01:2026-10-31",
                    "get_daily_spending:month:2026-10-01:2026-10-31",
                    "get_top_transactions:month:2026-10-01:2026-10-31"
                )
            )
        )
        assertEquals(4_000_000.0, repo.periodComparison(bounds).first()?.curr_income ?: 0.0, 0.0)
        assertEquals(12, repo.monthlyTrend(12).first().size)
        assertEquals(12, repo.savingsRateTrend(12).first().size)
        assertEquals(31, repo.dailySpending(bounds).first().size)
        val top = repo.topTransactions(bounds).first().single()
        assertEquals("top1", top.id)
        assertEquals("2026-10-13", top.toEntity().dateKey)
        assertEquals(250_000L, top.toEntity().amount)
        assertEquals(listOf("c1"), repo.categories().first().map { it.id })
        assertEquals(1_000L, repo.lastSuccessAt().first())
    }

    @Test
    fun `periode mingguan pakai rentang senin minggu dan tren 8 bulan`() = runTest {
        val week = periodBounds(AnalyticsPeriod.WEEK, LocalDate.of(2026, 10, 1))

        assertTrue(repo.refreshAnalytics(week).isSuccess)

        assertEquals(
            listOf(
                "get_period_comparison:2026-09-28:2026-10-04:2026-09-21:2026-09-27",
                "get_monthly_trend:8",
                "get_savings_rate_trend:8",
                "get_daily_spending:2026-09-28:2026-10-04",
                "get_top_transactions:2026-09-28:2026-10-04:5"
            ),
            api.analyticsCalls
        )
        assertTrue("get_daily_spending:week:2026-09-28:2026-10-04" in snapshotDao.data.value.keys)
        assertEquals(7, repo.dailySpending(week).first().size)
        assertEquals(8, repo.monthlyTrend(8).first().size)
        assertTrue(repo.dailySpending(bounds).first().isEmpty())
        assertTrue(repo.monthlyTrend(12).first().isEmpty())
    }

    @Test
    fun `gagal di tengah refreshAnalytics cache utuh`() = runTest {
        snapshotDao.upsert(RpcSnapshot("get_monthly_trend:12", "[]", 1L))
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = 500L, ownerId = "u1"))
        api.failFrom = 4

        val result = repo.refreshAnalytics(bounds)

        assertTrue(result.exceptionOrNull() is SyncError.Offline)
        assertEquals(setOf("get_monthly_trend:12"), snapshotDao.data.value.keys)
        assertTrue(categoryDao.data.value.isEmpty())
        assertEquals(500L, repo.lastSuccessAt().first())
    }

    @Test
    fun `tanpa cache flow analytics kosong`() = runTest {
        assertNull(repo.periodComparison(bounds).first())
        assertTrue(repo.monthlyTrend(12).first().isEmpty())
        assertTrue(repo.savingsRateTrend(12).first().isEmpty())
        assertTrue(repo.breakdown(bounds).first().isEmpty())
        assertTrue(repo.dailySpending(bounds).first().isEmpty())
        assertTrue(repo.topTransactions(bounds).first().isEmpty())
    }
}
