package com.healthtrack.app

import android.app.Application
import com.healthtrack.app.data.Network
import com.healthtrack.app.data.Repository
import com.healthtrack.app.data.TokenStore

class HealthTrackApp : Application() {
    // Manual DI keeps the project dependency-light; swap for Hilt if desired.
    lateinit var repository: Repository
        private set

    override fun onCreate() {
        super.onCreate()
        val tokens = TokenStore(this)
        repository = Repository(Network.create(tokens), tokens, contentResolver)
    }
}
