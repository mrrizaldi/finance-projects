package com.mrrizaldi.finance.ui.statements

import com.mrrizaldi.finance.data.remote.AppFindingDto
import com.mrrizaldi.finance.data.remote.CommitResultDto
import com.mrrizaldi.finance.data.remote.StatementApi
import com.mrrizaldi.finance.data.remote.StatementApiException
import com.mrrizaldi.finance.data.remote.StatementImportDto
import com.mrrizaldi.finance.data.remote.StatementLineDto
import com.mrrizaldi.finance.data.remote.StatementViewDto
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

private const val CONFIDENT = 1.0
private const val UNSURE = 0.6
private const val CONFLICT = 409
private const val LINE_AMOUNT = 15000.0
private const val DUP_AMOUNT = -40000.0
private const val OVER_LIMIT_BYTES = 20 * 1024 * 1024 + 1

private fun line(id: String, decision: String, selected: Boolean, confidence: Double = CONFIDENT) =
    StatementLineDto(
        id = id, line_no = id.hashCode(), occurred_on = "2026-08-04", amount = LINE_AMOUNT, direction = "debit",
        decision = decision, selected = selected, confidence = confidence
    )

private fun view(
    lines: List<StatementLineDto>,
    findings: List<AppFindingDto> = emptyList(),
    status: String = "review",
    integrity: Boolean? = true
) = StatementViewDto(
    header = StatementImportDto(
        id = "imp-1", account_id = "acc", kind = "pdf", bank = "BCA", status = status,
        integrity_ok = integrity, app_findings = findings
    ),
    lines = lines
)

private val dup = AppFindingDto("tx-9", "app_dup", null, selected = false, signedAmount = DUP_AMOUNT)

class StatementReviewTest {
    @Test
    fun groupsInFixedOrderAndSkipsEmptyGroups() {
        val summary = summarize(view(listOf(line("a", "match", false), line("b", "new", true), line("c", "transfer_pair", false))))
        assertEquals(listOf(LineGroup.NEW, LineGroup.MATCHED), summary.groups.map { it.first })
        assertEquals(2, summary.groups.last().second.size)
    }

    @Test
    fun countsOnlyCommittableLinesAndCheckedFindings() {
        val summary = summarize(
            view(
                listOf(line("a", "new", true), line("b", "other_account", true), line("c", "match", true)),
                listOf(dup.copy(selected = true))
            )
        )
        assertEquals(3, summary.selectedCount)
        assertTrue(summary.canCommit)
    }

    @Test
    fun cannotCommitWhenIntegrityFailsNothingIsCheckedOrAlreadyCommitted() {
        val checked = listOf(line("a", "new", true))
        assertFalse(summarize(view(checked, integrity = false)).canCommit)
        assertTrue(summarize(view(checked, integrity = null)).canCommit)
        assertFalse(summarize(view(listOf(line("a", "new", false)))).canCommit)
        assertFalse(summarize(view(checked, status = "committed")).canCommit)
    }

    @Test
    fun flagsUnsureNewLines() {
        assertEquals(1, summarize(view(listOf(line("a", "new", false, UNSURE), line("b", "match", false, UNSURE)))).lowConfidenceCount)
    }

    @Test
    fun copyHelpersChangeOnlyTheTarget() {
        val start = view(listOf(line("a", "new", true), line("b", "probable", false)), listOf(dup))
        assertFalse(start.withLineSelected("a", false).lines.first().selected)
        assertEquals("new", start.withLineMarkedNew("b").lines.last().decision)
        assertTrue(start.withLineMarkedNew("b").lines.last().selected)
        assertTrue(start.withFindingSelected("tx-9", true).header.app_findings.single().selected)
        assertEquals(start.lines.first(), start.withLineMarkedNew("b").lines.first())
    }
}

private class FakeStatementApi(var current: StatementViewDto) : StatementApi {
    var failNext: Exception? = null
    val calls = mutableListOf<String>()
    private fun maybeFail() {
        failNext?.let { failNext = null; throw it }
    }
    override suspend fun upload(accountId: String, files: List<UploadFile>): StatementViewDto {
        calls += "upload:$accountId:${files.size}"
        maybeFail()
        return current
    }
    override suspend fun view(importId: String): StatementViewDto {
        calls += "view:$importId"
        return current
    }
    override suspend fun setLineSelected(importId: String, lineId: String, selected: Boolean) {
        calls += "line:$lineId:$selected"
        maybeFail()
    }
    override suspend fun markLineNew(importId: String, lineId: String) {
        calls += "new:$lineId"
    }
    override suspend fun setFindingSelected(importId: String, transactionId: String, selected: Boolean) {
        calls += "finding:$transactionId:$selected"
    }
    override suspend fun commit(importId: String): CommitResultDto {
        calls += "commit:$importId"
        return CommitResultDto(inserted = 1, moved = 0, deleted = 0)
    }
    override suspend fun discard(importId: String) {
        calls += "discard:$importId"
    }
}

class StatementViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun vm(api: FakeStatementApi, onCommitted: suspend () -> Unit = {}) =
        StatementViewModel(api, flowOf(emptyList()), onCommitted)

    @Test
    fun uploadNeedsAccountAndFilesThenShowsView() = runTest(dispatcher) {
        val api = FakeStatementApi(view(listOf(line("a", "new", true))))
        val model = vm(api)
        model.upload()
        model.setFiles(listOf(UploadFile("x.pdf", byteArrayOf(1))))
        model.upload()
        advanceUntilIdle()
        assertTrue(api.calls.isEmpty())
        model.setAccount("acc")
        model.upload()
        advanceUntilIdle()
        assertEquals(listOf("upload:acc:1"), api.calls)
        assertEquals("imp-1", model.state.value.view?.header?.id)
        assertTrue(model.state.value.files.isEmpty())
    }

    @Test
    fun conflictKeepsTheExistingImportIdSoItCanBeOpened() = runTest(dispatcher) {
        val api = FakeStatementApi(view(listOf(line("a", "new", true))))
        api.failNext = StatementApiException(CONFLICT, "File ini sudah pernah diimpor", "imp-old")
        val model = vm(api)
        model.setAccount("acc")
        model.setFiles(listOf(UploadFile("x.pdf", byteArrayOf(1))))
        model.upload()
        advanceUntilIdle()
        assertEquals("imp-old", model.state.value.existingImportId)
        model.openExisting()
        advanceUntilIdle()
        assertEquals("view:imp-old", api.calls.last())
        assertNull(model.state.value.existingImportId)
    }

    @Test
    fun toggleIsOptimisticAndRevertsWhenTheServerFails() = runTest(dispatcher) {
        val start = view(listOf(line("a", "new", true), line("m", "match", false)))
        val api = FakeStatementApi(start)
        val model = vm(api)
        model.setAccount("acc")
        model.setFiles(listOf(UploadFile("x.pdf", byteArrayOf(1))))
        model.upload()
        advanceUntilIdle()
        model.toggleLine(start.lines.first())
        assertFalse(model.state.value.view!!.lines.first().selected)
        advanceUntilIdle()
        assertEquals("line:a:false", api.calls.last())

        api.failNext = IllegalStateException("offline")
        model.toggleLine(model.state.value.view!!.lines.first())
        advanceUntilIdle()
        assertFalse(model.state.value.view!!.lines.first().selected)
        assertEquals("offline", model.state.value.error)

        model.toggleLine(start.lines.last())
        advanceUntilIdle()
        assertEquals("line:a:true", api.calls.last())
    }

    @Test
    fun commitOnlyWhenAllowedThenRefreshesAppData() = runTest(dispatcher) {
        val api = FakeStatementApi(view(listOf(line("a", "new", true)), integrity = false))
        var refreshed = 0
        val model = vm(api) { refreshed++ }
        model.setAccount("acc")
        model.setFiles(listOf(UploadFile("x.pdf", byteArrayOf(1))))
        model.upload()
        advanceUntilIdle()
        model.commit()
        advanceUntilIdle()
        assertFalse(api.calls.any { it.startsWith("commit") })

        api.current = view(listOf(line("a", "new", true)))
        model.setFiles(listOf(UploadFile("y.pdf", byteArrayOf(2))))
        model.upload()
        advanceUntilIdle()
        model.commit()
        advanceUntilIdle()
        assertEquals("commit:imp-1", api.calls.last())
        assertEquals(1, model.state.value.result?.inserted)
        assertEquals(1, refreshed)
    }

    @Test
    fun rejectsUploadsOverTwentyMegabytes() = runTest(dispatcher) {
        val api = FakeStatementApi(view(emptyList()))
        val model = vm(api)
        model.setAccount("acc")
        model.setFiles(listOf(UploadFile("big.pdf", ByteArray(OVER_LIMIT_BYTES))))
        model.upload()
        advanceUntilIdle()
        assertTrue(model.state.value.tooLarge)
        assertTrue(api.calls.isEmpty())
    }
}
