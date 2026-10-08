<?php
$logFile = "logs.txt";
$msg = str_replace(["\n", "\r"], '', $_GET["msg"] ?? "Sin mensaje");

$entry = "[" . date("Y-m-d H:i:s") . "] " . $msg . "\n";

file_put_contents($logFile, $entry, FILE_APPEND);

echo "OK";
?>
