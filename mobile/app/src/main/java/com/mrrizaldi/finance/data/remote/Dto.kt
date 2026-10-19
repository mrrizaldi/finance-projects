package com.mrrizaldi.finance.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AccountDto(
    val id: String,
    val name: String,
    val type: String,
    val balance: Double = 0.0,
    val color: String? = null,
    val is_active: Boolean = true
)

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val type: String,
    val color: String? = null,
    val budget_monthly: Double? = null,
    val sort_order: Int = 0,
    val is_active: Boolean = true
)

@Serializable
data class TransactionDto(
    val id: String,
    val type: String,
    val amount: Double,
    val transaction_date: String,
    val to_amount: Double? = null,
    val description: String? = null,
    val merchant: String? = null,
    val category_id: String? = null,
    val account_id: String? = null,
    val to_account_id: String? = null,
    val source: String = "manual_web",
    val is_adjustment: Boolean = false,
    val balance_after: Double? = null,
    val created_at: String? = null,
    val category_name: String? = null,
    val category_color: String? = null,
    val account_name: String? = null,
    val to_account_name: String? = null
)

@Serializable
data class SummaryDto(
    val total_income: Double,
    val total_expense: Double,
    val net_cashflow: Double,
    val transaction_count: Long,
    val avg_daily_expense: Double,
    val top_expense_category: String? = null,
    val top_expense_amount: Double = 0.0
)

@Serializable
data class CategoryBreakdownDto(
    val category_id: String,
    val category_name: String,
    val category_color: String? = null,
    val total_amount: Double,
    val transaction_count: Long,
    val percentage: Double
)

@Serializable
data class PeriodComparisonDto(
    val curr_income: Double,
    val curr_expense: Double,
    val curr_net: Double,
    val curr_tx_count: Long,
    val curr_avg_daily: Double,
    val prev_income: Double,
    val prev_expense: Double,
    val prev_net: Double,
    val prev_tx_count: Long,
    val prev_avg_daily: Double
)

@Serializable
data class MonthlyTrendDto(
    val month: String,
    val month_date: String,
    val income: Double,
    val expense: Double,
    val net: Double
)

@Serializable
data class SavingsRateDto(
    val month: String,
    val month_date: String,
    val income: Double,
    val expense: Double,
    val cashflow_rate: Double,
    val investment_contributed: Double,
    val investment_rate: Double
)

@Serializable
data class DailySpendingDto(
    val day: String,
    val daily_expense: Double,
    val cumulative_expense: Double
)

@Serializable
data class TopTransactionDto(
    val id: String,
    val amount: Double,
    val transaction_date: String,
    val description: String? = null,
    val merchant: String? = null,
    val category_name: String? = null,
    val category_color: String? = null
)

@Serializable
data class NotificationDto(
    val id: String,
    val kind: String,
    val title: String,
    val body: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("read_at") val readAt: String? = null,
)
