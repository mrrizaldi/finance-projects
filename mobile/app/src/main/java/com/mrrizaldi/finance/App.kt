package com.mrrizaldi.finance

import android.app.Application
import androidx.lifecycle.ProcessLifecycleOwner
import com.mrrizaldi.finance.sync.Sync

class App : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Sync.schedulePeriodic(this)
        ProcessLifecycleOwner.get().lifecycle.addObserver(container.lock)
    }
}
