package com.mrrizaldi.finance.ui.components

import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Test

class MonthGridTest {
    private val current = YearMonth.of(2026, 10)

    @Test
    fun `bulan depan redup, terpilih menang atas bulan ini`() {
        assertEquals(MonthCell.FUTURE, monthCell(YearMonth.of(2026, 11), YearMonth.of(2026, 9), current))
        assertEquals(MonthCell.SELECTED, monthCell(YearMonth.of(2026, 9), YearMonth.of(2026, 9), current))
        assertEquals(MonthCell.SELECTED, monthCell(current, current, current))
        assertEquals(MonthCell.CURRENT, monthCell(current, YearMonth.of(2026, 9), current))
        assertEquals(MonthCell.NORMAL, monthCell(YearMonth.of(2019, 1), YearMonth.of(2026, 9), current))
    }

    @Test
    fun `bulan sebelum transaksi pertama redup, null tanpa batas`() {
        val first = YearMonth.of(2025, 3)
        assertEquals(MonthCell.BEFORE_FIRST, monthCell(YearMonth.of(2025, 2), current, current, first))
        assertEquals(MonthCell.NORMAL, monthCell(first, YearMonth.of(2026, 9), current, first))
        assertEquals(MonthCell.NORMAL, monthCell(YearMonth.of(2019, 1), YearMonth.of(2026, 9), current, null))
    }

    @Test
    fun `grid tahun berisi 12 bulan berurutan`() {
        val months = yearMonths(2025)
        assertEquals(12, months.size)
        assertEquals(YearMonth.of(2025, 1), months.first())
        assertEquals(YearMonth.of(2025, 12), months.last())
    }
}
