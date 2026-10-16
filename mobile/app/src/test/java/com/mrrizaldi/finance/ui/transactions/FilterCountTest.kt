package com.mrrizaldi.finance.ui.transactions

import com.mrrizaldi.finance.data.local.CategoryEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class FilterCountTest {
    private fun cat(id: String, type: String) = CategoryEntity(id, id, type, null, null, 0, true)

    @Test
    fun `jumlah filter aktif hanya akun dan kategori`() {
        assertEquals(0, activeFilterCount(null, null))
        assertEquals(1, activeFilterCount("acc", null))
        assertEquals(1, activeFilterCount(null, "cat"))
        assertEquals(2, activeFilterCount("acc", "cat"))
    }

    @Test
    fun `kategori disaring sesuai tipe`() {
        val all = listOf(cat("makan", "expense"), cat("gaji", "income"), cat("lain", "both"))
        assertEquals(listOf("makan", "lain"), categoriesForType(all, "expense").map { it.id })
        assertEquals(listOf("gaji", "lain"), categoriesForType(all, "income").map { it.id })
        assertEquals(all, categoriesForType(all, "transfer"))
        assertEquals(all, categoriesForType(all, null))
    }
}
