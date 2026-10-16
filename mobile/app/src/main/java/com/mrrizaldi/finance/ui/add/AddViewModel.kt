package com.mrrizaldi.finance.ui.add

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.SaveStatus
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
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

enum class AddTab { ENTRY, TRANSFER }

data class UiMessage(val res: Int, val arg: String = "")

data class AddForm(
    val tab: AddTab = AddTab.ENTRY,
    val type: String = "expense",
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

internal fun defaultAccounts(accounts: List<AccountEntity>): Pair<String?, String?> {
    val (spend, invest) = accounts.partition { it.type != "investment" }
    val ordered = spend + invest
    val from = ordered.firstOrNull()
    return from?.id to ordered.firstOrNull { it.id != from?.id }?.id
}

class AddViewModel(private val repo: Repository) : ViewModel() {
    private val shared = SharingStarted.WhileSubscribed(5_000)
    val accounts: StateFlow<List<AccountEntity>> = repo.accounts().stateIn(viewModelScope, shared, emptyList())
    val categories: StateFlow<List<CategoryEntity>> = repo.categories().stateIn(viewModelScope, shared, emptyList())

    private val _form = MutableStateFlow(AddForm())
    val form: StateFlow<AddForm> = _form
    private val _message = MutableStateFlow<UiMessage?>(null)
    val message: StateFlow<UiMessage?> = _message

    init {
        viewModelScope.launch {
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
            f.tab == AddTab.ENTRY && f.accountId == null -> R.string.add_err_account
            f.tab == AddTab.TRANSFER && (f.fromAccountId == null || f.toAccountId == null) -> R.string.add_err_account
            f.tab == AddTab.TRANSFER && f.fromAccountId == f.toAccountId -> R.string.add_err_same_account
            f.tab == AddTab.TRANSFER && toAmount != null && toAmount <= 0L -> R.string.add_err_amount
            else -> null
        }
        if (error != null) {
            _message.value = UiMessage(error)
            return
        }
        _form.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = if (f.tab == AddTab.ENTRY) {
                repo.addEntry(
                    account = f.accountId!!,
                    type = f.type,
                    amount = amount,
                    category = f.categoryId,
                    description = f.description.trim().ifBlank { null },
                    merchant = f.merchant.trim().ifBlank { null },
                    date = f.date,
                    time = f.time
                )
            } else {
                val names = accounts.value.associate { it.id to it.name }
                repo.addTransfer(
                    fromAccount = f.fromAccountId!!,
                    toAccount = f.toAccountId!!,
                    amount = amount,
                    toAmount = toAmount,
                    description = f.description.trim().ifBlank { "Transfer ${names[f.fromAccountId]} → ${names[f.toAccountId]}" },
                    date = f.date,
                    time = f.time
                )
            }
            _form.update { it.copy(saving = false) }
            result.onSuccess { status ->
                _form.update { it.copy(amount = "", toAmount = "", description = "", merchant = "") }
                _message.value = UiMessage(if (status == SaveStatus.SENT) R.string.add_saved else R.string.add_saved_offline)
            }.onFailure { e ->
                if (e == SyncError.Unauthorized) repo.logout()
                else _message.value = UiMessage(R.string.add_err_failed, e.message ?: "")
            }
        }
    }
}
