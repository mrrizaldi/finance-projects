package com.mrrizaldi.finance.ui.add

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.SaveStatus
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime

enum class AddKind(val type: String?) { EXPENSE("expense"), INCOME("income"), TRANSFER(null) }

data class UiMessage(val res: Int, val arg: String = "")

data class AddForm(
    val kind: AddKind = AddKind.EXPENSE,
    val amount: String = "",
    val accountId: String? = null,
    val categoryId: String? = null,
    val description: String = "",
    val merchant: String = "",
    val fromAccountId: String? = null,
    val toAccountId: String? = null,
    val toAmount: String = "",
    val sameAmount: Boolean = true,
    val date: LocalDate = JakartaDate.today(),
    val time: LocalTime = JakartaDate.now().toLocalTime().withSecond(0).withNano(0),
    val saving: Boolean = false
)

internal fun AddForm.withKind(next: AddKind, categories: List<CategoryEntity>): AddForm {
    val type = next.type ?: return copy(kind = next)
    val fits = categories.firstOrNull { it.id == categoryId }?.type.let { it == type || it == "both" }
    return copy(kind = next, categoryId = if (fits) categoryId else null)
}

internal fun defaultAccounts(accounts: List<AccountEntity>): Pair<String?, String?> {
    val (spend, invest) = accounts.partition { it.type != "investment" }
    val ordered = spend + invest
    val from = ordered.firstOrNull()
    return from?.id to ordered.firstOrNull { it.id != from?.id }?.id
}

internal fun formFor(tx: TransactionEntity): AddForm {
    val at = JakartaDate.atJakarta(tx.transactionDate)
    val kind = when (tx.type) {
        "income" -> AddKind.INCOME
        "transfer" -> AddKind.TRANSFER
        else -> AddKind.EXPENSE
    }
    return AddForm(
        kind = kind,
        amount = tx.amount.toString(),
        accountId = tx.accountId,
        categoryId = tx.categoryId,
        description = tx.description.orEmpty(),
        merchant = tx.merchant.orEmpty(),
        fromAccountId = tx.accountId,
        toAccountId = tx.toAccountId,
        toAmount = tx.toAmount?.toString().orEmpty(),
        sameAmount = tx.toAmount == null,
        date = at.toLocalDate(),
        time = at.toLocalTime().withSecond(0).withNano(0)
    )
}

class AddViewModel(private val repo: Repository, private val editId: String? = null) : ViewModel() {
    val editing: Boolean get() = editId != null
    private val shared = SharingStarted.WhileSubscribed(5_000)
    val accounts: StateFlow<List<AccountEntity>> = repo.accounts().stateIn(viewModelScope, shared, emptyList())
    val categories: StateFlow<List<CategoryEntity>> = repo.categories().stateIn(viewModelScope, shared, emptyList())

    private val _form = MutableStateFlow(AddForm())
    val form: StateFlow<AddForm> = _form
    private val _message = MutableStateFlow<UiMessage?>(null)
    val message: StateFlow<UiMessage?> = _message
    private val _done = MutableStateFlow(false)
    val done: StateFlow<Boolean> = _done

    init {
        viewModelScope.launch {
            editId?.let { id -> repo.transaction(id)?.let { tx -> _form.value = formFor(tx) } }
            repo.refreshAccounts()
            repo.refreshCategories()
        }
    }

    fun edit(block: AddForm.() -> AddForm) = _form.update(block)

    fun consumeMessage() {
        _message.value = null
    }

    fun save() {
        val f = _form.value
        if (f.saving) return
        val amount = RupiahFormat.parse(f.amount) ?: 0L
        val toAmount = if (f.sameAmount) null else RupiahFormat.parse(f.toAmount) ?: 0L
        val error = when {
            amount <= 0L -> R.string.add_err_amount
            f.kind != AddKind.TRANSFER && f.accountId == null -> R.string.add_err_account
            f.kind == AddKind.TRANSFER && (f.fromAccountId == null || f.toAccountId == null) -> R.string.add_err_account
            f.kind == AddKind.TRANSFER && f.fromAccountId == f.toAccountId -> R.string.add_err_same_account
            f.kind == AddKind.TRANSFER && toAmount != null && toAmount <= 0L -> R.string.add_err_amount
            else -> null
        }
        if (error != null) {
            _message.value = UiMessage(error)
            return
        }
        val transfer = f.kind == AddKind.TRANSFER
        val names = accounts.value.associate { it.id to it.name }
        val description = f.description.trim().ifBlank {
            if (transfer) "Transfer ${names[f.fromAccountId]} → ${names[f.toAccountId]}" else null
        }
        val merchant = f.merchant.trim().ifBlank { null }
        _form.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = when {
                editId != null -> repo.updateTransaction(
                    id = editId,
                    type = f.kind.type ?: "transfer",
                    amount = amount,
                    account = (if (transfer) f.fromAccountId else f.accountId)!!,
                    toAccount = if (transfer) f.toAccountId else null,
                    toAmount = if (transfer) toAmount else null,
                    category = if (transfer) null else f.categoryId,
                    description = description,
                    merchant = if (transfer) null else merchant,
                    date = f.date,
                    time = f.time
                ).map { SaveStatus.SENT }
                !transfer -> repo.addEntry(
                    account = f.accountId!!,
                    type = f.kind.type!!,
                    amount = amount,
                    category = f.categoryId,
                    description = description,
                    merchant = merchant,
                    date = f.date,
                    time = f.time
                )
                else -> repo.addTransfer(
                    fromAccount = f.fromAccountId!!,
                    toAccount = f.toAccountId!!,
                    amount = amount,
                    toAmount = toAmount,
                    description = description,
                    date = f.date,
                    time = f.time
                )
            }
            _form.update { it.copy(saving = false) }
            result.onSuccess { status ->
                if (editId != null) {
                    _done.value = true
                } else {
                    _form.update { it.copy(amount = "", toAmount = "", description = "", merchant = "") }
                    _message.value = UiMessage(if (status == SaveStatus.SENT) R.string.add_saved else R.string.add_saved_offline)
                }
            }.onFailure { e -> fail(e) }
        }
    }

    fun delete() {
        val id = editId ?: return
        if (_form.value.saving) return
        _form.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = repo.deleteTransaction(id)
            _form.update { it.copy(saving = false) }
            result.onSuccess { _done.value = true }.onFailure { e -> fail(e) }
        }
    }

    private suspend fun fail(e: Throwable) {
        when (e) {
            SyncError.Unauthorized -> repo.logout()
            SyncError.Offline -> _message.value = UiMessage(R.string.edit_err_offline)
            else -> _message.value = UiMessage(R.string.add_err_failed, e.message ?: "")
        }
    }
}
