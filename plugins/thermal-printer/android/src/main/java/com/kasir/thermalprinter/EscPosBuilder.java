package com.kasir.thermalprinter;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;

/**
 * Builder ESC/POS untuk printer thermal.
 *
 * Mendukung 58mm (32 kolom) dan 80mm (48 kolom).
 * Semua metode mengembalikan this sehingga bisa di-chain.
 *
 * Contoh:
 *   byte[] bytes = new EscPosBuilder(58)
 *       .init()
 *       .alignCenter().boldOn().doubleSizeOn()
 *       .text("TOKO AN\n")
 *       .doubleSizeOff().boldOff()
 *       .divider()
 *       .feedAndCut()
 *       .build();
 */
public class EscPosBuilder {

    private final ByteArrayOutputStream buf = new ByteArrayOutputStream(512);

    /**
     * Jumlah karakter per baris.
     * 58mm → 32 kolom, 80mm → 48 kolom.
     */
    private final int cols;

    public EscPosBuilder(int paperWidthMm) {
        this.cols = paperWidthMm <= 58 ? 32 : 48;
    }

    /** Jumlah kolom saat ini. */
    public int getCols() { return cols; }

    // ── Inisialisasi ──────────────────────────────────────────────────────────

    /** ESC @ — reset printer ke kondisi awal. */
    public EscPosBuilder init() {
        raw(0x1B, 0x40);
        return this;
    }

    // ── Alignment ─────────────────────────────────────────────────────────────

    public EscPosBuilder alignLeft()   { raw(0x1B, 0x61, 0x00); return this; }
    public EscPosBuilder alignCenter() { raw(0x1B, 0x61, 0x01); return this; }
    public EscPosBuilder alignRight()  { raw(0x1B, 0x61, 0x02); return this; }

    // ── Format teks ───────────────────────────────────────────────────────────

    /** ESC E — bold on/off. */
    public EscPosBuilder boldOn()  { raw(0x1B, 0x45, 0x01); return this; }
    public EscPosBuilder boldOff() { raw(0x1B, 0x45, 0x00); return this; }

    /**
     * GS ! — double width + double height (0x11).
     * Matikan dengan doubleSizeOff() setelah dipakai.
     */
    public EscPosBuilder doubleSizeOn()  { raw(0x1D, 0x21, 0x11); return this; }
    public EscPosBuilder doubleSizeOff() { raw(0x1D, 0x21, 0x00); return this; }

    // ── Teks & baris ─────────────────────────────────────────────────────────

    /**
     * Tulis string mentah (UTF-8).
     * Gunakan "\n" untuk pindah baris.
     */
    public EscPosBuilder text(String s) {
        if (s == null) return this;
        try { buf.write(s.getBytes("UTF-8")); }
        catch (IOException ignored) {}
        return this;
    }

    /** Line feed. */
    public EscPosBuilder newline() { raw(0x0A); return this; }

    // ── Divider ───────────────────────────────────────────────────────────────

    /** Baris penuh dari tanda '-'. */
    public EscPosBuilder divider() {
        return text(repeat('-', cols)).newline();
    }

    /** Baris penuh dari tanda '='. */
    public EscPosBuilder doubleDivider() {
        return text(repeat('=', cols)).newline();
    }

    // ── Layout dua kolom ─────────────────────────────────────────────────────

    /**
     * Baris dua kolom: kiri rata kiri, kanan rata kanan.
     * Total lebar = cols. Kanan maksimal cols/2 karakter.
     *
     * Contoh (32 cols):
     *   twoColumn("Nasi Goreng      2 x 15.000", "30.000")
     *   → "Nasi Goreng  2 x 15.000 30.000"
     */
    public EscPosBuilder twoColumn(String left, String right) {
        if (right == null) right = "";
        if (left  == null) left  = "";

        int rightLen = Math.min(right.length(), cols / 2);
        int leftMax  = cols - rightLen - 1;

        String l = left.length()  <= leftMax  ? left  : left.substring(0,  leftMax);
        String r = right.length() <= rightLen ? right : right.substring(0, rightLen);

        int pad = cols - l.length() - r.length();
        return text(l + repeat(' ', Math.max(1, pad)) + r).newline();
    }

    /**
     * Satu baris rata kanan penuh.
     */
    public EscPosBuilder rightText(String s) {
        if (s == null) s = "";
        int pad = Math.max(0, cols - s.length());
        return text(repeat(' ', pad) + s).newline();
    }

    // ── Feed & cut ────────────────────────────────────────────────────────────

    /**
     * Feed 4 baris lalu partial cut.
     * Selalu panggil di akhir dokumen sebelum mengirim bytes ke printer.
     */
    public EscPosBuilder feedAndCut() {
        raw(0x1B, 0x64, 0x04); // ESC d 4 — feed 4 lines
        raw(0x1D, 0x56, 0x41, 0x03); // GS V A 3 — partial cut
        return this;
    }

    // ── Build ─────────────────────────────────────────────────────────────────

    /** Kembalikan byte array lengkap siap dikirim ke printer. */
    public byte[] build() {
        return buf.toByteArray();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void raw(int... bytes) {
        for (int b : bytes) buf.write(b);
    }

    private static String repeat(char c, int n) {
        if (n <= 0) return "";
        char[] arr = new char[n];
        Arrays.fill(arr, c);
        return new String(arr);
    }
}
