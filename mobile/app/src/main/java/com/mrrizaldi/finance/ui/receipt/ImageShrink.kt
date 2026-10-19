package com.mrrizaldi.finance.ui.receipt

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import com.mrrizaldi.finance.data.remote.UploadFile
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlin.math.roundToInt

private const val MAX_SIDE = 1600
private const val JPEG_QUALITY = 80
private const val HALF = 2
private const val ROTATE_90 = 90f
private const val ROTATE_180 = 180f
private const val ROTATE_270 = 270f
private val PDF_MAGIC = "%PDF".toByteArray()
private val JPEG_MAGIC = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte())

internal fun scaledSize(width: Int, height: Int, maxSide: Int = MAX_SIDE): Pair<Int, Int> {
    val longest = maxOf(width, height)
    if (longest <= maxSide) return width to height
    val ratio = maxSide.toDouble() / longest
    return (width * ratio).roundToInt().coerceAtLeast(1) to (height * ratio).roundToInt().coerceAtLeast(1)
}

private fun ByteArray.startsWith(magic: ByteArray): Boolean =
    size >= magic.size && copyOfRange(0, magic.size).contentEquals(magic)

fun UploadFile.isPdf(): Boolean = bytes.startsWith(PDF_MAGIC)

private fun sampleSizeFor(longest: Int): Int {
    var sample = 1
    while (longest / (sample * HALF) >= MAX_SIDE) sample *= HALF
    return sample
}

private fun orientationOf(bytes: ByteArray): Int =
    runCatching {
        ByteArrayInputStream(bytes).use {
            ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)

private fun Matrix.applyOrientation(orientation: Int) {
    when (orientation) {
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(ROTATE_180)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(ROTATE_90); postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(ROTATE_90)
        ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(ROTATE_270); postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(ROTATE_270)
    }
}

fun shrinkForUpload(file: UploadFile): UploadFile {
    if (file.isPdf()) return file
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return file
    val orientation = orientationOf(file.bytes)
    val upright = orientation == ExifInterface.ORIENTATION_NORMAL || orientation == ExifInterface.ORIENTATION_UNDEFINED
    val longest = maxOf(bounds.outWidth, bounds.outHeight)
    if (longest <= MAX_SIDE && upright && file.bytes.startsWith(JPEG_MAGIC)) return file
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSizeFor(longest) }
    val decoded = BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size, options) ?: return file
    val (targetWidth, _) = scaledSize(decoded.width, decoded.height)
    val matrix = Matrix().apply {
        applyOrientation(orientation)
        val ratio = targetWidth.toFloat() / decoded.width
        if (ratio < 1f) postScale(ratio, ratio)
    }
    val result = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    if (result !== decoded) decoded.recycle()
    val out = ByteArrayOutputStream()
    result.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
    result.recycle()
    return UploadFile(file.name.substringBeforeLast('.') + ".jpg", out.toByteArray())
}
