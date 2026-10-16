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
import com.mrrizaldi.finance.util.AnalyticsPeriod
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.PeriodBounds
import com.mrrizaldi.finance.util.periodBounds
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class AnalyticsUiState(
    val bounds: PeriodBounds,
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
    private val bounds = MutableStateFlow(periodBounds(AnalyticsPeriod.MONTH, JakartaDate.today()))
    private val _error = MutableStateFlow<SyncError?>(null)
    val error: StateFlow<SyncError?> = _error
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    val uiState: StateFlow<AnalyticsUiState> = bounds.flatMapLatest { b ->
        val months = b.period.trendMonths
        combine(
            combine(repo.periodComparison(b), repo.monthlyTrend(months), repo.savingsRateTrend(months)) { c, t, s ->
                Triple(c, t, s)
            },
            combine(repo.categories(), repo.breakdown(b), repo.dailySpending(b)) { c, d, e -> Triple(c, d, e) },
            repo.topTransactions(b),
            repo.lastSuccessAt()
        ) { (comparison, trend, savings), (categories, breakdown, daily), top, last ->
            AnalyticsUiState(
                bounds = b,
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
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AnalyticsUiState(bounds.value))

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            val e = repo.refreshAnalytics(bounds.value).exceptionOrNull() as? SyncError
            if (e is SyncError.Unauthorized) repo.logout()
            _error.value = e
            _refreshing.value = false
        }
    }

    fun setPeriod(period: AnalyticsPeriod) {
        bounds.value = periodBounds(period, JakartaDate.today())
        refresh()
    }

    fun shift(steps: Long) {
        bounds.value = bounds.value.shift(steps)
        refresh()
    }
}
