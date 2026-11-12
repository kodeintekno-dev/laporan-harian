# Staff Kodein

Situs internal sekolah tempat pegawai mengirim laporan kerja harian. Pengiriman laporan sekaligus mencatat kepulangan pegawai.

## Pengguna

**Staff**:
Seluruh pegawai sekolah yang punya akun. Setiap Staff bisa memiliki satu hingga tiga Jabatan.
_Avoid_: Pegawai, karyawan, user, guru

**Admin**:
Satu-satunya pengelola sistem. Melihat semua laporan, mengelola akun Staff, menandai Tidak Hadir, dan membuat Koreksi. Tidak mengirim Laporan Harian.
_Avoid_: Superadmin, administrator, pengelola

**Staff Aktif**:
Staff yang akunnya boleh login dan masuk hitungan rekap. Akun Staff tidak dihapus, hanya dinonaktifkan.
_Avoid_: Staff terdaftar

**Pendaftar**:
Orang yang sudah masuk lewat Google tetapi belum disetujui Admin. Belum dihitung sebagai Staff dan belum bisa mengirim Laporan Harian.
_Avoid_: Calon, pendaftar baru, pending

**Password Cadangan**:
Password opsional yang dibuat Staff sendiri untuk masuk dengan nomor telepon ketika Google tidak tersedia. Bisa dihapus Admin kapan saja.
_Avoid_: Password sementara, password default, password cadangan wajib

**Pengenal**:
Nama yang dipakai untuk menampilkan seorang Staff di Rekap, riwayat, dan ekspor. Diambil dari Display Name bila ada, kalau tidak dari email.
_Avoid_: Username, nama panggilan, identitas

**Jabatan**:
Peran atau posisi seorang Staff di sekolah. Satu Staff bisa memegang satu hingga tiga Jabatan sekaligus. Daftar Jabatan bersifat tetap (14 pilihan) dan hanya bisa diubah Admin. Jabatan bersifat opsional — Staff tanpa Jabatan tetap bisa mengirim laporan. Jabatan ditampilkan di ekspor CSV sebagai satu sel, dipisah titik-koma.
_Avoid_: Divisi, departemen, role, posisi

## Laporan

**Laporan Harian**:
Catatan kerja satu Staff untuk satu tanggal. Mengirimnya juga berarti Staff keluar. Setiap Staff punya paling banyak satu per tanggal.
_Avoid_: Absensi, absen, check-out, laporan kerja

**Item Tugas**:
Satu baris uraian pekerjaan di dalam Laporan Harian.
_Avoid_: Tugas, task, kegiatan

**Catatan**:
Kolom teks opsional di Laporan Harian di luar daftar Item Tugas.
_Avoid_: Keterangan, komentar

**Waktu Keluar**:
Waktu Laporan Harian dikirim oleh Staff pada hari yang sama. Hanya ada untuk laporan yang Staff kirim sendiri.
_Avoid_: Jam pulang, waktu absen

**Diisi Admin**:
Penanda untuk Laporan Harian yang dibuat Admin atas nama Staff, biasanya untuk tanggal lampau. Tidak punya Waktu Keluar.
_Avoid_: Laporan susulan, laporan terlambat

**Tanggal Laporan**:
Tanggal kalender WIB yang dilaporkan oleh sebuah Laporan Harian. Pergantian tanggal terjadi pukul 00:00 WIB.
_Avoid_: Hari laporan

## Kehadiran dan koreksi

**Tidak Hadir**:
Penanda dari Admin bahwa seorang Staff tidak bekerja pada suatu tanggal. Saling meniadakan dengan Laporan Harian pada tanggal yang sama.
_Avoid_: Absen, bolos

**Kategori Tidak Hadir**:
Alasan tetap pada tanda Tidak Hadir: Sakit, Izin, Cuti, atau Tanpa Keterangan.
_Avoid_: Alpa, jenis absen

**Belum Mengirim**:
Status Staff yang wajib mengirim Laporan Harian pada suatu tanggal tetapi belum melakukannya dan tidak ditandai Tidak Hadir.
_Avoid_: Kosong, alpa

**Staff Piket**:
Staff yang mengirim Laporan Harian pada Sabtu atau Minggu.
_Avoid_: Lembur

**Koreksi**:
Perubahan Admin pada Laporan Harian atau tanda Tidak Hadir, termasuk pembuatan laporan untuk tanggal lampau dan pencabutan tanda. Selalu berisi alasan dan tersimpan beserta isi sebelum dan sesudahnya. Laporan tidak pernah dihapus.
_Avoid_: Edit, revisi, perbaikan

**Dibatalkan**:
Status Laporan Harian yang ditiadakan oleh Admin lewat Koreksi. Barisnya tetap tersimpan, tetapi tidak tampil di Rekap, riwayat, maupun ekspor, dan Staff tidak bisa mengirim ulang untuk tanggal itu.
_Avoid_: Dihapus, ditarik

**Rekap**:
Tampilan Admin atas status semua Staff Aktif pada satu tanggal.
_Avoid_: Dashboard, ringkasan
