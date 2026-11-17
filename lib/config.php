<?php
declare(strict_types=1);

/**
 * Zentrale Konfiguration.
 * Lokale Überschreibungen (z. B. ADMIN_KEY) gehören in lib/config.local.php,
 * die nicht ins Repository eingecheckt wird.
 */
$config = [
    // Pfad zur SQLite-Datei – der Ordner db/ muss für den Webserver-Benutzer beschreibbar sein
    'db_path'   => dirname(__DIR__) . '/db/anmeldung.sqlite',

    // Schlüssel für Verwaltungs-Endpunkte (Header: X-Admin-Key).
    // Leer = Verwaltungs-Endpunkte gesperrt.
    'admin_key' => getenv('ANMELDUNG_ADMIN_KEY') ?: '',

    // Fehlerdetails an den Client ausgeben (nur in der Entwicklung!)
    'debug'     => getenv('ANMELDUNG_DEBUG') === '1',
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace($config, require $local);
}

return $config;
