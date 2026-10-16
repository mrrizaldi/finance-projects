package id.aigra.finance.util

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

object JakartaDate {
    val zone: ZoneId = ZoneId.of("Asia/Jakarta")
    private val isoDate = DateTimeFormatter.ISO_LOCAL_DATE
    private val isoOffset = DateTimeFormatter.ISO_OFFSET_DATE_TIME

    fun now(): ZonedDateTime = ZonedDateTime.now(zone)

    fun today(now: Instant = Instant.now()): LocalDate = now.atZone(zone).toLocalDate()

    fun currentMonth(now: Instant = Instant.now()): YearMonth = YearMonth.from(now.atZone(zone))

    fun monthStart(month: YearMonth): String = month.atDay(1).format(isoDate)

    fun monthEnd(month: YearMonth): String = month.atEndOfMonth().format(isoDate)

    fun dateKey(timestamp: String): String =
        OffsetDateTime.parse(timestamp).atZoneSameInstant(zone).toLocalDate().format(isoDate)

    fun parseKey(key: String): LocalDate = LocalDate.parse(key, isoDate)

    fun toTimestamp(date: LocalDate, time: LocalTime): String =
        date.atTime(time).atZone(zone).toOffsetDateTime().format(isoOffset)

    fun nextDayStart(key: String): String = toTimestamp(parseKey(key).plusDays(1), LocalTime.MIDNIGHT)

    fun formatDay(date: LocalDate, locale: Locale): String =
        date.format(DateTimeFormatter.ofPattern("d MMM yyyy", locale))

    fun formatMonth(month: YearMonth, locale: Locale): String =
        month.format(DateTimeFormatter.ofPattern("MMMM yyyy", locale))

    fun formatTimestamp(timestamp: String, locale: Locale): String =
        OffsetDateTime.parse(timestamp).atZoneSameInstant(zone)
            .format(DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", locale))

    fun formatMillis(epochMillis: Long, locale: Locale): String =
        Instant.ofEpochMilli(epochMillis).atZone(zone)
            .format(DateTimeFormatter.ofPattern("d MMM HH:mm", locale))
}
