package com.mrrizaldi.finance.ui.transactions

import com.mrrizaldi.finance.data.local.TransactionEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class DailyTotalTest {
    private fun tx(id: String, type: String, amount: Long) =
        TransactionEntity(id, type, amount, "2026-10-16T05:00:00+00:00", "2026-10-16")

    @Test
    fun `total harian masuk dikurangi keluar, transfer diabaikan`() {
        val rows = listOf(
            tx("a", "expense", 18_000),
            tx("b", "expense", 45_000),
            tx("c", "income", 8_200_000),
            tx("d", "transfer", 500_000)
        )
        assertEquals(8_137_000L, dailyTotal(rows))
        assertEquals(-63_000L, dailyTotal(rows.take(2)))
        assertEquals(0L, dailyTotal(emptyList()))
    }

    @Test
    fun `format total harian pakai tanda`() {
        assertEquals("+Rp 8.137.000", formatDayTotal(8_137_000))
        assertEquals("-Rp 63.000", formatDayTotal(-63_000))
        assertEquals("Rp 0", formatDayTotal(0))
    }
}
