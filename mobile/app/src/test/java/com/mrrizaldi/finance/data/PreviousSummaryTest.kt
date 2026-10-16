package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.YearMonth

class SummaryRecordingApi(private val inner: FakeApi = FakeApi()) : SupabaseApi by inner {
    val summaryCalls = mutableListOf<String>()

    override suspend fun getSummary(start: String, end: String): SummaryDto {
        summaryCalls += "$start..$end"
        val net = if (start == "2026-09-01") 1_870_000.0 else 3_100_000.0
        return SummaryDto(
            total_income = net,
            total_expense = 0.0,
            net_cashflow = net,
            transaction_count = 1,
            avg_daily_expense = 0.0
        )
    }
}

class PreviousSummaryTest {
    @Test
    fun `refreshHome simpan summary bulan lalu di kunci sendiri`() = runTest {
        val api = SummaryRecordingApi()
        val repo = Repository(
            api,
            FakeAccountDao(),
            FakeCategoryDao(),
            FakeTransactionDao(),
            FakeSnapshotDao(),
            FakeSyncMetaDao(),
            FakeOutboxDao()
        ) { 1_000L }
        val month = YearMonth.of(2026, 10)
        assertNull(repo.previousSummary(month).first())

        assertTrue(repo.refreshHome(month).isSuccess)

        assertEquals(listOf("2026-10-01..2026-10-31", "2026-09-01..2026-09-30"), api.summaryCalls)
        assertEquals(1_870_000.0, repo.previousSummary(month).first()?.net_cashflow ?: 0.0, 0.0)
        assertEquals(3_100_000.0, repo.summary(month).first()?.net_cashflow ?: 0.0, 0.0)
    }
}
