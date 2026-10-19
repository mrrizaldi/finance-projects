package com.mrrizaldi.finance.ui.components

import com.mrrizaldi.finance.data.local.TransactionEntity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TxRulesTest {
    private fun tx(type: String, accountId: String? = "a1", pending: Boolean = false, adjustment: Boolean = false) =
        TransactionEntity(
            "t",
            type,
            1,
            "2026-10-16T02:30:00+00:00",
            "2026-10-16",
            accountId = accountId,
            isAdjustment = adjustment,
            pending = pending
        )

    @Test
    fun `rincian struk cuma buat pengeluaran terkirim non-adjustment`() {
        assertTrue(itemizable(tx("expense")))
        assertTrue(itemizable(tx("expense", accountId = null)))
        assertFalse(itemizable(tx("income")))
        assertFalse(itemizable(tx("transfer")))
        assertFalse(itemizable(tx("expense", pending = true)))
        assertFalse(itemizable(tx("expense", adjustment = true)))
    }

    @Test
    fun `edit dan hapus cuma buat income expense transfer non-adjustment yang sudah terkirim`() {
        assertTrue(editable(tx("expense")))
        assertTrue(editable(tx("income")))
        assertTrue(deletable(tx("transfer")))
        assertFalse(editable(tx("expense", pending = true)))
        assertFalse(deletable(tx("income", pending = true)))
        assertFalse(editable(tx("investment_gain")))
        assertFalse(deletable(tx("investment_loss")))
        assertFalse(editable(tx("expense", accountId = null)))
        assertTrue(deletable(tx("expense", accountId = null)))
        assertFalse(editable(tx("expense", adjustment = true)))
        assertFalse(deletable(tx("income", adjustment = true)))
    }
}
