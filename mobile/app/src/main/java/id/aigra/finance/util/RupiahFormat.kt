package id.aigra.finance.util

import kotlin.math.abs

object RupiahFormat {
    fun group(digits: String): String = digits.reversed().chunked(3).joinToString(".").reversed()

    fun format(amount: Long): String {
        val body = group(abs(amount).toString())
        return if (amount < 0) "-Rp $body" else "Rp $body"
    }

    fun digitsOf(raw: String): String = raw.filter { it.isDigit() }.trimStart('0')

    fun parse(raw: String): Long = digitsOf(raw).toLongOrNull() ?: 0L
}
