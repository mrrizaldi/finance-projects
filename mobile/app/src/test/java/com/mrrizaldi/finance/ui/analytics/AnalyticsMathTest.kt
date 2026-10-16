package com.mrrizaldi.finance.ui.analytics

import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale

class AnalyticsMathTest {
    private val id = Locale.forLanguageTag("id-ID")
    private val en = Locale.US

    private fun row(key: String, amount: Double) =
        CategoryBreakdownDto(key, "Kat $key", "#00aa00", amount, 1, 0.0)

    @Test
    fun `persen perubahan dan kosong kalau bulan lalu nol`() {
        assertEquals(50.0, percentChange(150.0, 100.0) ?: 0.0, 1e-9)
        assertEquals(-50.0, percentChange(50.0, 100.0) ?: 0.0, 1e-9)
        assertNull(percentChange(10.0, 0.0))
    }

    @Test
    fun `nada perubahan pengeluaran naik buruk pemasukan naik baik`() {
        assertEquals(Tone.BAD, toneOf(12.0, higherIsGood = false))
        assertEquals(Tone.GOOD, toneOf(-12.0, higherIsGood = false))
        assertEquals(Tone.GOOD, toneOf(12.0, higherIsGood = true))
        assertEquals(Tone.BAD, toneOf(-12.0, higherIsGood = true))
        assertEquals(Tone.NEUTRAL, toneOf(0.0, higherIsGood = true))
        assertEquals(Tone.NEUTRAL, toneOf(null, higherIsGood = false))
    }

    @Test
    fun `format perubahan pakai segitiga dan desimal lokal`() {
        assertEquals("▲ 12,3%", formatChange(12.345, id))
        assertEquals("▼ 50,0%", formatChange(-50.0, id))
        assertEquals("▲ 1.234,5%", formatChange(1234.5, id))
        assertEquals("▲ 12.3%", formatChange(12.345, en))
    }

    @Test
    fun `format juta untuk sumbu`() {
        assertEquals("1,3 jt", formatMillions(1_250_000.0, "jt", id))
        assertEquals("2 jt", formatMillions(2_000_000.0, "jt", id))
        assertEquals("0,5 jt", formatMillions(500_000.0, "jt", id))
        assertEquals("0", formatMillions(0.0, "jt", id))
        assertEquals("1.3 M", formatMillions(1_250_000.0, "M", en))
        assertEquals("8,3%", formatShare(300f / 3600f, id))
    }

    @Test
    fun `enam kategori teratas plus lainnya`() {
        val rows = listOf(100.0, 800.0, 300.0, 700.0, 200.0, 600.0, 500.0, 400.0)
            .mapIndexed { i, amount -> row("k$i", amount) }

        val slices = topWithOthers(rows)

        assertEquals(7, slices.size)
        assertEquals("Kat k1", slices.first().name)
        assertEquals(800L, slices.first().amount)
        assertEquals(listOf(800L, 700L, 600L, 500L, 400L, 300L, 300L), slices.map { it.amount })
        assertNull(slices.last().name)
        assertEquals(300f / 3600f, slices.last().share, 1e-6f)
        assertEquals(1f, slices.sumOf { it.share.toDouble() }.toFloat(), 1e-5f)
    }

    @Test
    fun `tanpa lainnya kalau kategori paling banyak enam`() {
        val six = (1..6).map { row("k$it", it * 10.0) }
        assertTrue(topWithOthers(six).all { it.name != null })
        assertEquals(6, topWithOthers(six).size)
        assertTrue(topWithOthers(emptyList()).isEmpty())
        assertTrue(topWithOthers(listOf(row("nol", 0.0))).isEmpty())
    }

    @Test
    fun `intensitas relatif terhadap hari termahal`() {
        assertEquals(0f, intensity(0.0, 100.0), 0f)
        assertEquals(0.5f, intensity(50.0, 100.0), 1e-6f)
        assertEquals(1f, intensity(100.0, 100.0), 0f)
        assertEquals(1f, intensity(150.0, 100.0), 0f)
        assertEquals(0f, intensity(10.0, 0.0), 0f)
    }

    @Test
    fun `kalender mulai senin`() {
        val oct = monthWeeks(YearMonth.of(2026, 10))
        assertEquals(5, oct.size)
        assertTrue(oct.all { it.size == 7 })
        assertEquals(
            listOf(null, null, null, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 2), LocalDate.of(2026, 10, 3), LocalDate.of(2026, 10, 4)),
            oct.first()
        )
        assertEquals(LocalDate.of(2026, 10, 31), oct.last()[5])
        assertNull(oct.last()[6])

        val feb = monthWeeks(YearMonth.of(2027, 2))
        assertEquals(4, feb.size)
        assertEquals(LocalDate.of(2027, 2, 1), feb.first().first())
        assertTrue(feb.flatten().none { it == null })

        val nov = monthWeeks(YearMonth.of(2026, 11))
        assertEquals(6, nov.size)
        assertEquals(LocalDate.of(2026, 11, 1), nov.first()[6])
        assertEquals(30, nov.flatten().count { it != null })
    }

    @Test
    fun `teks detail hari dan label bulan`() {
        assertEquals("Sel, 13 Okt · Rp 27.000", formatDayDetail(LocalDate.of(2026, 10, 13), "Rp 27.000", id))
        assertEquals("Tue, 13 Oct · Rp 27.000", formatDayDetail(LocalDate.of(2026, 10, 13), "Rp 27.000", en))
        assertEquals("Okt", shortMonth("2026-10-01", id))
        assertEquals("Oct", shortMonth("2026-10-01", en))
    }

    @Test
    fun `status budget batas 80 dan 100 persen`() {
        assertEquals(BudgetState.OK, budgetState(800, 1_000))
        assertEquals(BudgetState.WARN, budgetState(801, 1_000))
        assertEquals(BudgetState.WARN, budgetState(1_000, 1_000))
        assertEquals(BudgetState.OVER, budgetState(1_001, 1_000))
    }

    @Test
    fun `budget hanya yang punya limit urut persen tertinggi`() {
        val categories = listOf(
            CategoryEntity("a", "Makan", "expense", null, 1_000, 0, true),
            CategoryEntity("b", "Jajan", "expense", null, 200, 1, true),
            CategoryEntity("c", "Hobi", "expense", null, 0, 2, true),
            CategoryEntity("d", "Lain", "expense", null, null, 3, true),
            CategoryEntity("e", "Kos", "expense", null, 100, 4, true)
        )
        val breakdown = listOf(row("a", 500.0), row("b", 300.0), row("c", 900.0))

        val lines = budgetLines(categories, breakdown)

        assertEquals(listOf("Jajan", "Makan", "Kos"), lines.map { it.name })
        assertEquals(listOf(300L, 500L, 0L), lines.map { it.spent })
        assertEquals(listOf(BudgetState.OVER, BudgetState.OK, BudgetState.OK), lines.map { it.state })
        assertEquals(1.5f, lines.first().ratio, 1e-6f)
    }
}
