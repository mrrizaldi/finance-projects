package com.mrrizaldi.finance.ui.analytics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.data.toEntity
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth

data class AnalyticsUiState(
    val month: YearMonth,
    val comparison: PeriodComparisonDto? = null,
    val trend: List<MonthlyTrendDto> = emptyList(),
    val savings: List<SavingsRateDto> = emptyList(),
    val categories: List<CategorySlice> = emptyList(),
    val daily: List<DailySpendingDto> = emptyList(),
    val budgets: List<BudgetLine> = emptyList(),
    val top: List<TransactionEntity> = emptyList(),
    val lastSuccessAt: Long? = null
)

class AnalyticsViewModel(private val repo: Repository) : ViewModel() {
    private val month = MutableStateFlow(JakartaDate.currentMonth())
    private val _error = MutableStateFlow<SyncError?>(null)
    val error: StateFlow<SyncError?> = _error
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    val uiState: StateFlow<AnalyticsUiState> = month.flatMapLatest { m ->
        combine(
            combine(repo.periodComparison(m), repo.monthlyTrend(), repo.savingsRateTrend()) { c, t, s -> Triple(c, t, s) },
            combine(repo.categories(), repo.breakdown(m), repo.dailySpending(m)) { c, b, d -> Triple(c, b, d) },
            repo.topTransactions(m),
            repo.lastSuccessAt()
        ) { (comparison, trend, savings), (categories, breakdown, daily), top, last ->
            AnalyticsUiState(
                month = m,
                comparison = comparison,
                trend = trend,
                savings = savings,
                categories = topWithOthers(breakdown),
                daily = daily,
                budgets = budgetLines(categories, breakdown),
                top = top.map { it.toEntity() },
                lastSuccessAt = last
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AnalyticsUiState(month.value))

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            val e = repo.refreshAnalytics(month.value).exceptionOrNull() as? SyncError
            if (e is SyncError.Unauthorized) repo.logout()
            _error.value = e
            _refreshing.value = false
        }
    }

    fun setMonth(value: YearMonth) {
        month.value = value
        refresh()
    }
}
