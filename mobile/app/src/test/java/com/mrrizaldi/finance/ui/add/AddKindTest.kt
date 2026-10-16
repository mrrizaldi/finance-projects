package com.mrrizaldi.finance.ui.add

import com.mrrizaldi.finance.data.local.CategoryEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

class AddKindTest {
    private fun cat(id: String, type: String) = CategoryEntity(id, id, type, null, null, 0, true)
    private val categories = listOf(cat("makan", "expense"), cat("gaji", "income"), cat("lain", "both"))
    private val base = AddForm(
        amount = "25.000",
        description = "kopi",
        date = LocalDate.of(2026, 10, 16),
        time = LocalTime.of(9, 30)
    )

    @Test
    fun `ganti jenis mempertahankan nominal deskripsi tanggal jam`() {
        val f = base.withKind(AddKind.TRANSFER, categories).withKind(AddKind.INCOME, categories)
        assertEquals(AddKind.INCOME, f.kind)
        assertEquals("income", f.kind.type)
        assertEquals("25.000", f.amount)
        assertEquals("kopi", f.description)
        assertEquals(LocalDate.of(2026, 10, 16), f.date)
        assertEquals(LocalTime.of(9, 30), f.time)
    }

    @Test
    fun `kategori yang gak cocok direset, both tetap`() {
        assertNull(base.copy(categoryId = "makan").withKind(AddKind.INCOME, categories).categoryId)
        assertEquals("lain", base.copy(categoryId = "lain").withKind(AddKind.INCOME, categories).categoryId)
        assertEquals("gaji", base.copy(kind = AddKind.INCOME, categoryId = "gaji").withKind(AddKind.TRANSFER, categories).categoryId)
        assertNull(
            base.copy(kind = AddKind.INCOME, categoryId = "gaji")
                .withKind(AddKind.TRANSFER, categories)
                .withKind(AddKind.EXPENSE, categories)
                .categoryId
        )
        assertNull(AddKind.TRANSFER.type)
    }
}
