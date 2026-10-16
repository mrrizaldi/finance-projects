package com.mrrizaldi.finance.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale

class AnalyticsPeriodTest {
    private val id = Locale.forLanguageTag("id-ID")
    private val en = Locale.US

    private fun d(year: Int, month: Int, day: Int) = LocalDate.of(year, month, day)

    private fun assertBounds(b: PeriodBounds, start: LocalDate, end: LocalDate, prevStart: LocalDate, prevEnd: LocalDate) {
        assertEquals(listOf(start, end, prevStart, prevEnd), listOf(b.start, b.end, b.prevStart, b.prevEnd))
    }

    @Test
    fun `minggu mulai senin termasuk lintas bulan dan tahun`() {
        assertBounds(periodBounds(AnalyticsPeriod.WEEK, d(2026, 10, 16)), d(2026, 10, 12), d(2026, 10, 18), d(2026, 10, 5), d(2026, 10, 11))
        assertBounds(periodBounds(AnalyticsPeriod.WEEK, d(2026, 10, 12)), d(2026, 10, 12), d(2026, 10, 18), d(2026, 10, 5), d(2026, 10, 11))
        assertBounds(periodBounds(AnalyticsPeriod.WEEK, d(2026, 10, 1)), d(2026, 9, 28), d(2026, 10, 4), d(2026, 9, 21), d(2026, 9, 27))
        assertBounds(periodBounds(AnalyticsPeriod.WEEK, d(2027, 1, 3)), d(2026, 12, 28), d(2027, 1, 3), d(2026, 12, 21), d(2026, 12, 27))
    }

    @Test
    fun `bulan dan bulan lalu sampai hari terakhirnya`() {
        assertBounds(periodBounds(AnalyticsPeriod.MONTH, d(2026, 10, 16)), d(2026, 10, 1), d(2026, 10, 31), d(2026, 9, 1), d(2026, 9, 30))
        assertBounds(periodBounds(AnalyticsPeriod.MONTH, d(2026, 3, 31)), d(2026, 3, 1), d(2026, 3, 31), d(2026, 2, 1), d(2026, 2, 28))
        assertBounds(periodBounds(AnalyticsPeriod.MONTH, d(2026, 5, 2)), d(2026, 5, 1), d(2026, 5, 31), d(2026, 4, 1), d(2026, 4, 30))
    }

    @Test
    fun `kuartal termasuk q4 dan q2`() {
        assertBounds(periodBounds(AnalyticsPeriod.QUARTER, d(2026, 11, 20)), d(2026, 10, 1), d(2026, 12, 31), d(2026, 7, 1), d(2026, 9, 30))
        assertBounds(periodBounds(AnalyticsPeriod.QUARTER, d(2026, 5, 5)), d(2026, 4, 1), d(2026, 6, 30), d(2026, 1, 1), d(2026, 3, 31))
        assertBounds(periodBounds(AnalyticsPeriod.QUARTER, d(2026, 2, 14)), d(2026, 1, 1), d(2026, 3, 31), d(2025, 10, 1), d(2025, 12, 31))
    }

    @Test
    fun `tahun penuh dan tahun lalu`() {
        assertBounds(periodBounds(AnalyticsPeriod.YEAR, d(2026, 10, 16)), d(2026, 1, 1), d(2026, 12, 31), d(2025, 1, 1), d(2025, 12, 31))
    }

    @Test
    fun `geser maju mundur satu periode`() {
        val week = periodBounds(AnalyticsPeriod.WEEK, d(2026, 10, 16))
        assertEquals(d(2026, 10, 5), week.shift(-1).start)
        assertEquals(d(2026, 10, 19), week.shift(1).start)
        assertEquals(d(2026, 11, 1), periodBounds(AnalyticsPeriod.MONTH, d(2026, 10, 31)).shift(1).start)
        assertEquals(d(2027, 1, 1), periodBounds(AnalyticsPeriod.QUARTER, d(2026, 11, 20)).shift(1).start)
        assertEquals(d(2025, 1, 1), periodBounds(AnalyticsPeriod.YEAR, d(2026, 10, 16)).shift(-1).start)
        val quarter = periodBounds(AnalyticsPeriod.QUARTER, d(2026, 11, 20))
        assertEquals(quarter.prevStart, quarter.shift(-1).start)
        assertEquals(quarter.prevEnd, quarter.shift(-1).end)
    }

    @Test
    fun `jumlah bulan tren per periode`() {
        assertEquals(listOf(8, 12, 12, 24), AnalyticsPeriod.entries.map { it.trendMonths })
    }

    @Test
    fun `label periode id dan en`() {
        val week = periodBounds(AnalyticsPeriod.WEEK, d(2026, 10, 1))
        assertEquals("28 Sep – 4 Okt 2026", week.label(id))
        assertEquals("28 Sep – 4 Oct 2026", week.label(en))
        assertEquals("28 Des – 3 Jan 2027", periodBounds(AnalyticsPeriod.WEEK, d(2027, 1, 3)).label(id))
        val month = periodBounds(AnalyticsPeriod.MONTH, d(2026, 10, 16))
        assertEquals("Oktober 2026", month.label(id))
        assertEquals("October 2026", month.label(en))
        assertEquals("September 2026", month.shift(-1).label(en))
        assertEquals("Q4 2026", periodBounds(AnalyticsPeriod.QUARTER, d(2026, 11, 20)).label(id))
        assertEquals("Q2 2026", periodBounds(AnalyticsPeriod.QUARTER, d(2026, 5, 5)).label(en))
        assertEquals("2026", periodBounds(AnalyticsPeriod.YEAR, d(2026, 10, 16)).label(id))
        assertEquals("2025", periodBounds(AnalyticsPeriod.YEAR, d(2026, 10, 16)).shift(-1).label(en))
    }

    @Test
    fun `bulan yang beririsan dengan periode`() {
        val week = periodBounds(AnalyticsPeriod.WEEK, d(2026, 10, 1))
        assertTrue(week.covers(YearMonth.of(2026, 9)))
        assertTrue(week.covers(YearMonth.of(2026, 10)))
        assertFalse(week.covers(YearMonth.of(2026, 11)))
        val quarter = periodBounds(AnalyticsPeriod.QUARTER, d(2026, 11, 20))
        assertEquals(listOf(10, 11, 12), (1..12).filter { quarter.covers(YearMonth.of(2026, it)) })
    }
}
