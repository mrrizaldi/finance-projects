package com.mrrizaldi.finance.ui.analytics

import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

enum class Tone { GOOD, BAD, NEUTRAL }

enum class BudgetState { OK, WARN, OVER }

data class CategorySlice(val name: String?, val color: String?, val amount: Long, val share: Float)

data class BudgetLine(val name: String, val spent: Long, val limit: Long) {
    val ratio: Float get() = if (limit <= 0L) 0f else spent.toFloat() / limit
    val state: BudgetState get() = budgetState(spent, limit)
}

internal fun percentChange(current: Double, previous: Double): Double? =
    if (previous == 0.0) null else (current - previous) / abs(previous) * 100.0

internal fun toneOf(change: Double?, higherIsGood: Boolean): Tone = when {
    change == null || change == 0.0 -> Tone.NEUTRAL
    (change > 0.0) == higherIsGood -> Tone.GOOD
    else -> Tone.BAD
}

private fun decimal(pattern: String, locale: Locale): DecimalFormat =
    DecimalFormat(pattern, DecimalFormatSymbols.getInstance(locale)).apply { roundingMode = RoundingMode.HALF_UP }

internal fun formatChange(change: Double, locale: Locale): String =
    (if (change >= 0.0) "▲ " else "▼ ") + decimal("#,##0.0", locale).format(abs(change)) + "%"

internal fun formatShare(share: Float, locale: Locale): String =
    decimal("0.0", locale).format(share * 100.0) + "%"

internal fun formatMillions(value: Double, suffix: String, locale: Locale): String =
    if (value == 0.0) "0" else decimal("#,##0.#", locale).format(value / 1_000_000.0) + " " + suffix

internal fun topWithOthers(rows: List<CategoryBreakdownDto>, keep: Int = 6): List<CategorySlice> {
    val sorted = rows.filter { it.total_amount > 0.0 }.sortedByDescending { it.total_amount }
    val total = sorted.sumOf { it.total_amount }
    if (total <= 0.0) return emptyList()
    val head = sorted.take(keep).map {
        CategorySlice(it.category_name, it.category_color, it.total_amount.roundToLong(), (it.total_amount / total).toFloat())
    }
    val rest = sorted.drop(keep).sumOf { it.total_amount }
    return if (rest > 0.0) head + CategorySlice(null, null, rest.roundToLong(), (rest / total).toFloat()) else head
}

internal fun intensity(amount: Double, max: Double): Float =
    if (amount <= 0.0 || max <= 0.0) 0f else (amount / max).toFloat().coerceIn(0f, 1f)

internal fun weeksOf(start: LocalDate, end: LocalDate): List<List<LocalDate?>> =
    generateSequence(start.minusDays(start.dayOfWeek.value - 1L)) { it.plusWeeks(1) }
        .takeWhile { it <= end }
        .map { monday -> (0L..6L).map { d -> monday.plusDays(d).takeIf { it in start..end } } }
        .toList()

internal fun formatDayDetail(date: LocalDate, amount: String, locale: Locale): String =
    date.format(DateTimeFormatter.ofPattern("EEE, d MMM", locale)) + " · " + amount

internal fun shortMonth(monthDate: String, locale: Locale): String =
    LocalDate.parse(monthDate).format(DateTimeFormatter.ofPattern("MMM", locale))

internal fun budgetState(spent: Long, limit: Long): BudgetState = when {
    spent > limit -> BudgetState.OVER
    spent * 5 > limit * 4 -> BudgetState.WARN
    else -> BudgetState.OK
}

internal fun budgetLines(categories: List<CategoryEntity>, breakdown: List<CategoryBreakdownDto>): List<BudgetLine> {
    val spent = breakdown.associate { it.category_id to it.total_amount.roundToLong() }
    return categories
        .filter { (it.budgetMonthly ?: 0L) > 0L }
        .map { BudgetLine(it.name, spent[it.id] ?: 0L, it.budgetMonthly ?: 0L) }
        .sortedByDescending { it.ratio }
}
