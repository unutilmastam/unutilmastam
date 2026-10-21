<?php
/* ═══════════════════════════════════════════════════════════════
   Unutilmas Ta'm — upload.php

   Vazifasi: ilovadan kelgan rasm/ovoz (base64) faylini shu hosting
   ichidagi /uploads/ papkasiga saqlaydi va faqat qisqa URL qaytaradi.
   Shu bilan localStorage va Firestore ichida katta base64 satrlar
   saqlanmay qoladi — "xotira to'lib qoldi" xatosi butunlay yo'qoladi.

   MUHIM: shu faylni index.html bilan BIR PAPKAGA joylang
   (masalan: public_html/upload.php), chunki JS uni "upload.php"
   nomi bilan, o'sha papkadan chaqiradi.
   ═══════════════════════════════════════════════════════════════ */

// ── SOZLAMA: shu maxfiy so'z js/0-core.js dagi UPLOAD_SECRET bilan
//    AYNAN BIR XIL bo'lishi shart. O'zingiz xohlagan matnga almashtiring.
define('UPLOAD_SECRET', 'unutilmastam-2026-maxfiy-soz-almashtiring');

// ── SOZLAMA: bitta faylning eng katta ruxsat etilgan hajmi (bayt)
// Mahsulot rasmlari endi deyarli asl sifatida yuklanadi, shuning uchun
// chegarani kattalashtirdik (ilgari 6 MB edi).
define('MAX_BYTES', 16 * 1024 * 1024); // 16 MB

// Ba'zi hostinglarda PHP ning o'zi ham so'rov hajmini cheklaydi
// (post_max_size). Mumkin bo'lsa shu yerdan ham kattalashtiramiz —
// hosting buni taqiqlagan bo'lsa, bu qatorlar xato bermasdan e'tiborsiz
// qoldiriladi.
@ini_set('post_max_size', '20M');
@ini_set('memory_limit', '256M');

// ── Ruxsat etilgan papkalar (JS shulardan birini yuboradi)
$ALLOWED_FOLDERS = ['products', 'chat-images', 'chat-audio'];

// ── MIME turi -> fayl kengaytmasi
$MIME_EXT = [
  'image/jpeg' => 'jpg',
  'image/png'  => 'png',
  'image/webp' => 'webp',
  'audio/webm' => 'webm',
  'audio/ogg'  => 'ogg',
  'audio/mpeg' => 'mp3',
  'audio/mp4'  => 'm4a',
];

header('Content-Type: application/json; charset=utf-8');

function fail($msg, $code = 400) {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  fail('Faqat POST so\'rov qabul qilinadi', 405);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!$body) fail('Noto\'g\'ri so\'rov (JSON emas)');

if (!isset($body['key']) || !hash_equals(UPLOAD_SECRET, (string)$body['key'])) {
  fail('Ruxsat yo\'q (maxfiy so\'z xato)', 403);
}

$folder = isset($body['folder']) ? $body['folder'] : '';
if (!in_array($folder, $ALLOWED_FOLDERS, true)) {
  fail('Noma\'lum papka: ' . $folder);
}

$dataUrl = isset($body['data']) ? $body['data'] : '';
if (!preg_match('#^data:([a-zA-Z0-9/+.\-]+);base64,(.+)$#', $dataUrl, $m)) {
  fail('Rasm/ovoz formati noto\'g\'ri (data URL kutilgan edi)');
}

$mime = strtolower($m[1]);
if (!isset($MIME_EXT[$mime])) {
  fail('Ruxsat etilmagan fayl turi: ' . $mime);
}
$ext = $MIME_EXT[$mime];

$binary = base64_decode($m[2], true);
if ($binary === false) fail('Faylni ochib bo\'lmadi (base64 xato)');
if (strlen($binary) > MAX_BYTES) fail('Fayl juda katta (6 MB dan oshmasin)');

// ── Sana bo'yicha kichik papkalarga taqsimlab saqlaymiz (bitta papkada
//    minglab fayl to'planib qolmasligi uchun)
$sub = date('Y/m');
$dir = __DIR__ . '/uploads/' . $folder . '/' . $sub;
if (!is_dir($dir)) {
  if (!mkdir($dir, 0755, true) && !is_dir($dir)) fail('Papka yaratilmadi (huquq yetarli emas)', 500);
}

$filename = date('d') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
$path = $dir . '/' . $filename;

if (file_put_contents($path, $binary) === false) {
  fail('Faylni saqlab bo\'lmadi (papka yozish huquqini tekshiring)', 500);
}

// ── To'liq URL yasaymiz (shu skript qayerda ishlasa, o'sha domendan)
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'];
$base = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
$url = $scheme . '://' . $host . $base . '/uploads/' . $folder . '/' . $sub . '/' . $filename;

echo json_encode(['ok' => true, 'url' => $url], JSON_UNESCAPED_UNICODE);
