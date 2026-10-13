<?php
// Fallback para LiteSpeed / Apache en Hostinger si el servidor web prioriza DirectoryIndex con PHP
if (file_exists(__DIR__ . '/index.html')) {
    include __DIR__ . '/index.html';
    exit;
}
header('Content-Type: text/plain; charset=utf-8');
echo 'PaddleSafe Frontend';
