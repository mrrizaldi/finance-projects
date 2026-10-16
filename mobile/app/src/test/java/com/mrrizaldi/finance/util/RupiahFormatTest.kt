package com.mrrizaldi.finance.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
        assertNull(RupiahFormat.parse(""))
        assertNull(RupiahFormat.parse("Rp"))
        assertEquals(0L, RupiahFormat.parse("0"))
        assertEquals("", RupiahFormat.digitsOf("0"))
        assertEquals("1500", RupiahFormat.digitsOf("1.5-0a0"))
    }

    @Test
    fun `parse nolak lebih dari 13 digit biar gak overflow`() {
        assertEquals(9_999_999_999_999L, RupiahFormat.parse("9.999.999.999.999"))
        assertNull(RupiahFormat.parse("12345678901234"))
        assertNull(RupiahFormat.parse("99999999999999999999"))
        assertEquals(1L, RupiahFormat.parse("00000000000000001"))
        assertEquals("1234567890123", RupiahFormat.digitsOf("12345678901234"))
    }
}
