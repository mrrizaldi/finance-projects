package id.aigra.finance.util

import kotlin.math.abs

object RupiahFormat {
    fun group(digits: String): String = digits.reversed().chunked(3).joinToString(".").reversed()

    fun format(amount: Long): String {
        val body = group(abs(amount).toString())
        return if (amount < 0) "-Rp $body" else "Rp $body"
    }

    private const val MAX_DIGITS = 13

    private fun significant(raw: String): String = raw.filter { it in '0'..'9' }.trimStart('0')

    fun digitsOf(raw: String): String = significant(raw).take(MAX_DIGITS)

    fun parse(raw: String): Long? {
        if (raw.none { it in '0'..'9' }) return null
        val digits = significant(raw)
        return if (digits.length > MAX_DIGITS) null else digits.toLongOrNull() ?: 0L
    }
}
