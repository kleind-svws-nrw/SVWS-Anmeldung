<?php
// CLI: legt die Datenbank an bzw. migriert sie (npm run db:init)
declare(strict_types=1);
require __DIR__ . '/db.php';
$config = require __DIR__ . '/config.php';
$pdo = db($config);
echo 'Datenbank bereit: ' . $config['db_path'] . ' (Schema v' . $pdo->query('PRAGMA user_version')->fetchColumn() . ")\n";
