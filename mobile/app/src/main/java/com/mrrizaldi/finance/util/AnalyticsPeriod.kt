package com.mrrizaldi.finance.util

import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class AnalyticsPeriod(val trendMonths: Int) { WEEK(8), MONTH(12), QUARTER(12), YEAR(24) }

data class PeriodBounds(
    val period: AnalyticsPeriod,
    val start: LocalDate,
    val end: LocalDate,
    val prevStart: LocalDate,
    val prevEnd: LocalDate
) {
    fun shift(steps: Long): PeriodBounds = periodBounds(period, period.step(start, steps))

    fun covers(month: YearMonth): Boolean = month in YearMonth.from(start)..YearMonth.from(end)

    fun label(locale: Locale): String = when (period) {
        AnalyticsPeriod.WEEK ->
            start.format(DateTimeFormatter.ofPattern("d MMM", locale)) + " – " +
                end.format(DateTimeFormatter.ofPattern("d MMM yyyy", locale))
        AnalyticsPeriod.MONTH -> JakartaDate.formatMonth(YearMonth.from(start), locale)
        AnalyticsPeriod.QUARTER -> "Q${(start.monthValue - 1) / 3 + 1} ${start.year}"
        AnalyticsPeriod.YEAR -> start.year.toString()
    }
}

private fun AnalyticsPeriod.step(date: LocalDate, steps: Long): LocalDate = when (this) {
    AnalyticsPeriod.WEEK -> date.plusWeeks(steps)
    AnalyticsPeriod.MONTH -> date.plusMonths(steps)
    AnalyticsPeriod.QUARTER -> date.plusMonths(3 * steps)
    AnalyticsPeriod.YEAR -> date.plusYears(steps)
}

fun periodBounds(period: AnalyticsPeriod, anchor: LocalDate): PeriodBounds {
    val start = when (period) {
        AnalyticsPeriod.WEEK -> anchor.minusDays(anchor.dayOfWeek.value - 1L)
        AnalyticsPeriod.MONTH -> anchor.withDayOfMonth(1)
        AnalyticsPeriod.QUARTER -> LocalDate.of(anchor.year, (anchor.monthValue - 1) / 3 * 3 + 1, 1)
        AnalyticsPeriod.YEAR -> anchor.withDayOfYear(1)
    }
    return PeriodBounds(period, start, period.step(start, 1).minusDays(1), period.step(start, -1), start.minusDays(1))
}
