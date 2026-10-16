package id.aigra.finance.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.util.Locale

class JakartaDateTest {
    @Test
    fun `awal dan akhir bulan`() {
        assertEquals("2026-02-01", JakartaDate.monthStart(YearMonth.of(2026, 2)))
        assertEquals("2026-02-28", JakartaDate.monthEnd(YearMonth.of(2026, 2)))
        assertEquals("2026-10-31", JakartaDate.monthEnd(YearMonth.of(2026, 10)))
        assertEquals("2028-02-29", JakartaDate.monthEnd(YearMonth.of(2028, 2)))
    }

    @Test
    fun `dateKey geser ke zona Jakarta`() {
        assertEquals("2026-10-17", JakartaDate.dateKey("2026-10-16T18:30:00+00:00"))
        assertEquals("2026-10-16", JakartaDate.dateKey("2026-10-16T03:21:00.123456+00:00"))
        assertEquals("2026-10-16", JakartaDate.dateKey("2026-10-16T00:00:00+07:00"))
    }

    @Test
    fun `today dan currentMonth ikut Jakarta`() {
        assertEquals(LocalDate.of(2026, 10, 17), JakartaDate.today(Instant.parse("2026-10-16T17:30:00Z")))
        assertEquals(YearMonth.of(2026, 11), JakartaDate.currentMonth(Instant.parse("2026-10-31T17:30:00Z")))
    }

    @Test
    fun `timestamp untuk RPC pakai offset +07`() {
        assertEquals(
            "2026-10-16T13:05:00+07:00",
            JakartaDate.toTimestamp(LocalDate.of(2026, 10, 16), LocalTime.of(13, 5))
        )
    }

    @Test
    fun `batas atas eksklusif awal hari berikutnya`() {
        assertEquals("2026-11-01T00:00:00+07:00", JakartaDate.nextDayStart("2026-10-31"))
        assertEquals("2027-01-01T00:00:00+07:00", JakartaDate.nextDayStart("2026-12-31"))
        assertEquals("2028-03-01T00:00:00+07:00", JakartaDate.nextDayStart("2028-02-29"))
    }

    @Test
    fun `format tampilan`() {
        assertEquals("16 Oct 2026", JakartaDate.formatDay(LocalDate.of(2026, 10, 16), Locale.ENGLISH))
        assertEquals("October 2026", JakartaDate.formatMonth(YearMonth.of(2026, 10), Locale.ENGLISH))
        assertEquals("Mei 2026", JakartaDate.formatMonth(YearMonth.of(2026, 5), Locale.forLanguageTag("id")))
        assertEquals("16 Oct 2026, 13:05", JakartaDate.formatTimestamp("2026-10-16T06:05:00+00:00", Locale.ENGLISH))
        assertEquals(LocalDate.of(2026, 10, 16), JakartaDate.parseKey("2026-10-16"))
    }
}
