package com.mrrizaldi.finance

import com.mrrizaldi.finance.data.remote.NotificationDto
import com.mrrizaldi.finance.sync.markerAfter
import org.junit.Assert.assertEquals
import org.junit.Test

class NotifPollTest {
    private fun dto(id: String, createdAt: String) =
        NotificationDto(id = id, kind = "tx_baru", title = "t", body = "b", createdAt = createdAt, readAt = null)

    private val base = "2026-10-19T00:00:00Z"
    private val rows = listOf(
        dto("1", "2026-10-19T01:00:00Z"),
        dto("2", "2026-10-19T02:00:00Z"),
        dto("3", "2026-10-19T03:00:00Z"),
    )

    @Test
    fun `tidak ada yang tampil penanda tidak berubah`() {
        assertEquals(base, markerAfter(rows, emptySet(), base))
    }

    @Test
    fun `daftar kosong mempertahankan penanda lama`() {
        assertEquals(base, markerAfter(emptyList(), emptySet(), base))
    }

    @Test
    fun `sebagian tampil penanda berhenti sebelum yang gagal`() {
        assertEquals("2026-10-19T02:00:00Z", markerAfter(rows, setOf("1", "2"), base))
    }

    @Test
    fun `yang gagal di tengah tidak dilompati`() {
        assertEquals("2026-10-19T01:00:00Z", markerAfter(rows, setOf("1", "3"), base))
    }

    @Test
    fun `semua tampil penanda maju ke terbaru`() {
        assertEquals("2026-10-19T03:00:00Z", markerAfter(rows, setOf("1", "2", "3"), base))
    }

    @Test
    fun `urutan masukan tidak berpengaruh`() {
        assertEquals("2026-10-19T03:00:00Z", markerAfter(rows.reversed(), setOf("1", "2", "3"), base))
    }
}
