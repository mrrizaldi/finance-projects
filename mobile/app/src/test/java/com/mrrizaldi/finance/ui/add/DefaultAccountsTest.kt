package com.mrrizaldi.finance.ui.add

import com.mrrizaldi.finance.data.local.AccountEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class DefaultAccountsTest {
    private fun acc(id: String, type: String) = AccountEntity(id, id, type, 0, null, true)

    @Test
    fun `lewati akun investasi untuk dari dan ke`() {
        val list = listOf(acc("bibit", "investment"), acc("bca", "bank"), acc("dana", "ewallet"), acc("cash", "cash"))
        assertEquals("bca" to "dana", defaultAccounts(list))
    }

    @Test
    fun `ke jatuh ke investasi kalau cuma satu akun non investasi`() {
        val list = listOf(acc("bibit", "investment"), acc("cash", "cash"))
        assertEquals("cash" to "bibit", defaultAccounts(list))
    }

    @Test
    fun `semua investasi pakai urutan asli`() {
        val list = listOf(acc("a", "investment"), acc("b", "investment"))
        assertEquals("a" to "b", defaultAccounts(list))
    }

    @Test
    fun `satu akun dan kosong`() {
        assertEquals("bca" to null, defaultAccounts(listOf(acc("bca", "bank"))))
        assertEquals(null to null, defaultAccounts(emptyList()))
    }
}
