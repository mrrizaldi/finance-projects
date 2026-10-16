package com.mrrizaldi.finance.ui.analytics

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.patrykandpatrick.vico.compose.cartesian.CartesianChartHost
import com.patrykandpatrick.vico.compose.cartesian.Zoom
import com.patrykandpatrick.vico.compose.cartesian.axis.HorizontalAxis
import com.patrykandpatrick.vico.compose.cartesian.axis.VerticalAxis
import com.patrykandpatrick.vico.compose.cartesian.axis.rememberAxisLabelComponent
import com.patrykandpatrick.vico.compose.cartesian.data.CartesianChartModel
import com.patrykandpatrick.vico.compose.cartesian.data.CartesianValueFormatter
import com.patrykandpatrick.vico.compose.cartesian.data.ColumnCartesianLayerModel
import com.patrykandpatrick.vico.compose.cartesian.data.LineCartesianLayerModel
import com.patrykandpatrick.vico.compose.cartesian.layer.CartesianLayerPadding
import com.patrykandpatrick.vico.compose.cartesian.layer.ColumnCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.layer.LineCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberColumnCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberLine
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberLineCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.rememberCartesianChart
import com.patrykandpatrick.vico.compose.cartesian.rememberVicoScrollState
import com.patrykandpatrick.vico.compose.cartesian.rememberVicoZoomState
import com.patrykandpatrick.vico.compose.common.Fill
import com.patrykandpatrick.vico.compose.common.ProvideVicoTheme
import com.patrykandpatrick.vico.compose.common.component.TextComponent
import com.patrykandpatrick.vico.compose.common.component.rememberLineComponent
import com.patrykandpatrick.vico.compose.common.component.rememberShapeComponent
import com.patrykandpatrick.vico.compose.common.data.ExtraStore
import com.patrykandpatrick.vico.compose.m3.common.rememberM3VicoTheme
import kotlin.math.roundToInt

private val ChartHeight = 180.dp

private val BarShape = RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp)

private data class HighlightPoints(
    private val selectedX: Set<Double>,
    private val normal: LineCartesianLayer.Point,
    private val selected: LineCartesianLayer.Point
) : LineCartesianLayer.PointProvider {
    override fun getPoint(entry: LineCartesianLayerModel.Entry, extraStore: ExtraStore): LineCartesianLayer.Point =
        if (entry.x in selectedX) selected else normal

    override fun getLargestPoint(extraStore: ExtraStore): LineCartesianLayer.Point = selected
}

@Composable
private fun ChartTheme(content: @Composable () -> Unit) {
    ProvideVicoTheme(
        rememberM3VicoTheme(lineColor = LocalGlass.current.divider, textColor = LocalPalette.current.textMute),
        content
    )
}

@Composable
private fun axisLabel(): TextComponent =
    rememberAxisLabelComponent(style = AppType.rowMeta.copy(color = LocalPalette.current.textMute, fontSize = 10.sp))

@Composable
private fun monthAxis(rows: Int, labels: List<String>, label: TextComponent) = HorizontalAxis.rememberBottom(
    line = null,
    label = label,
    valueFormatter = remember(labels) {
        CartesianValueFormatter { _, value, _ -> labels.getOrElse(value.roundToInt()) { "" } }
    },
    tick = null,
    guideline = null,
    itemPlacer = remember(rows) {
        val step = (rows + 5) / 6
        HorizontalAxis.ItemPlacer.aligned(spacing = { step }, offset = { (rows - 1) % step })
    }
)

@Composable
internal fun TrendChart(rows: List<MonthlyTrendDto>, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val suffix = stringResource(R.string.analytics_million)
    val labels = remember(rows, locale) { rows.map { shortMonth(it.month_date, locale) } }
    val model = remember(rows) {
        CartesianChartModel(
            ColumnCartesianLayerModel.build {
                series(rows.map { it.income })
                series(rows.map { it.expense })
            }
        )
    }
    ChartTheme {
        val label = axisLabel()
        val chart = rememberCartesianChart(
            rememberColumnCartesianLayer(
                columnProvider = ColumnCartesianLayer.ColumnProvider.series(
                    rememberLineComponent(fill = Fill(p.positive), thickness = 6.dp, shape = BarShape),
                    rememberLineComponent(fill = Fill(p.negative), thickness = 6.dp, shape = BarShape)
                ),
                columnCollectionSpacing = 10.dp,
                mergeMode = { ColumnCartesianLayer.MergeMode.Grouped(columnSpacing = 2.dp) }
            ),
            startAxis = VerticalAxis.rememberStart(
                line = null,
                label = label,
                valueFormatter = remember(suffix, locale) {
                    CartesianValueFormatter { _, value, _ -> formatMillions(value, suffix, locale) }
                },
                tick = null,
                itemPlacer = remember { VerticalAxis.ItemPlacer.count(count = { 4 }) }
            ),
            bottomAxis = monthAxis(rows.size, labels, label)
        )
        CartesianChartHost(
            chart = chart,
            model = model,
            modifier = modifier,
            scrollState = rememberVicoScrollState(scrollEnabled = false),
            zoomState = rememberVicoZoomState(zoomEnabled = false, initialZoom = Zoom.Content),
            chartAreaHeight = ChartHeight
        )
    }
}

@Composable
internal fun SavingsChart(rows: List<SavingsRateDto>, selected: Set<Int>, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val labels = remember(rows, locale) { rows.map { shortMonth(it.month_date, locale) } }
    val model = remember(rows) {
        CartesianChartModel(LineCartesianLayerModel.build { series(rows.map { it.cashflow_rate }) })
    }
    ChartTheme {
        val label = axisLabel()
        val normal = LineCartesianLayer.Point(rememberShapeComponent(fill = Fill(p.primary), shape = CircleShape), 6.dp)
        val big = LineCartesianLayer.Point(
            rememberShapeComponent(
                fill = Fill(p.primary),
                shape = CircleShape,
                strokeFill = Fill(p.surface),
                strokeThickness = 2.dp
            ),
            12.dp
        )
        val chart = rememberCartesianChart(
            rememberLineCartesianLayer(
                LineCartesianLayer.LineProvider.series(
                    LineCartesianLayer.rememberLine(
                        fill = remember(p.primary) { LineCartesianLayer.LineFill.single(Fill(p.primary)) },
                        stroke = LineCartesianLayer.LineStroke.Continuous(thickness = 2.dp, cap = StrokeCap.Round),
                        pointProvider = remember(selected, normal, big) {
                            HighlightPoints(selected.map { it.toDouble() }.toSet(), normal, big)
                        }
                    )
                )
            ),
            startAxis = VerticalAxis.rememberStart(
                line = null,
                label = label,
                valueFormatter = remember { CartesianValueFormatter { _, value, _ -> "${value.roundToInt()}%" } },
                tick = null,
                itemPlacer = remember { VerticalAxis.ItemPlacer.count(count = { 4 }) }
            ),
            bottomAxis = monthAxis(rows.size, labels, label),
            layerPadding = remember { { CartesianLayerPadding(unscalableEnd = 8.dp) } }
        )
        CartesianChartHost(
            chart = chart,
            model = model,
            modifier = modifier,
            scrollState = rememberVicoScrollState(scrollEnabled = false),
            zoomState = rememberVicoZoomState(zoomEnabled = false, initialZoom = Zoom.Content),
            chartAreaHeight = ChartHeight
        )
    }
}
