package com.mrrizaldi.finance.ui.receipt

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.mrrizaldi.finance.data.remote.UploadFile
import java.io.ByteArrayOutputStream
import kotlin.math.roundToInt

private const val MAX_SIDE = 1600
private const val JPEG_QUALITY = 80
private val PDF_MAGIC = "%PDF".toByteArray()

internal fun scaledSize(width: Int, height: Int, maxSide: Int = MAX_SIDE): Pair<Int, Int> {
    val longest = maxOf(width, height)
    if (longest <= maxSide) return width to height
    val ratio = maxSide.toDouble() / longest
    return (width * ratio).roundToInt().coerceAtLeast(1) to (height * ratio).roundToInt().coerceAtLeast(1)
}

fun UploadFile.isPdf(): Boolean = bytes.size >= PDF_MAGIC.size && bytes.copyOfRange(0, PDF_MAGIC.size).contentEquals(PDF_MAGIC)

fun shrinkForUpload(file: UploadFile): UploadFile {
    if (file.isPdf()) return file
    val bitmap = BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size) ?: return file
    val (width, height) = scaledSize(bitmap.width, bitmap.height)
    val scaled = if (width == bitmap.width) bitmap else Bitmap.createScaledBitmap(bitmap, width, height, true)
    val out = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
    return UploadFile(file.name.substringBeforeLast('.') + ".jpg", out.toByteArray())
}
