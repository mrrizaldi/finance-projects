package id.aigra.finance.util

import org.junit.Assert.assertEquals
import org.junit.Test

class RupiahFormatTest {
    @Test
    fun `format pakai titik ribuan dan prefix Rp`() {
        assertEquals("Rp 1.500.000", RupiahFormat.format(1_500_000))
        assertEquals("Rp 999", RupiahFormat.format(999))
        assertEquals("Rp 0", RupiahFormat.format(0))
        assertEquals("-Rp 25.000", RupiahFormat.format(-25_000))
    }

    @Test
    fun `group memisah digit per tiga`() {
        assertEquals("", RupiahFormat.group(""))
        assertEquals("12", RupiahFormat.group("12"))
        assertEquals("1.234", RupiahFormat.group("1234"))
        assertEquals("1.500.000", RupiahFormat.group("1500000"))
    }

    @Test
    fun `parse keypad ambil digit saja dan buang nol di depan`() {
        assertEquals(1_500_000L, RupiahFormat.parse("1.500.000"))
        assertEquals(50_000L, RupiahFormat.parse("Rp 50.000"))
        assertEquals(7L, RupiahFormat.parse("007"))
        assertEquals(0L, RupiahFormat.parse(""))
        assertEquals(0L, RupiahFormat.parse("0"))
        assertEquals("", RupiahFormat.digitsOf("0"))
        assertEquals("1500", RupiahFormat.digitsOf("1.5-0a0"))
    }
}
