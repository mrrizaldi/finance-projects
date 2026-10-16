package com.mrrizaldi.finance

import android.app.Application
import com.mrrizaldi.finance.sync.Sync

class App : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Sync.schedulePeriodic(this)
    }
}
