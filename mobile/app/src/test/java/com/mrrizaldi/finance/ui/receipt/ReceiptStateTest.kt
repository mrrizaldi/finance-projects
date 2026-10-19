package com.mrrizaldi.finance.ui.receipt

import com.mrrizaldi.finance.data.remote.ReceiptCandidateDto
import com.mrrizaldi.finance.data.remote.ReceiptDraftDto
import com.mrrizaldi.finance.data.remote.ReceiptDto
import com.mrrizaldi.finance.data.remote.ReceiptLineDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptStateTest {
    private val item = ReceiptLine("item", "Roti", 1.0, 52000, "food")
    private val candidate = ReceiptCandidateDto("tx1", 0.9, 52000.0, "2026-09-10T07:00:00Z", category_id = "shop")
    private val draftReceipt = ReceiptDto("r1", status = "draft", printed_total = 52000.0)
    private val draftLine = ReceiptLineDto("item", "Roti", 1.0, 52000.0, "food")

    @Test
    fun `target transaksi tetap menang, lalu kandidat terpilih, lalu transaksi baru`() {
        val fixed = ReceiptState(transactionId = "txA", parentAmount = 52000, parentCategoryId = "shop", lines = listOf(item))
        assertTrue(fixed.canSave)
        val chosen = ReceiptState(candidates = listOf(candidate), chosenCandidateId = "tx1", lines = listOf(item))
        assertEquals(52000L, chosen.effectiveParentAmount)
        assertEquals("shop", chosen.effectiveParentCategoryId)
        assertTrue(chosen.canSave)
        val fresh = ReceiptState(createNew = true, newAccountId = null, newAmount = "52000", lines = listOf(item))
        assertFalse(fresh.canSave)
        assertTrue(fresh.copy(newAccountId = "acc").canSave)
    }

    @Test
    fun `tanpa baris atau tanpa target gak bisa simpan`() {
        assertFalse(ReceiptState(transactionId = "txA", parentAmount = 1, lines = emptyList()).canSave)
        assertFalse(ReceiptState(lines = listOf(item)).canSave)
    }

    @Test
    fun `lagi sibuk gak bisa simpan`() {
        val fixed = ReceiptState(transactionId = "txA", lines = listOf(item), busy = ReceiptBusy.SAVING)
        assertFalse(fixed.canSave)
    }

    @Test
    fun `draft dari API memilih kandidat pertama dan memetakan baris`() {
        val state = ReceiptState().withDraft(
            ReceiptDraftDto(receipt = draftReceipt, lines = listOf(draftLine), totalOk = true, candidates = listOf(candidate))
        )
        assertEquals("r1", state.receiptId)
        assertEquals("tx1", state.chosenCandidateId)
        assertFalse(state.createNew)
        assertEquals(listOf(item), state.lines)
        assertNull(state.extractionError)
    }

    @Test
    fun `kategori dominan mengabaikan baris tanpa kategori`() {
        val big = ReceiptLineDto("item", "Besar", 1.0, 90000.0, null)
        val small = ReceiptLineDto("item", "Kecil", 1.0, 10000.0, "food")
        val state = ReceiptState().withDraft(ReceiptDraftDto(receipt = draftReceipt, lines = listOf(big, small)))
        assertEquals("food", state.newCategoryId)
        val none = ReceiptState().withDraft(ReceiptDraftDto(receipt = draftReceipt, lines = listOf(big)))
        assertNull(none.newCategoryId)
    }

    @Test
    fun `hapus baris tengah mempertahankan kunci baris lain`() {
        val state = ReceiptState().withLines(listOf(item, item.copy(name = "B"), item.copy(name = "C")))
        val keys = state.lineKeys
        assertEquals(listOf(keys[0], keys[2]), state.withoutLine(1).lineKeys)
        assertEquals(keys + 3L, state.withAddedLine(item).lineKeys)
    }

    @Test
    fun `status HTTP dipetakan ke pesan`() {
        assertEquals(com.mrrizaldi.finance.R.string.receipt_err_processing, receiptErrorRes(409, true))
        assertEquals(com.mrrizaldi.finance.R.string.receipt_err_has_breakdown, receiptErrorRes(409, false))
        assertEquals(com.mrrizaldi.finance.R.string.receipt_err_invalid, receiptErrorRes(400, false))
        assertEquals(com.mrrizaldi.finance.R.string.receipt_err_failed, receiptErrorRes(500, false))
    }

    @Test
    fun `draft tanpa kandidat langsung mode transaksi baru dengan nominal total`() {
        val state = ReceiptState().withDraft(ReceiptDraftDto(receipt = draftReceipt, lines = listOf(draftLine)))
        assertTrue(state.createNew)
        assertEquals("52000", state.newAmount)
        assertEquals("food", state.newCategoryId)
    }

    @Test
    fun `draft untuk transaksi tetap gak memilih kandidat`() {
        val state = ReceiptState(transactionId = "txA").withDraft(
            ReceiptDraftDto(receipt = draftReceipt, lines = listOf(draftLine), candidates = listOf(candidate))
        )
        assertNull(state.chosenCandidateId)
        assertFalse(state.createNew)
        assertTrue(state.canSave)
    }

    @Test
    fun `tanda penyesuaian mengikuti jenisnya`() {
        assertEquals(-5000L, signedAdjustment("discount", 5000, -1))
        assertEquals(5000L, signedAdjustment("tax", 5000, -1))
        assertEquals(5000L, signedAdjustment("service", 5000, 1))
        assertEquals(-300L, signedAdjustment("rounding", 300, -340))
        assertEquals(300L, signedAdjustment("rounding", 300, 0))
    }
}
