package com.mrrizaldi.finance.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import id.aigra.finance.R

val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold)
)

private val base = Typography()

private fun TextStyle.inter() = copy(fontFamily = Inter)

val FinanceTypography = Typography(
    displayLarge = base.displayLarge.inter(),
    displayMedium = base.displayMedium.inter(),
    displaySmall = base.displaySmall.inter(),
    headlineLarge = base.headlineLarge.inter(),
    headlineMedium = base.headlineMedium.inter(),
    headlineSmall = base.headlineSmall.inter(),
    titleLarge = base.titleLarge.inter(),
    titleMedium = base.titleMedium.inter(),
    titleSmall = base.titleSmall.inter(),
    bodyLarge = base.bodyLarge.inter(),
    bodyMedium = base.bodyMedium.inter(),
    bodySmall = base.bodySmall.inter(),
    labelLarge = base.labelLarge.inter(),
    labelMedium = base.labelMedium.inter(),
    labelSmall = base.labelSmall.inter()
)

object AppType {
    val balance = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.SemiBold,
        fontSize = 40.sp,
        lineHeight = 48.sp,
        letterSpacing = (-1).sp,
        fontFeatureSettings = "tnum"
    )
    val screenTitle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp)
    val rowAmount = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
        fontFeatureSettings = "tnum"
    )
    val rowTitle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp)
    val rowMeta = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontFeatureSettings = "tnum"
    )
    val sectionLabel = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.5.sp,
        fontFeatureSettings = "tnum"
    )
}
