package com.mrrizaldi.finance.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth
import kotlin.math.roundToLong

data class BudgetItem(val name: String, val color: String?, val spent: Long, val limit: Long)

data class HomeUiState(
    val month: YearMonth,
    val totalBalance: Long = 0,
    val income: Long = 0,
    val expense: Long = 0,
    val budget: List<BudgetItem> = emptyList(),
    val recent: List<TransactionEntity> = emptyList(),
    val lastSuccessAt: Long? = null
)

class HomeViewModel(private val repo: Repository) : ViewModel() {
    private val month = MutableStateFlow(JakartaDate.currentMonth())
    private val _error = MutableStateFlow<SyncError?>(null)
    val error: StateFlow<SyncError?> = _error
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    val uiState: StateFlow<HomeUiState> = month.flatMapLatest { m ->
        combine(
            combine(repo.accounts(), repo.summary(m), repo.breakdown(m)) { a, s, b -> Triple(a, s, b) },
            combine(repo.categories(), repo.recent(5), repo.lastSuccessAt()) { c, r, t -> Triple(c, r, t) }
        ) { (accounts, summary, breakdown), (categories, recent, last) ->
            HomeUiState(
                month = m,
                totalBalance = accounts.sumOf { it.balance },
                income = summary?.total_income?.roundToLong() ?: 0L,
                expense = summary?.total_expense?.roundToLong() ?: 0L,
                budget = budgetItems(categories, breakdown),
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

    private fun budgetItems(categories: List<CategoryEntity>, breakdown: List<CategoryBreakdownDto>): List<BudgetItem> =
        categories.filter { (it.budgetMonthly ?: 0L) > 0L }.map { c ->
            val spent = breakdown.firstOrNull { it.category_id == c.id }?.total_amount?.roundToLong() ?: 0L
            BudgetItem(c.name, c.color, spent, c.budgetMonthly ?: 1L)
        }.sortedByDescending { it.spent.toDouble() / it.limit }.take(3)
}
