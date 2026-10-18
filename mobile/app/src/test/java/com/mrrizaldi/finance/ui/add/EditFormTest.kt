package com.mrrizaldi.finance.ui.add

import com.mrrizaldi.finance.data.local.TransactionEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

class EditFormTest {
    @Test
    fun `expense jadi form terisi dengan jam Jakarta`() {
        val f = formFor(
            TransactionEntity(
                id = "t",
                type = "expense",
                amount = 25_000,
                transactionDate = "2026-10-16T02:30:00+00:00",
                dateKey = "2026-10-16",
                description = "kopi",
                merchant = "kedai",
                categoryId = "c1",
                accountId = "a1"
            )
        )
        assertEquals(AddKind.EXPENSE, f.kind)
        assertEquals("25000", f.amount)
        assertEquals("a1", f.accountId)
        assertEquals("a1", f.fromAccountId)
        assertEquals("c1", f.categoryId)
        assertEquals("kopi", f.description)
        assertEquals("kedai", f.merchant)
        assertEquals(LocalDate.of(2026, 10, 16), f.date)
        assertEquals(LocalTime.of(9, 30), f.time)
        assertTrue(f.sameAmount)
        assertFalse(f.saving)
    }

    @Test
    fun `transfer beda nominal - sameAmount false, dua akun terisi, tanggal geser ke hari Jakarta`() {
        val f = formFor(
            TransactionEntity(
                id = "t",
                type = "transfer",
                amount = 100_000,
                transactionDate = "2026-10-15T17:00:00+00:00",
                dateKey = "2026-10-16",
                toAmount = 97_500,
                accountId = "a1",
                toAccountId = "a2"
            )
        )
        assertEquals(AddKind.TRANSFER, f.kind)
        assertEquals("100000", f.amount)
        assertEquals("a1", f.fromAccountId)
        assertEquals("a2", f.toAccountId)
        assertEquals("97500", f.toAmount)
        assertFalse(f.sameAmount)
        assertEquals("", f.description)
        assertEquals(LocalDate.of(2026, 10, 16), f.date)
        assertEquals(LocalTime.of(0, 0), f.time)
    }
}
