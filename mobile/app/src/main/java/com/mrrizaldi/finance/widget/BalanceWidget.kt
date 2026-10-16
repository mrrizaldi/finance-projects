package com.mrrizaldi.finance.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.mrrizaldi.finance.App
import com.mrrizaldi.finance.MainActivity
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.theme.DarkPalette
import com.mrrizaldi.finance.ui.theme.LightPalette
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first

class BalanceWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = (context.applicationContext as App).container.repository
        val state = combine(
            repo.accounts(),
            repo.summary(JakartaDate.currentMonth()),
            repo.lastSuccessAt()
        ) { accounts, summary, last -> widgetModel(accounts, summary, last) }
        val initial = state.first()
        provideContent {
            val model by state.collectAsState(initial)
            WidgetBody(context, model)
        }
    }
}

class BalanceWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BalanceWidget()
}

@Composable
private fun WidgetBody(context: Context, model: WidgetModel) {
    val locale = context.resources.configuration.locales[0]
    val mute = ColorProvider(LightPalette.textMute, DarkPalette.textMute)
    Column(
        GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .cornerRadius(24.dp)
            .background(ColorProvider(LightPalette.surface, DarkPalette.surface))
            .padding(16.dp)
            .clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            context.getString(R.string.home_total_balance),
            style = TextStyle(color = mute, fontSize = 12.sp),
            maxLines = 1
        )
        Text(
            model.total,
            style = TextStyle(
                color = ColorProvider(LightPalette.textHi, DarkPalette.textHi),
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            ),
            maxLines = 1
        )
        Spacer(GlanceModifier.height(6.dp))
        Text(
            context.getString(R.string.widget_expense, model.expense),
            style = TextStyle(
                color = ColorProvider(LightPalette.negative, DarkPalette.negative),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            ),
            maxLines = 1
        )
        Text(
            model.syncedAt?.let { context.getString(R.string.widget_synced, JakartaDate.formatMillis(it, locale)) }
                ?: context.getString(R.string.widget_never),
            style = TextStyle(color = mute, fontSize = 11.sp),
            maxLines = 1
        )
    }
}
