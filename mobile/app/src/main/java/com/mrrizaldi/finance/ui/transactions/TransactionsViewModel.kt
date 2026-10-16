package com.mrrizaldi.finance.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.TxFilter
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.YearMonth

class TransactionsViewModel(private val repo: Repository) : ViewModel() {
    private val _filter = MutableStateFlow(TxFilter(JakartaDate.currentMonth()))
    val filter: StateFlow<TxFilter> = _filter
    private val _error = MutableStateFlow<SyncError?>(null)
    val error: StateFlow<SyncError?> = _error
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    private val shared = SharingStarted.WhileSubscribed(5_000)

    val items: StateFlow<List<TransactionEntity>> =
        _filter.flatMapLatest { repo.transactions(it) }.stateIn(viewModelScope, shared, emptyList())
    val accounts: StateFlow<List<AccountEntity>> = repo.accounts().stateIn(viewModelScope, shared, emptyList())
    val categories: StateFlow<List<CategoryEntity>> = repo.categories().stateIn(viewModelScope, shared, emptyList())
    val lastSuccessAt: StateFlow<Long?> = repo.lastSuccessAt().stateIn(viewModelScope, shared, null)

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            val e = repo.refreshTransactions(_filter.value.month).exceptionOrNull() as? SyncError
            if (e is SyncError.Unauthorized) repo.logout()
            _error.value = e
            _refreshing.value = false
        }
    }

    fun setMonth(month: YearMonth) {
        _filter.update { it.copy(month = month) }
        refresh()
    }

    fun setSearch(query: String) = _filter.update { it.copy(search = query.trim().ifBlank { null }) }

    fun setFilter(type: String?, accountId: String?, categoryId: String?) =
        _filter.update { it.copy(type = type, accountId = accountId, categoryId = categoryId) }

    fun resetFilter() = _filter.update { TxFilter(month = it.month, search = it.search) }
}
