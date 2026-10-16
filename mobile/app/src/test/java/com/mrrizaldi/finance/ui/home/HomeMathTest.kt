package com.mrrizaldi.finance.ui.home

import com.mrrizaldi.finance.data.remote.SummaryDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomeMathTest {
    private fun summary(net: Double) = SummaryDto(
        total_income = 0.0,
        total_expense = 0.0,
        net_cashflow = net,
        transaction_count = 0,
        avg_daily_expense = 0.0
    )

    @Test
    fun `perubahan kosong kalau salah satu bulan belum ada`() {
        assertNull(netChange(null, summary(1.0)))
        assertNull(netChange(summary(1.0), null))
    }

    @Test
    fun `perubahan sama dengan arus kas bulan ini dikurangi bulan lalu`() {
        assertEquals(1_230_000L, netChange(summary(3_100_000.0), summary(1_870_000.0)))
        assertEquals(-500_000L, netChange(summary(-200_000.0), summary(300_000.0)))
    }

    @Test
    fun `hitung naik berakhir persis di target`() {
        assertEquals(0L, countUpValue(0, 123_456_789_012, 0f))
        assertEquals(123_456_789_012L, countUpValue(0, 123_456_789_012, 1f))
        assertEquals(1_500L, countUpValue(1_000, 2_000, 0.5f))
        assertEquals(-25_000L, countUpValue(0, -25_000, 1f))
    }
}
