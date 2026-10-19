package com.mrrizaldi.finance.ui.receipt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.NewReceiptTransaction
import com.mrrizaldi.finance.data.remote.ReceiptApi
import com.mrrizaldi.finance.data.remote.ReceiptCandidateDto
import com.mrrizaldi.finance.data.remote.ReceiptDraftDto
import com.mrrizaldi.finance.data.remote.ReceiptFileDto
import com.mrrizaldi.finance.data.remote.ReceiptLineDto
import com.mrrizaldi.finance.data.remote.StatementApiException
import com.mrrizaldi.finance.data.remote.UploadFile
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import kotlin.math.roundToLong

enum class ReceiptBusy { LOADING, UPLOADING, SAVING, DELETING }

data class ReceiptState(
    val transactionId: String? = null,
    val parentAmount: Long? = null,
    val parentCategoryId: String? = null,
    val receiptId: String? = null,
    val exists: Boolean = false,
    val editing: Boolean = false,
    val merchant: String? = null,
    val purchasedAt: String? = null,
    val printedTotal: Long? = null,
    val totalOk: Boolean = true,
    val extractionError: String? = null,
    val lines: List<ReceiptLine> = emptyList(),
    val lineKeys: List<Long> = emptyList(),
    val nextKey: Long = 0,
    val files: List<ReceiptFileDto> = emptyList(),
    val candidates: List<ReceiptCandidateDto> = emptyList(),
    val chosenCandidateId: String? = null,
    val createNew: Boolean = false,
    val newAccountId: String? = null,
    val newAmount: String = "",
    val newCategoryId: String? = null,
    val busy: ReceiptBusy? = null,
    val error: String? = null,
    val errorRes: Int? = null,
    val noticeRes: Int? = null,
    val done: Boolean = false
) {
    private val chosen: ReceiptCandidateDto? get() = candidates.firstOrNull { it.id == chosenCandidateId }

    val effectiveParentAmount: Long? get() = when {
        transactionId != null -> parentAmount
        createNew -> newAmount.toLongOrNull()
        else -> chosen?.amount?.roundToLong()
    }

    val effectiveParentCategoryId: String? get() = when {
        transactionId != null -> parentCategoryId
        createNew -> newCategoryId
        else -> chosen?.category_id
    }

    val canSave: Boolean get() {
        if (busy != null || lines.none { it.kind == KIND_ITEM && it.amount > 0 }) return false
        return when {
            transactionId != null -> true
            createNew -> newAccountId != null && (newAmount.toLongOrNull() ?: 0L) > 0L
            else -> chosen != null
        }
    }

    fun withLines(new: List<ReceiptLine>): ReceiptState =
        copy(lines = new, lineKeys = List(new.size) { nextKey + it }, nextKey = nextKey + new.size)

    fun withoutLine(index: Int): ReceiptState =
        copy(lines = lines.filterIndexed { i, _ -> i != index }, lineKeys = lineKeys.filterIndexed { i, _ -> i != index })

    fun withAddedLine(line: ReceiptLine): ReceiptState =
        copy(lines = lines + line, lineKeys = lineKeys + nextKey, nextKey = nextKey + 1)

    fun withDraft(draft: ReceiptDraftDto): ReceiptState {
        val lines = draft.lines.map { it.toLine() }
        val total = draft.receipt.printed_total?.roundToLong() ?: lines.sumOf { it.amount }.takeIf { it > 0 }
        val first = draft.candidates.firstOrNull()
        val dominant = lines.filter { it.kind == KIND_ITEM && it.categoryId != null }.groupBy { it.categoryId }
            .maxByOrNull { (_, group) -> group.sumOf { it.amount } }?.key
        return copy(
            receiptId = draft.receipt.id,
            editing = true,
            merchant = draft.receipt.merchant,
            purchasedAt = draft.receipt.purchased_at,
            printedTotal = draft.receipt.printed_total?.roundToLong(),
            totalOk = draft.totalOk,
            extractionError = draft.extractionError,
            candidates = draft.candidates,
            chosenCandidateId = if (transactionId == null) first?.id else null,
            createNew = transactionId == null && first == null,
            newAmount = total?.toString() ?: "",
            newCategoryId = dominant
        ).withLines(lines)
    }
}

fun ReceiptLineDto.toLine() = ReceiptLine(kind, name, qty, amount.roundToLong(), category_id)

fun ReceiptLine.toDto() = ReceiptLineDto(kind, name, qty, amount.toDouble(), categoryId)

fun signedAdjustment(kind: String, magnitude: Long, previous: Long): Long = when (kind) {
    "discount" -> -magnitude
    "rounding" -> if (previous < 0) -magnitude else magnitude
    else -> magnitude
}

private const val CONFLICT = 409
private const val BAD_REQUEST = 400
private const val NOT_FOUND = 404
private const val TOO_LARGE = 413
private const val UNSUPPORTED = 415
private const val BYTES_PER_KB = 1024
private const val MAX_PDF_MB = 10
private const val MAX_PDF_BYTES = MAX_PDF_MB * BYTES_PER_KB * BYTES_PER_KB

internal fun receiptErrorRes(status: Int, upload: Boolean): Int = when (status) {
    CONFLICT -> if (upload) R.string.receipt_err_processing else R.string.receipt_err_has_breakdown
    BAD_REQUEST -> R.string.receipt_err_invalid
    NOT_FOUND -> R.string.receipt_err_not_found
    TOO_LARGE -> R.string.receipt_err_too_large
    UNSUPPORTED -> R.string.receipt_err_unsupported
    else -> R.string.receipt_err_failed
}

class ReceiptViewModel(
    private val api: ReceiptApi,
    accounts: Flow<List<AccountEntity>>,
    categories: Flow<List<CategoryEntity>>,
    transactionId: String?,
    private val loadParent: suspend (String) -> TransactionEntity?,
    private val shrinkDispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val onSaved: () -> Unit
) : ViewModel() {
    private val _state = MutableStateFlow(ReceiptState(transactionId = transactionId))
    val state: StateFlow<ReceiptState> = _state.asStateFlow()
    private var pendingUploads: List<UploadFile> = emptyList()

    val accounts: StateFlow<List<AccountEntity>> = accounts.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val categories: StateFlow<List<CategoryEntity>> = categories
        .map { list -> list.filter { it.type == "expense" || it.type == "both" } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        if (transactionId != null) load(transactionId)
    }

    private fun failed(state: ReceiptState, e: Exception, upload: Boolean = false): ReceiptState {
        val res = when (e) {
            is IOException -> R.string.receipt_offline
            is StatementApiException -> receiptErrorRes(e.status, upload)
            else -> R.string.receipt_err_failed
        }
        return state.copy(busy = null, error = null, errorRes = res)
    }

    private fun load(transactionId: String) {
        _state.update { it.copy(transactionId = transactionId, busy = ReceiptBusy.LOADING) }
        viewModelScope.launch {
            try {
                val parent = loadParent(transactionId)
                _state.update { it.copy(parentAmount = parent?.amount, parentCategoryId = parent?.categoryId) }
                val view = api.byTransaction(transactionId)
                _state.update {
                    if (view == null) it.copy(busy = null)
                    else it.copy(
                        busy = null, exists = true, editing = true, receiptId = view.receipt.id,
                        merchant = view.receipt.merchant, purchasedAt = view.receipt.purchased_at,
                        printedTotal = view.receipt.printed_total?.roundToLong(), files = view.files
                    ).withLines(view.lines.map { line -> line.toLine() })
                }
            } catch (e: Exception) {
                _state.update { failed(it, e) }
            }
            val queued = pendingUploads
            pendingUploads = emptyList()
            upload(queued)
        }
    }

    fun upload(files: List<UploadFile>) {
        if (files.isEmpty()) return
        if (_state.value.busy == ReceiptBusy.LOADING) {
            pendingUploads = files
            return
        }
        if (_state.value.busy != null) return
        if (files.any { it.isPdf() && it.bytes.size > MAX_PDF_BYTES }) {
            _state.update { it.copy(errorRes = R.string.receipt_pdf_too_large, error = null) }
            return
        }
        _state.update { it.copy(busy = ReceiptBusy.UPLOADING, error = null, errorRes = null, noticeRes = null) }
        viewModelScope.launch {
            try {
                val shrunk = withContext(shrinkDispatcher) { files.map(::shrinkForUpload) }
                val draft = api.upload(shrunk)
                _state.update { it.withDraft(draft).copy(busy = null) }
            } catch (e: StatementApiException) {
                val existing = e.existingTransactionId
                if (e.status == CONFLICT && existing != null) {
                    _state.update { it.copy(busy = null, noticeRes = R.string.receipt_notice_existing) }
                    load(existing)
                } else {
                    _state.update { failed(it, e, upload = true) }
                }
            } catch (e: Exception) {
                _state.update { failed(it, e, upload = true) }
            }
        }
    }

    fun startManual() = _state.update { it.copy(editing = true).withLines(listOf(ReceiptLine(KIND_ITEM, "", 1.0, 0, null))) }

    fun chooseCandidate(id: String?) = _state.update { it.copy(chosenCandidateId = id, createNew = id == null) }

    fun editNew(change: ReceiptState.() -> ReceiptState) = _state.update { it.change() }

    fun updateLine(index: Int, line: ReceiptLine) =
        _state.update { it.copy(lines = it.lines.toMutableList().also { list -> list[index] = line }) }

    fun removeLine(index: Int) = _state.update { it.withoutLine(index) }

    fun addItem() = _state.update { it.withAddedLine(ReceiptLine(KIND_ITEM, "", 1.0, 0, null)) }

    fun save() {
        val s = _state.value
        if (!s.canSave) return
        _state.update { it.copy(busy = ReceiptBusy.SAVING, error = null, errorRes = null) }
        viewModelScope.launch {
            try {
                val target = s.transactionId ?: if (s.createNew) null else s.chosenCandidateId
                val fresh = if (target == null) NewReceiptTransaction(
                    account_id = requireNotNull(s.newAccountId),
                    amount = s.newAmount.toLong(),
                    category_id = s.newCategoryId,
                    merchant = s.merchant,
                    transaction_date = s.purchasedAt ?: JakartaDate.now().toOffsetDateTime().toString()
                ) else null
                api.save(s.receiptId, target, fresh, s.lines.filter { it.amount != 0L }.map { it.toDto() })
                onSaved()
                _state.update { it.copy(busy = null, done = true) }
            } catch (e: Exception) {
                _state.update { failed(it, e) }
            }
        }
    }

    fun delete() {
        val id = _state.value.receiptId ?: return
        _state.update { it.copy(busy = ReceiptBusy.DELETING, error = null, errorRes = null) }
        viewModelScope.launch {
            try {
                api.delete(id)
                onSaved()
                _state.update { it.copy(busy = null, done = true) }
            } catch (e: Exception) {
                _state.update { failed(it, e) }
            }
        }
    }
}
