<?php
// Hostinger Frontend Gateway
if (file_exists(__DIR__ . '/public_html/index.html')) {
    include __DIR__ . '/public_html/index.html';
    exit;
}
if (file_exists(__DIR__ . '/index.html')) {
    include __DIR__ . '/index.html';
    exit;
}
header('Content-Type: text/plain; charset=utf-8');
echo 'PaddleSafe Frontend';

