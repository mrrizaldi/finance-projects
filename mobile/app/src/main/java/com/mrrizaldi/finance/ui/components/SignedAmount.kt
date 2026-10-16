package com.mrrizaldi.finance.ui.components

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle

fun signedAmount(text: String): AnnotatedString = buildAnnotatedString {
    val signs = text.takeWhile { it == '-' || it == '+' }
    withStyle(SpanStyle(fontFeatureSettings = "")) { append(signs) }
    append(text.drop(signs.length))
}
