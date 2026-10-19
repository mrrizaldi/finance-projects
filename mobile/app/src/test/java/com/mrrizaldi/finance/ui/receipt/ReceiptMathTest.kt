package com.mrrizaldi.finance.ui.receipt

import org.junit.Assert.assertEquals
import org.junit.Test

class ReceiptMathTest {
    private val resto = listOf(
        ReceiptLine("item", "Nasi goreng", 1.0, 45000, "food"),
        ReceiptLine("item", "Es teh", 2.0, 16000, "food"),
        ReceiptLine("item", "Sabun cuci", 1.0, 55000, "home"),
        ReceiptLine("discount", "Diskon", 1.0, -8000, null),
        ReceiptLine("service", "Service", 1.0, 5400, null),
        ReceiptLine("tax", "PB1", 1.0, 11340, null),
        ReceiptLine("rounding", "Pembulatan", 1.0, -340, null)
    )

    private fun total(parent: Long, category: String, lines: List<ReceiptLine>): Map<String?, Long> {
        val slices = allocate(parent, category, lines)
        assertEquals(parent, slices.sumOf { it.amount })
        return slices.associate { it.categoryId to it.amount }
    }

    @Test
    fun `pajak dan diskon disebar, sisa ke kategori induk`() {
        val slices = total(136400, "shop", resto)
        assertEquals(mapOf("food" to 65417L, "home" to 58983L, "shop" to 12000L), slices)
    }

    @Test
    fun `item tanpa kategori ikut induk dan digabung dengan sisa`() {
        val lines = listOf(ReceiptLine("item", "a", 1.0, 30000, null), ReceiptLine("item", "b", 1.0, 20000, "food"))
        val slices = total(60000, "shop", lines)
        assertEquals(mapOf("shop" to 40000L, "food" to 20000L), slices)
    }

    @Test
    fun `total struk lebih besar dari induk dipotong ke nominal induk`() {
        val lines = listOf(ReceiptLine("item", "a", 1.0, 100000, "food"))
        assertEquals(mapOf<String?, Long>("food" to 80000L), total(80000, "shop", lines))
    }

    @Test
    fun `tanpa item semua ke induk`() {
        assertEquals(mapOf<String?, Long>("shop" to 50000L), total(50000, "shop", emptyList()))
    }

    @Test
    fun `pembulatan gak pernah melebihi nominal induk`() {
        val lines = listOf(
            ReceiptLine("item", "a", 1.0, 1, "food"),
            ReceiptLine("item", "b", 1.0, 1, "home"),
            ReceiptLine("tax", "PB1", 1.0, 1, null)
        )
        val slices = total(3, "shop", lines)
        assertEquals(3L, slices.values.sum())
        assertEquals(mapOf<String?, Long>("food" to 2L, "home" to 1L), slices)
    }

    @Test
    fun `ukuran kompres menjaga rasio dan gak memperbesar`() {
        assertEquals(1200 to 1600, scaledSize(3000, 4000))
        assertEquals(1600 to 900, scaledSize(3200, 1800))
        assertEquals(800 to 600, scaledSize(800, 600))
    }
}
