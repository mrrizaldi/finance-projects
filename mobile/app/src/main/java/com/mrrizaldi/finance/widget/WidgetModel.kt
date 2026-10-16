package com.mrrizaldi.finance.widget

import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.util.RupiahFormat
import kotlin.math.roundToLong

data class WidgetModel(val total: String, val expense: String, val syncedAt: Long?)

fun widgetModel(accounts: List<AccountEntity>, summary: SummaryDto?, lastSuccessAt: Long?): WidgetModel =
    WidgetModel(
        total = RupiahFormat.format(accounts.sumOf { it.balance }),
        expense = RupiahFormat.format(summary?.total_expense?.roundToLong() ?: 0L),
        syncedAt = lastSuccessAt
    )
