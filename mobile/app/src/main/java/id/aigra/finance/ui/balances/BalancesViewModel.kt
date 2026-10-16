package id.aigra.finance.ui.balances

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.aigra.finance.data.Repository
import id.aigra.finance.data.SyncError
import id.aigra.finance.data.local.AccountEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class BalancesViewModel(private val repo: Repository) : ViewModel() {
    private val shared = SharingStarted.WhileSubscribed(5_000)
    val accounts: StateFlow<List<AccountEntity>> = repo.accounts().stateIn(viewModelScope, shared, emptyList())
    val lastSuccessAt: StateFlow<Long?> = repo.lastSuccessAt().stateIn(viewModelScope, shared, null)
    private val _error = MutableStateFlow<SyncError?>(null)
    val error: StateFlow<SyncError?> = _error
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            val e = repo.refreshAccounts().exceptionOrNull() as? SyncError
            if (e is SyncError.Unauthorized) repo.logout()
            _error.value = e
            _refreshing.value = false
        }
    }
}
