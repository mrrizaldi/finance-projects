package com.mrrizaldi.finance.ui.receipt

import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.NewReceiptTransaction
import com.mrrizaldi.finance.data.remote.ReceiptApi
import com.mrrizaldi.finance.data.remote.ReceiptCandidateDto
import com.mrrizaldi.finance.data.remote.ReceiptDraftDto
import com.mrrizaldi.finance.data.remote.ReceiptDto
import com.mrrizaldi.finance.data.remote.ReceiptLineDto
import com.mrrizaldi.finance.data.remote.ReceiptViewDto
import com.mrrizaldi.finance.data.remote.SavedReceiptDto
import com.mrrizaldi.finance.data.remote.StatementApiException
import com.mrrizaldi.finance.data.remote.UploadFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

private const val CONFLICT = 409
private const val TOTAL = 52000.0
private const val PARENT_AMOUNT = 60000L

private data class SaveCall(
    val receiptId: String?,
    val transactionId: String?,
    val newTransaction: NewReceiptTransaction?,
    val lines: List<ReceiptLineDto>
)

private class FakeReceiptApi(private val draft: ReceiptDraftDto) : ReceiptApi {
    var failUpload: Exception? = null
    val saves = mutableListOf<SaveCall>()
    val loaded = mutableListOf<String>()

    override suspend fun upload(files: List<UploadFile>): ReceiptDraftDto {
        failUpload?.let { throw it }
        return draft
    }

    override suspend fun byTransaction(transactionId: String): ReceiptViewDto {
        loaded += transactionId
        return ReceiptViewDto(ReceiptDto("r-old", transactionId, "saved", "Warung"), draft.lines)
    }

    override suspend fun save(
        receiptId: String?,
        transactionId: String?,
        newTransaction: NewReceiptTransaction?,
        lines: List<ReceiptLineDto>
    ): SavedReceiptDto {
        saves += SaveCall(receiptId, transactionId, newTransaction, lines)
        return SavedReceiptDto(receiptId ?: "r-new", transactionId ?: "tx-new")
    }

    override suspend fun delete(receiptId: String) = Unit
}

class ReceiptViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val pdf = UploadFile("struk.pdf", "%PDF-1.4".toByteArray())
    private val candidate = ReceiptCandidateDto("tx1", 0.9, TOTAL, "2026-09-10T07:00:00Z", category_id = "shop")
    private val draft = ReceiptDraftDto(
        receipt = ReceiptDto("r1", status = "draft", printed_total = TOTAL),
        lines = listOf(
            ReceiptLineDto("item", "Roti", 1.0, TOTAL, "food"),
            ReceiptLineDto("item", "Bonus", 1.0, 0.0, null)
        ),
        totalOk = true,
        candidates = listOf(candidate)
    )
    private val parent = TransactionEntity("tx-old", "expense", PARENT_AMOUNT, "2026-09-10T07:00:00Z", "2026-09-10", categoryId = "shop")

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun vm(api: FakeReceiptApi, onSaved: suspend () -> Unit = {}) = ReceiptViewModel(
        api, flowOf(emptyList()), flowOf(emptyList()), null, { id -> parent.takeIf { it.id == id } }, dispatcher, onSaved
    )

    @Test
    fun saveFromChosenCandidateTargetsItAndDropsZeroLines() = runTest(dispatcher) {
        val api = FakeReceiptApi(draft)
        var refreshed = 0
        val model = vm(api) { refreshed++ }
        model.upload(listOf(pdf))
        advanceUntilIdle()
        assertEquals("tx1", model.state.value.chosenCandidateId)
        model.save()
        advanceUntilIdle()
        val call = api.saves.single()
        assertEquals("r1", call.receiptId)
        assertEquals("tx1", call.transactionId)
        assertNull(call.newTransaction)
        assertEquals(listOf("Roti"), call.lines.map { it.name })
        assertEquals(1, refreshed)
        assertTrue(model.state.value.done)
    }

    @Test
    fun saveInCreateNewModeSendsNewTransaction() = runTest(dispatcher) {
        val api = FakeReceiptApi(draft)
        val model = vm(api)
        model.upload(listOf(pdf))
        advanceUntilIdle()
        model.chooseCandidate(null)
        model.editNew { copy(newAccountId = "acc", newCategoryId = "food") }
        model.save()
        advanceUntilIdle()
        val call = api.saves.single()
        assertNull(call.transactionId)
        val fresh = requireNotNull(call.newTransaction)
        assertEquals("acc", fresh.account_id)
        assertEquals(TOTAL.toLong(), fresh.amount)
        assertEquals("food", fresh.category_id)
    }

    @Test
    fun conflictWithExistingTransactionOpensItsBreakdown() = runTest(dispatcher) {
        val api = FakeReceiptApi(draft)
        api.failUpload = StatementApiException(CONFLICT, "Struk ini sudah pernah dirinci", existingTransactionId = "tx-old")
        val model = vm(api)
        model.upload(listOf(pdf))
        advanceUntilIdle()
        assertEquals(listOf("tx-old"), api.loaded)
        val state = model.state.value
        assertEquals("tx-old", state.transactionId)
        assertEquals("r-old", state.receiptId)
        assertEquals(PARENT_AMOUNT, state.parentAmount)
        assertEquals("Struk ini sudah pernah dirinci", state.notice)
        assertNull(state.error)
        assertTrue(state.exists)
    }

    @Test
    fun offlineAfterAnErrorShowsOnlyTheOfflineMessage() = runTest(dispatcher) {
        val api = FakeReceiptApi(draft)
        api.failUpload = StatementApiException(CONFLICT, "Struk ini sudah pernah dirinci")
        val model = vm(api)
        model.upload(listOf(pdf))
        advanceUntilIdle()
        api.failUpload = java.io.IOException("offline")
        model.upload(listOf(pdf))
        advanceUntilIdle()
        assertNull(model.state.value.error)
        assertEquals(com.mrrizaldi.finance.R.string.receipt_offline, model.state.value.errorRes)
    }
}
