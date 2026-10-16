package com.mrrizaldi.finance.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth
import kotlin.math.roundToLong

data class HomeUiState(
    val month: YearMonth,
    val totalBalance: Long = 0,
    val income: Long = 0,
    val expense: Long = 0,
    val netChange: Long? = null,
    val budgetSpent: Long = 0,
    val budgetLimit: Long = 0,
    val recent: List<TransactionEntity> = emptyList(),
    val lastSuccessAt: Long? = null
)

internal fun netChange(current: SummaryDto?, previous: SummaryDto?): Long? =
    if (current == null || previous == null) null else (current.net_cashflow - previous.net_cashflow).roundToLong()

internal fun countUpValue(from: Long, to: Long, progress: Float): Long =
    from + ((to - from) * progress.toDouble()).roundToLong()

class HomeViewModel(private val repo: Repository) : ViewModel() {
    private val month = MutableStateFlow(JakartaDate.currentMonth())
    private val _error = MutableStateFlow<SyncError?>(null)
    val error: StateFlow<SyncError?> = _error
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing
    val pendingCount: StateFlow<Int> =
        repo.outbox().map { it.size }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val uiState: StateFlow<HomeUiState> = month.flatMapLatest { m ->
        combine(
            combine(repo.accounts(), repo.summary(m), repo.previousSummary(m)) { a, s, ps -> Triple(a, s, ps) },
            combine(repo.categories(), repo.breakdown(m), repo.recent(5)) { c, b, r -> Triple(c, b, r) },
            repo.lastSuccessAt()
        ) { (accounts, summary, previous), (categories, breakdown, recent), last ->
            val budgeted = categories.filter { (it.budgetMonthly ?: 0L) > 0L }
            HomeUiState(
                month = m,
                totalBalance = accounts.sumOf { it.balance },
                income = summary?.total_income?.roundToLong() ?: 0L,
                expense = summary?.total_expense?.roundToLong() ?: 0L,
                netChange = netChange(summary, previous),
                budgetSpent = budgeted.sumOf { c ->
                    breakdown.firstOrNull { it.category_id == c.id }?.total_amount?.roundToLong() ?: 0L
                },
                budgetLimit = budgeted.sumOf { it.budgetMonthly ?: 0L },
                recent = recent,
                lastSuccessAt = last
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState(month.value))

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            val e = repo.refreshHome(month.value).exceptionOrNull() as? SyncError
            if (e is SyncError.Unauthorized) repo.logout()
            _error.value = e
            _refreshing.value = false
        }
    }

    fun setMonth(value: YearMonth) {
        month.value = value
        refresh()
    }

    fun logout() {
        viewModelScope.launch { repo.logout() }
    }
}
