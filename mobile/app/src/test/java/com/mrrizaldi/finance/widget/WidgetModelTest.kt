package com.mrrizaldi.finance.widget

import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.remote.SummaryDto
import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetModelTest {
    private fun account(id: String, balance: Long) = AccountEntity(id, id, "bank", balance, null, true)

    @Test
    fun `total semua akun dan pengeluaran bulan ini diformat rupiah`() {
        val model = widgetModel(
            listOf(account("bca", 1_250_000), account("jago", 250_000)),
            SummaryDto(3_000_000.0, 487_500.4, 2_512_499.6, 12, 30_000.0),
            1_700L
        )

        assertEquals(WidgetModel("Rp 1.500.000", "Rp 487.500", 1_700L), model)
    }

    @Test
    fun `tanpa summary pengeluaran nol dan saldo minus tetap bertanda`() {
        assertEquals(
            WidgetModel("-Rp 500", "Rp 0", null),
            widgetModel(listOf(account("cash", -500)), null, null)
        )
    }
}
