package com.mrrizaldi.finance.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

object AppIcons {
    private const val THIN = 1.8f
    private const val BOLD = 2.2f

    private val HOME = listOf("M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z")
    private val LIST = listOf(
        "M8 6h12M8 12h12M8 18h12",
        "M3.1 6a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0-1.8 0",
        "M3.1 12a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0-1.8 0",
        "M3.1 18a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0-1.8 0"
    )
    private val WALLET = listOf(
        "M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z",
        "M20 10h-4a2 2 0 0 0 0 4h4"
    )
    private val CHART = listOf("M4 20h16", "M7 16v-4", "M12 16V6", "M17 16V9")

    private fun icon(name: String, stroke: Float, paths: List<String>): ImageVector =
        paths.fold(ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)) { builder, d ->
            builder.addPath(
                pathData = addPathNodes(d),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = stroke,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            )
        }.build()

    val Home = icon("home", THIN, HOME)
    val HomeActive = icon("home_active", BOLD, HOME)
    val List = icon("list", THIN, LIST)
    val ListActive = icon("list_active", BOLD, LIST)
    val Wallet = icon("wallet", THIN, WALLET)
    val WalletActive = icon("wallet_active", BOLD, WALLET)
    val Chart = icon("chart", THIN, CHART)
    val ChartActive = icon("chart_active", BOLD, CHART)
    val Settings = icon(
        "settings",
        THIN,
        listOf("M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z", "M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0")
    )
    val Plus = icon("plus", BOLD, listOf("M12 5v14M5 12h14"))
    val Filter = icon("filter", THIN, listOf("M4 7h16M7 12h10M10 17h4"))
    val Back = icon("back", BOLD, listOf("M15 5l-7 7 7 7"))
    val Trash = icon("trash", THIN, listOf("M5 7h14", "M9 7V4.5h6V7", "M7 7l1 13h8l1-13", "M10 11v5M14 11v5"))
    val ChevronDown = icon("chevron-down", THIN, listOf("M6 9l6 6 6-6"))
    val Check = icon("check", BOLD, listOf("M5 12.5l4.5 4.5L19 7"))
    val Search = icon("search", THIN, listOf("M16.5 10.5a6 6 0 1 1-12 0a6 6 0 1 1 12 0", "M15 15l5 5"))
    val Calendar = icon(
        "calendar",
        THIN,
        listOf("M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "M4 10h16M8 4v4M16 4v4")
    )
}
